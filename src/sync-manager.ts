import { GitHubClient } from './github-client.js';
import { MemoryGraphManager } from './memory-graph.js';

export interface SyncResult {
  success: boolean;
  conflictResolved: boolean;
  lastSync: string;
  error?: string;
}

export class SyncManager {
  private githubClient: GitHubClient;
  private memoryManager: MemoryGraphManager;
  private readonly MEMORY_FILE_PATH = 'memory/graph.json';
  private syncInterval?: NodeJS.Timeout;

  constructor(githubClient: GitHubClient, memoryManager: MemoryGraphManager) {
    this.githubClient = githubClient;
    this.memoryManager = memoryManager;
  }

  async pullFromRemote(): Promise<SyncResult> {
    try {
      const remoteFile = await this.githubClient.getFile(this.MEMORY_FILE_PATH);
      
      if (remoteFile) {
        const remoteData = JSON.parse(remoteFile.content);
        const localGraph = this.memoryManager.getGraph();
        
        // 충돌 감지 및 해결
        const conflictResolved = await this.resolveConflicts(localGraph, remoteData);
        
        // 원격 데이터로 로컬 업데이트
        this.memoryManager.fromJSON(remoteData);
        
        return {
          success: true,
          conflictResolved,
          lastSync: new Date().toISOString(),
        };
      } else {
        // 원격에 파일이 없으면 현재 상태를 푸시
        return await this.pushToRemote();
      }
    } catch (error) {
      return {
        success: false,
        conflictResolved: false,
        lastSync: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async pushToRemote(commitMessage?: string): Promise<SyncResult> {
    try {
      const localData = this.memoryManager.toJSON();
      const content = JSON.stringify(localData, null, 2);
      
      // 현재 파일의 SHA 가져오기 (업데이트용)
      const existingFile = await this.githubClient.getFile(this.MEMORY_FILE_PATH);
      
      const defaultMessage = `Update memory graph - ${new Date().toISOString()}`;
      
      await this.githubClient.putFile(
        {
          path: this.MEMORY_FILE_PATH,
          content,
          sha: existingFile?.sha,
        },
        commitMessage || defaultMessage
      );
      
      // 메타데이터 업데이트
      const graph = this.memoryManager.getGraph();
      graph.metadata.lastSync = new Date().toISOString();
      this.memoryManager.loadGraph(graph);
      
      return {
        success: true,
        conflictResolved: false,
        lastSync: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        conflictResolved: false,
        lastSync: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async resolveConflicts(localGraph: any, remoteGraph: any): Promise<boolean> {
    // 간단한 충돌 해결: 최신 수정 시간 기준
    const localModified = new Date(localGraph.metadata.lastModified);
    const remoteModified = new Date(remoteGraph.metadata.lastModified);
    
    if (localModified > remoteModified) {
      // 로컬이 더 최신이면 원격으로 푸시
      await this.pushToRemote();
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

  async forcePush(): Promise<SyncResult> {
    return await this.pushToRemote();
  }

  async forceSync(): Promise<SyncResult> {
    const pullResult = await this.pullFromRemote();
    if (pullResult.success) {
      return await this.pushToRemote();
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