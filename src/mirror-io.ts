/**
 * LOCAL_MIRROR_PATH support for graph-view interop (v2 feature).
 *
 * When LOCAL_MIRROR_PATH is set, remote-memory persists the **active project's**
 * graph to a local JSONL file using the anthropic memory MCP's canonical line
 * format (with optional createdAt/updatedAt metadata extensions). graph-view
 * reads and writes that same file directly, so the user gets a UI on top of a
 * remote-memory backed graph without graph-view needing to know about GitHub.
 *
 * Project semantics:
 *   - The mirror reflects exactly one project at a time — the currently active one.
 *   - On switch_project, the mirror is rewritten with the new project's graph
 *     and the baseline sidecar's `project` field is updated.
 *   - Per-call `project` overrides (e.g. read_graph({project:"blog"})) do not
 *     touch the mirror.
 *
 * Safety properties (mirrored from graph-view's memory-io.ts):
 *   - atomic write via .tmp + rename
 *   - mtime check immediately before rename (rejects writes that would clobber
 *     external changes from graph-view)
 *   - load-on-mtime-change hook to pick up graph-view's writes
 *
 * JSONL line format:
 *   {"type":"entity","name":"...","entityType":"...","observations":[...],
 *    "createdAt":"...","updatedAt":"..."}
 *   {"type":"relation","from":"...","to":"...","relationType":"...","createdAt":"..."}
 *
 * Unknown fields are silently dropped on read, matching anthropic's
 * forward-compat policy.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Entity, Relation, MemoryGraph, MemoryGraphManager } from './memory-graph.js';

export class MirrorExternalChangeError extends Error {
  constructor(public current: number, public expected: number) {
    super(
      `Mirror file changed externally before write (expected mtime ${expected}, current ${current})`
    );
    this.name = 'MirrorExternalChangeError';
  }
}

interface ParsedGraph {
  entities: Map<string, Entity>;
  relations: Relation[];
}

function parseJsonl(text: string): ParsedGraph {
  const entities = new Map<string, Entity>();
  const relations: Relation[] = [];
  const now = new Date().toISOString();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Mirror parse failed at line ${i + 1}: ${(e as Error).message}`);
    }
    if (parsed?.type === 'entity') {
      const name = String(parsed.name ?? '');
      if (!name) continue;
      const entity: Entity = {
        name,
        entityType: String(parsed.entityType ?? 'unknown'),
        observations: Array.isArray(parsed.observations)
          ? parsed.observations.map((x: unknown) => String(x))
          : [],
        // If the mirror was authored by graph-view (which may omit metadata),
        // backfill timestamps so remote-memory's listing/sorting still works.
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
      };
      entities.set(entity.name, entity);
    } else if (parsed?.type === 'relation') {
      const from = String(parsed.from ?? '');
      const to = String(parsed.to ?? '');
      const relationType = String(parsed.relationType ?? '');
      if (!from || !to || !relationType) continue;
      relations.push({
        from,
        to,
        relationType,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
      });
    }
    // unknown types: silent skip
  }

  return { entities, relations };
}

function serializeJsonl(graph: { entities: Map<string, Entity>; relations: Relation[] }): string {
  const lines: string[] = [];
  // anthropic convention: entities first, relations second.
  for (const e of graph.entities.values()) {
    const out: Record<string, unknown> = {
      type: 'entity',
      name: e.name,
      entityType: e.entityType,
      observations: e.observations,
    };
    if (e.createdAt) out.createdAt = e.createdAt;
    if (e.updatedAt) out.updatedAt = e.updatedAt;
    lines.push(JSON.stringify(out));
  }
  for (const r of graph.relations) {
    const out: Record<string, unknown> = {
      type: 'relation',
      from: r.from,
      to: r.to,
      relationType: r.relationType,
    };
    if (r.createdAt) out.createdAt = r.createdAt;
    lines.push(JSON.stringify(out));
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : '';
}

export interface SyncBaseline {
  /** Project name this baseline refers to. Mirror always represents one project. */
  project: string;
  /** GitHub blob SHA observed at last successful pull/push for this project. */
  remoteSha: string;
  /** digestGraph of in-memory state at last successful pull/push. */
  mirrorDigest: string;
}

export class MirrorManager {
  private lastSeenMtime = 0;

  constructor(
    public readonly filePath: string,
    private memoryManager: MemoryGraphManager
  ) {}

  private get sidecarPath(): string {
    return `${this.filePath}.sync-state.json`;
  }

  exists(): Promise<boolean> {
    return fs
      .access(this.filePath)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Load the mirror file into the in-memory graph. The graph is replaced
   * wholesale. Use during bootstrap (when the mirror already exists) or
   * inside maybeReload() (when an external writer has updated the mirror).
   */
  async loadIntoMemory(): Promise<void> {
    const text = await fs.readFile(this.filePath, 'utf-8');
    const stat = await fs.stat(this.filePath);
    const parsed = parseJsonl(text);
    const next: MemoryGraph = {
      entities: parsed.entities,
      relations: parsed.relations,
      metadata: {
        version: '1.0.0',
        lastModified: new Date(stat.mtimeMs).toISOString(),
        lastSync: new Date().toISOString(),
      },
    };
    this.memoryManager.loadGraph(next);
    this.lastSeenMtime = Math.floor(stat.mtimeMs);
  }

  /**
   * If the mirror file's mtime differs from what we last observed, reload
   * the in-memory graph from disk. Cheap fast path when nothing changed.
   *
   * Called at the start of every active-project tool handler.
   */
  async maybeReload(): Promise<boolean> {
    let stat;
    try {
      stat = await fs.stat(this.filePath);
    } catch {
      // File disappeared. Treat as no-op; next write will recreate.
      return false;
    }
    const current = Math.floor(stat.mtimeMs);
    if (current === this.lastSeenMtime) return false;
    await this.loadIntoMemory();
    return true;
  }

  /**
   * Serialize the current in-memory graph and atomically replace the mirror
   * file. Verifies mtime hasn't changed since the last observation right
   * before the rename, throwing MirrorExternalChangeError if it has — the
   * caller should roll back its in-memory mutation in that case.
   */
  async writeMirror(): Promise<void> {
    // Pre-rename check: another writer (e.g. graph-view) may have intervened
    // since our last reload. If so, refuse to clobber.
    try {
      const stat = await fs.stat(this.filePath);
      const current = Math.floor(stat.mtimeMs);
      if (this.lastSeenMtime !== 0 && current !== this.lastSeenMtime) {
        throw new MirrorExternalChangeError(current, this.lastSeenMtime);
      }
    } catch (e) {
      if (e instanceof MirrorExternalChangeError) throw e;
      // File missing — first write of a fresh mirror. Make sure dir exists.
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    }

    const graph = this.memoryManager.getGraph();
    const text = serializeJsonl({ entities: graph.entities, relations: graph.relations });

    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
      await fs.writeFile(tmpPath, text, 'utf-8');
      await fs.rename(tmpPath, this.filePath);
    } catch (e) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        /* ignore */
      }
      throw e;
    }

    const newStat = await fs.stat(this.filePath);
    this.lastSeenMtime = Math.floor(newStat.mtimeMs);
  }

  /**
   * Sync-state sidecar persistence. Used by SyncManager to remember the
   * GitHub SHA + graph digest + project at the last successful pull/push, so
   * that divergence (both sides changed) can be detected across process
   * restarts. Sidecar lives next to the mirror file; graph-view never reads
   * or writes it.
   */
  async readBaseline(): Promise<SyncBaseline | null> {
    try {
      const text = await fs.readFile(this.sidecarPath, 'utf-8');
      const parsed = JSON.parse(text);
      if (
        typeof parsed?.project === 'string' &&
        typeof parsed?.remoteSha === 'string' &&
        typeof parsed?.mirrorDigest === 'string'
      ) {
        return {
          project: parsed.project,
          remoteSha: parsed.remoteSha,
          mirrorDigest: parsed.mirrorDigest,
        };
      }
    } catch {
      /* missing or invalid — treat as no baseline */
    }
    return null;
  }

  async writeBaseline(baseline: SyncBaseline): Promise<void> {
    const text = JSON.stringify(
      { ...baseline, writtenAt: new Date().toISOString() },
      null,
      2
    );
    const tmp = `${this.sidecarPath}.tmp.${process.pid}.${Date.now()}`;
    try {
      await fs.writeFile(tmp, text, 'utf-8');
      await fs.rename(tmp, this.sidecarPath);
    } catch (e) {
      try {
        await fs.unlink(tmp);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  /**
   * Compute a stable digest of the current graph's logical content. Used by
   * sync-manager's divergence guard to detect "mirror has diverged from
   * last-pull baseline".
   *
   * Order-independent so equivalent graphs hash to the same value.
   */
  static digestGraph(graph: MemoryGraph): string {
    const entLines: string[] = [];
    for (const e of graph.entities.values()) {
      entLines.push(
        JSON.stringify({
          name: e.name,
          entityType: e.entityType,
          observations: e.observations,
        })
      );
    }
    entLines.sort();
    const relLines: string[] = [];
    for (const r of graph.relations) {
      relLines.push(JSON.stringify({ from: r.from, to: r.to, relationType: r.relationType }));
    }
    relLines.sort();
    return hashString(entLines.join('|') + '##' + relLines.join('|'));
  }
}

function hashString(s: string): string {
  // Lightweight 32-bit FNV-1a. Not cryptographic — only need stable equality.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function resolveMirrorPath(): string | null {
  const env = process.env.LOCAL_MIRROR_PATH;
  if (!env || !env.trim()) return null;
  return path.isAbsolute(env) ? env : path.resolve(env);
}
