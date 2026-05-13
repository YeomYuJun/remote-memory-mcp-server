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

export class SyncManager {
  private githubClient: GitHubClient;
  private memoryManager: MemoryGraphManager;
  private mirror: MirrorManager | null = null;
  private baseline: SyncBaseline | null = null;
  private readonly MEMORY_FILE_PATH = 'memory/graph.json';
  private syncInterval?: NodeJS.Timeout;
  private isInitialLoad = true; // 초기 로드 상태 추적

  constructor(githubClient: GitHubClient, memoryManager: MemoryGraphManager) {
    this.githubClient = githubClient;
    this.memoryManager = memoryManager;
  }

  /** Attach a mirror manager. Enables divergence guard via sidecar baseline. */
  setMirror(mirror: MirrorManager): void {
    this.mirror = mirror;
  }

  /** Bootstrap baseline from sidecar (must be called after setMirror + after initial graph load). */
  async loadBaseline(): Promise<void> {
    if (!this.mirror) return;
    this.baseline = await this.mirror.readBaseline();
  }

  /**
   * Capture and persist a fresh baseline from the current in-memory graph and
   * a GitHub SHA the caller provides. Used when bootstrapping with an
   * existing mirror file but no sidecar — we don't know how mirror compares
   * to GitHub yet, so we snapshot "now" as the baseline (future drifts on
   * either side will be detected).
   */
  async captureBaseline(remoteSha: string): Promise<void> {
    await this.persistBaseline({ remoteSha, mirrorDigest: this.currentDigest() });
  }

  /** Used by bootstrap path that doesn't go through pullFromRemote. */
  async fetchRemoteSha(): Promise<string | null> {
    try {
      const f = await this.githubClient.getFile(this.MEMORY_FILE_PATH);
      return f?.sha ?? '';
    } catch {
      return null;
    }
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

  private currentDigest(): string {
    return MirrorManager.digestGraph(this.memoryManager.getGraph());
  }

  /**
   * Pull from GitHub. With divergence guard:
   *   - both sides changed since last pull → refuse, return status='diverged'
   *   - only remote changed → normal pull
   *   - only local changed → no-op, return status='local-only' (call sync_push instead)
   *   - nothing changed → return status='up-to-date'
   *
   * opts.force skips the divergence check (used by forceSync).
   */
  async pullFromRemote(opts: { force?: boolean } = {}): Promise<SyncResult> {
    const now = () => new Date().toISOString();

    try {
      // Pick up any external mirror writes (e.g. graph-view) before deciding.
      if (this.mirror) {
        try {
          await this.mirror.maybeReload();
        } catch {
          /* ignore — fall through and let pull decide */
        }
      }

      const remoteFile = await this.githubClient.getFile(this.MEMORY_FILE_PATH);

      // Remote does not exist
      if (!remoteFile) {
        if (!this.isInitialLoad) {
          return await this.pushToRemote();
        }
        this.isInitialLoad = false;
        await this.persistBaseline({ remoteSha: '', mirrorDigest: this.currentDigest() });
        return { success: true, conflictResolved: false, lastSync: now(), status: 'up-to-date' };
      }

      const remoteSha = remoteFile.sha ?? '';

      // Divergence guard (only when we have a baseline and not forced)
      if (!opts.force && this.baseline) {
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
              '(1) call sync_push to publish local changes (if GitHub side is irrelevant), ' +
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
            message: 'Local mirror has unpublished changes; GitHub unchanged. Pull skipped — call sync_push when ready.',
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
      this.memoryManager.fromJSON(remoteData);
      this.isInitialLoad = false;

      // Reflect into mirror (so graph-view sees the update on next poll)
      if (this.mirror) {
        try {
          await this.mirror.writeMirror();
        } catch (e) {
          console.error('[sync-manager] Mirror write after pull failed:', e);
        }
      }

      await this.persistBaseline({ remoteSha, mirrorDigest: this.currentDigest() });
      return { success: true, conflictResolved: false, lastSync: now(), status: 'pulled', remoteSha };
    } catch (error) {
      this.isInitialLoad = false;
      return {
        success: false,
        conflictResolved: false,
        lastSync: now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Push to GitHub. With non-fast-forward guard:
   *   - GitHub has changed since last pull → refuse, return status='remote-ahead'
   *
   * opts.force skips the check (used by forceSync).
   */
  async pushToRemote(commitMessage?: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
    const now = () => new Date().toISOString();

    try {
      if (this.mirror) {
        try {
          await this.mirror.maybeReload();
        } catch {
          /* ignore */
        }
      }

      const localData = this.memoryManager.toJSON();

      // Skip empty-graph push (matches prior behavior)
      if (
        Object.keys(localData.entities || {}).length === 0 &&
        (!localData.relations || localData.relations.length === 0)
      ) {
        return { success: true, conflictResolved: false, lastSync: now(), status: 'up-to-date' };
      }

      const existingFile = await this.githubClient.getFile(this.MEMORY_FILE_PATH);
      const existingSha = existingFile?.sha ?? '';

      // Non-fast-forward guard
      if (!opts.force && this.baseline && existingSha !== this.baseline.remoteSha) {
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
        { path: this.MEMORY_FILE_PATH, content, sha: existingFile?.sha },
        commitMessage || defaultMessage
      );

      // Refetch SHA (Octokit putFile is void in our wrapper). Used to update baseline.
      const afterPush = await this.githubClient.getFile(this.MEMORY_FILE_PATH);
      const newSha = afterPush?.sha ?? '';

      // Update last-sync metadata
      const graph = this.memoryManager.getGraph();
      graph.metadata.lastSync = now();
      this.memoryManager.loadGraph(graph);

      await this.persistBaseline({ remoteSha: newSha, mirrorDigest: this.currentDigest() });
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

  async forcePush(): Promise<SyncResult> {
    return await this.pushToRemote(undefined, { force: true });
  }

  /**
   * Escape hatch: pull (force) then push (force). Bypasses the divergence
   * guard entirely. User invokes this when they have manually decided how to
   * resolve a 'diverged' situation.
   */
  async forceSync(): Promise<SyncResult> {
    const pullResult = await this.pullFromRemote({ force: true });
    if (pullResult.success) {
      return await this.pushToRemote(undefined, { force: true });
    }
    return pullResult;
  }

  async getCommitHistory(limit: number = 10): Promise<any[]> {
    try {
      const response = await this.githubClient.getCommits(this.MEMORY_FILE_PATH, limit);
      return response.map(commit => ({
        sha: commit.sha.substring(0, 7),
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        url: commit.html_url
      }));
    } catch (error) {
      console.error('Failed to get commit history:', error);
      return [];
    }
  }
}
