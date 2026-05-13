import { GitHubClient } from './github-client.js';
import { MemoryGraphManager } from './memory-graph.js';
import { MirrorManager, SyncBaseline } from './mirror-io.js';

export type SyncStatus =
  | 'pulled'
  | 'pushed'
  | 'diverged'
  | 'remote-ahead'
  | 'local-only'
  | 'up-to-date';

export interface SyncResult {
  success: boolean;
  conflictResolved: boolean;
  lastSync: string;
  error?: string;
  status?: SyncStatus;
  message?: string;
  remoteSha?: string;
}

export interface ProjectInfo {
  name: string;
  description?: string;
  createdAt: string;
}

export interface ProjectIndex {
  activeProject: string;
  projects: ProjectInfo[];
}

const INDEX_FILE_PATH = 'memory/index.json';
const DEFAULT_PROJECT = 'default';

function getMemoryFilePath(project: string): string {
  if (project === DEFAULT_PROJECT) {
    return 'memory/graph.json';
  }
  return `memory/${project}/graph.json`;
}

export class SyncManager {
  private githubClient: GitHubClient;
  private memoryManager: MemoryGraphManager;
  private syncInterval?: NodeJS.Timeout;
  private activeProject: string = DEFAULT_PROJECT;

  // v2: optional mirror + per-project baseline for divergence guard.
  // mirror always reflects activeProject. Operations on non-active projects
  // (per-call project override) leave mirror and baseline untouched.
  private mirror: MirrorManager | null = null;
  private baseline: SyncBaseline | null = null;

  constructor(githubClient: GitHubClient, memoryManager: MemoryGraphManager) {
    this.githubClient = githubClient;
    this.memoryManager = memoryManager;
  }

  getActiveProject(): string {
    return this.activeProject;
  }

  /** Attach a mirror manager. Enables LOCAL_MIRROR_PATH mode + divergence guard. */
  setMirror(mirror: MirrorManager): void {
    this.mirror = mirror;
  }

  hasMirror(): boolean {
    return this.mirror !== null;
  }

  /** Read baseline sidecar (if mirror configured). Call after setMirror. */
  async loadBaseline(): Promise<void> {
    if (!this.mirror) return;
    this.baseline = await this.mirror.readBaseline();
  }

  /** Pick up external mirror file changes (e.g. graph-view writes). */
  async maybeReloadMirror(): Promise<boolean> {
    if (!this.mirror) return false;
    try {
      return await this.mirror.maybeReload();
    } catch (e) {
      console.error('[sync-manager] Mirror reload failed:', e);
      return false;
    }
  }

  /** Write current in-memory graph to mirror. Throws on external-change race. */
  async writeMirror(): Promise<void> {
    if (!this.mirror) return;
    await this.mirror.writeMirror();
  }

  private async persistBaseline(b: SyncBaseline): Promise<void> {
    this.baseline = b;
    if (this.mirror) {
      try {
        await this.mirror.writeBaseline(b);
      } catch (e) {
        console.error('[sync-manager] Baseline sidecar write failed:', e);
      }
    }
  }

  /**
   * Capture and persist a fresh baseline for the **active** project, using
   * the current in-memory graph + a remote SHA the caller fetched. Used when
   * bootstrapping with an existing mirror file but no sidecar.
   */
  async captureBaseline(remoteSha: string): Promise<void> {
    await this.persistBaseline({
      project: this.activeProject,
      remoteSha,
      mirrorDigest: this.currentDigest(),
    });
  }

  /** Helper for bootstrap: fetch the active project's blob SHA from GitHub. */
  async fetchRemoteSha(): Promise<string | null> {
    try {
      const f = await this.githubClient.getFile(getMemoryFilePath(this.activeProject));
      return f?.sha ?? '';
    } catch {
      return null;
    }
  }

  private currentDigest(): string {
    return MirrorManager.digestGraph(this.memoryManager.getGraph());
  }

  private isActive(project?: string): boolean {
    return project === undefined || project === this.activeProject;
  }

  // ── Project Index Management ───────────────────────────────────────────

  async loadIndex(): Promise<ProjectIndex> {
    const file = await this.githubClient.getFile(INDEX_FILE_PATH);
    if (file) {
      try {
        return JSON.parse(file.content) as ProjectIndex;
      } catch {
        /* parse failed → fall through to defaults */
      }
    }
    return { activeProject: DEFAULT_PROJECT, projects: [] };
  }

  async saveIndex(index: ProjectIndex): Promise<void> {
    const existing = await this.githubClient.getFile(INDEX_FILE_PATH);
    await this.githubClient.putFile(
      { path: INDEX_FILE_PATH, content: JSON.stringify(index, null, 2), sha: existing?.sha },
      `chore: Update project index (active: ${index.activeProject})`
    );
  }

  async initializeProject(envProjectName?: string): Promise<void> {
    const index = await this.loadIndex();

    if (envProjectName) {
      this.activeProject = envProjectName;
    } else {
      this.activeProject = index.activeProject || DEFAULT_PROJECT;
    }

    if (!index.projects.find(p => p.name === DEFAULT_PROJECT)) {
      index.projects.unshift({ name: DEFAULT_PROJECT, createdAt: new Date().toISOString() });
      await this.saveIndex(index);
    }
  }

  async switchProject(projectName: string): Promise<void> {
    const index = await this.loadIndex();
    const exists = index.projects.find(p => p.name === projectName);
    if (!exists) {
      throw new Error(`Project '${projectName}' does not exist. Use create_project first.`);
    }
    index.activeProject = projectName;
    await this.saveIndex(index);
    this.activeProject = projectName;

    // Reset in-memory before loading new project to avoid contamination.
    this.memoryManager.fromJSON({
      entities: {},
      relations: [],
      metadata: {
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        lastSync: new Date().toISOString(),
      },
    });

    const filePath = getMemoryFilePath(projectName);
    const remoteFile = await this.githubClient.getFile(filePath);
    if (remoteFile) {
      const remoteData = JSON.parse(remoteFile.content);
      this.memoryManager.fromJSON(remoteData);
    }
    // Remote may not exist yet — leave in-memory empty.

    // Mirror now must reflect the new active project. Write the current
    // (possibly empty) graph and re-capture baseline.
    if (this.mirror) {
      try {
        await this.mirror.writeMirror();
      } catch (e) {
        console.error('[sync-manager] Mirror write after switch_project failed:', e);
      }
      const remoteSha = remoteFile?.sha ?? '';
      await this.persistBaseline({
        project: projectName,
        remoteSha,
        mirrorDigest: this.currentDigest(),
      });
    }
  }

  async createProject(name: string, description?: string): Promise<ProjectInfo> {
    if (name === DEFAULT_PROJECT) {
      throw new Error(`'${DEFAULT_PROJECT}' is reserved.`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(`Project name must be alphanumeric with hyphens/underscores only.`);
    }

    const index = await this.loadIndex();
    if (index.projects.find(p => p.name === name)) {
      throw new Error(`Project '${name}' already exists.`);
    }

    const info: ProjectInfo = { name, description, createdAt: new Date().toISOString() };
    index.projects.push(info);
    await this.saveIndex(index);
    return info;
  }

  async listProjects(): Promise<ProjectIndex> {
    return await this.loadIndex();
  }

  private memoryFilePath(project?: string): string {
    return getMemoryFilePath(project ?? this.activeProject);
  }

  // ── Sync: Pull ─────────────────────────────────────────────────────────

  /**
   * Pull from GitHub. For the active project with mirror enabled and a known
   * baseline, applies the divergence guard:
   *   - both sides changed since last pull → refuse, return status='diverged'
   *   - only remote changed → normal pull
   *   - only local changed → no-op, return status='local-only' (call sync_push)
   *   - nothing changed → status='up-to-date'
   *
   * For non-active projects or when forced, runs the legacy behavior
   * (straight pull, no guard, no mirror touch).
   */
  async pullFromRemote(project?: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
    const now = () => new Date().toISOString();
    const filePath = this.memoryFilePath(project);
    const isActive = this.isActive(project);

    try {
      // Pick up any external mirror writes BEFORE deciding (active project only).
      if (isActive) {
        await this.maybeReloadMirror();
      }

      const remoteFile = await this.githubClient.getFile(filePath);

      // Remote does not exist
      if (!remoteFile) {
        if (isActive && this.mirror) {
          await this.persistBaseline({
            project: this.activeProject,
            remoteSha: '',
            mirrorDigest: this.currentDigest(),
          });
        }
        return { success: true, conflictResolved: false, lastSync: now(), status: 'up-to-date' };
      }

      const remoteSha = remoteFile.sha ?? '';

      // Divergence guard — only when active project + baseline matches + not forced
      if (
        isActive &&
        !opts.force &&
        this.baseline &&
        this.baseline.project === this.activeProject
      ) {
        const remoteChanged = remoteSha !== this.baseline.remoteSha;
        const localChanged = this.currentDigest() !== this.baseline.mirrorDigest;

        if (remoteChanged && localChanged) {
          return {
            success: false,
            conflictResolved: false,
            lastSync: now(),
            error: 'diverged',
            status: 'diverged',
            message:
              'Both local mirror and GitHub have changed since the last sync. ' +
              'Automatic pull refused to prevent data loss. Options: ' +
              '(1) call sync_push to publish local changes, ' +
              '(2) call force_sync to discard local and accept remote, ' +
              '(3) inspect manually and resolve.',
            remoteSha,
          };
        }
        if (!remoteChanged && localChanged) {
          return {
            success: true,
            conflictResolved: false,
            lastSync: now(),
            status: 'local-only',
            message: 'Local mirror has unpublished changes; GitHub unchanged. Call sync_push when ready.',
            remoteSha,
          };
        }
        if (!remoteChanged && !localChanged) {
          return { success: true, conflictResolved: false, lastSync: now(), status: 'up-to-date', remoteSha };
        }
        // remoteChanged && !localChanged → normal pull, fall through
      }

      // Apply remote
      const remoteData = JSON.parse(remoteFile.content);
      const conflictResolved = isActive
        ? await this.resolveConflicts(this.memoryManager.getGraph(), remoteData, project)
        : false;
      this.memoryManager.fromJSON(remoteData);

      // Mirror reflection for active project
      if (isActive && this.mirror) {
        try {
          await this.mirror.writeMirror();
        } catch (e) {
          console.error('[sync-manager] Mirror write after pull failed:', e);
        }
        await this.persistBaseline({
          project: this.activeProject,
          remoteSha,
          mirrorDigest: this.currentDigest(),
        });
      }

      return { success: true, conflictResolved, lastSync: now(), status: 'pulled', remoteSha };
    } catch (error) {
      return {
        success: false,
        conflictResolved: false,
        lastSync: now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ── Sync: Push ─────────────────────────────────────────────────────────

  /**
   * Push to GitHub. Active-project + baseline path applies non-fast-forward
   * guard: if GitHub has changed since last sync, refuse with 'remote-ahead'.
   * Force / non-active project paths bypass the guard.
   */
  async pushToRemote(
    commitMessage?: string,
    project?: string,
    opts: { force?: boolean } = {}
  ): Promise<SyncResult> {
    const now = () => new Date().toISOString();
    const filePath = this.memoryFilePath(project);
    const isActive = this.isActive(project);

    try {
      if (isActive) {
        await this.maybeReloadMirror();
      }

      const localData = this.memoryManager.toJSON();

      // Skip empty-graph push (matches prior behavior)
      if (
        Object.keys(localData.entities || {}).length === 0 &&
        (!localData.relations || localData.relations.length === 0)
      ) {
        return { success: true, conflictResolved: false, lastSync: now(), status: 'up-to-date' };
      }

      const existingFile = await this.githubClient.getFile(filePath);
      const existingSha = existingFile?.sha ?? '';

      // Non-fast-forward guard for active project
      if (
        isActive &&
        !opts.force &&
        this.baseline &&
        this.baseline.project === this.activeProject &&
        existingSha !== this.baseline.remoteSha
      ) {
        return {
          success: false,
          conflictResolved: false,
          lastSync: now(),
          error: 'remote-ahead',
          status: 'remote-ahead',
          message:
            'GitHub has changed since the last sync. Refusing push to prevent overwriting remote work. ' +
            'Call sync_pull first (resolve any divergence) or force_sync to overwrite.',
          remoteSha: existingSha,
        };
      }

      const content = JSON.stringify(localData, null, 2);
      const defaultMessage = `Update memory graph - ${now()}`;
      await this.githubClient.putFile(
        { path: filePath, content, sha: existingFile?.sha },
        commitMessage || defaultMessage
      );

      // Refetch SHA to update baseline (Octokit putFile is void in our wrapper).
      let newSha = '';
      if (isActive && this.mirror) {
        const afterPush = await this.githubClient.getFile(filePath);
        newSha = afterPush?.sha ?? '';
      }

      // Update last-sync metadata
      const graph = this.memoryManager.getGraph();
      graph.metadata.lastSync = now();
      this.memoryManager.loadGraph(graph);

      if (isActive && this.mirror) {
        await this.persistBaseline({
          project: this.activeProject,
          remoteSha: newSha,
          mirrorDigest: this.currentDigest(),
        });
      }

      return { success: true, conflictResolved: false, lastSync: now(), status: 'pushed', remoteSha: newSha };
    } catch (error) {
      return {
        success: false,
        conflictResolved: false,
        lastSync: now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async resolveConflicts(localGraph: any, remoteGraph: any, project?: string): Promise<boolean> {
    const localModified = new Date(localGraph.metadata.lastModified);
    const remoteModified = new Date(remoteGraph.metadata.lastModified);

    if (localModified > remoteModified) {
      await this.pushToRemote(undefined, project, { force: true });
      return true;
    }
    return false;
  }

  startAutoSync(intervalSeconds: number): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(async () => {
      await this.pullFromRemote();
    }, intervalSeconds * 1000);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }

  async forcePush(project?: string): Promise<SyncResult> {
    return await this.pushToRemote(undefined, project, { force: true });
  }

  /**
   * Escape hatch: pull (force) then push (force). Bypasses divergence guard.
   * Use after a 'diverged' status when the user has decided how to resolve.
   */
  async forceSync(project?: string): Promise<SyncResult> {
    const pullResult = await this.pullFromRemote(project, { force: true });
    if (pullResult.success) {
      return await this.pushToRemote(undefined, project, { force: true });
    }
    return pullResult;
  }

  async getCommitHistory(limit: number = 10, project?: string): Promise<any[]> {
    try {
      const filePath = this.memoryFilePath(project);
      const response = await this.githubClient.getCommits(filePath, limit);
      return response.map(commit => ({
        sha: commit.sha.substring(0, 7),
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        url: commit.html_url,
      }));
    } catch (error) {
      console.error('Failed to get commit history:', error);
      return [];
    }
  }
}
