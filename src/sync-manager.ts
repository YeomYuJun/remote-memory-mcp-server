import { GitHubClient } from './github-client.js';
import { MemoryGraphManager } from './memory-graph.js';

export interface SyncResult {
  success: boolean;
  conflictResolved: boolean;
  lastSync: string;
  error?: string;
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

  constructor(githubClient: GitHubClient, memoryManager: MemoryGraphManager) {
    this.githubClient = githubClient;
    this.memoryManager = memoryManager;
  }

  getActiveProject(): string {
    return this.activeProject;
  }

  // index.json 로드. 없으면 기본값 반환
  async loadIndex(): Promise<ProjectIndex> {
    const file = await this.githubClient.getFile(INDEX_FILE_PATH);
    if (file) {
      try {
        return JSON.parse(file.content) as ProjectIndex;
      } catch {
        // 파싱 실패 시 기본값
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

  // 서버 시작 시 호출: index.json에서 activeProject 로드
  // PROJECT_NAME 환경변수가 있으면 그것이 우선
  async initializeProject(envProjectName?: string): Promise<void> {
    const index = await this.loadIndex();

    if (envProjectName) {
      this.activeProject = envProjectName;
    } else {
      this.activeProject = index.activeProject || DEFAULT_PROJECT;
    }

    // default 프로젝트가 index에 없으면 추가
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

    // 전환 전에 memoryManager를 초기화하여 이전 프로젝트 데이터 오염 방지
    this.memoryManager.fromJSON({ entities: {}, relations: [], metadata: { version: '1.0.0', lastModified: new Date().toISOString(), lastSync: new Date().toISOString() } });

    // 새 프로젝트 데이터 pull (없으면 빈 상태 유지, push 안 함)
    const filePath = getMemoryFilePath(projectName);
    const remoteFile = await this.githubClient.getFile(filePath);
    if (remoteFile) {
      const remoteData = JSON.parse(remoteFile.content);
      this.memoryManager.fromJSON(remoteData);
    }
    // 원격에 파일 없으면 빈 상태로 유지 (push 안 함)
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

  async pullFromRemote(project?: string): Promise<SyncResult> {
    const filePath = this.memoryFilePath(project);
    try {
      const remoteFile = await this.githubClient.getFile(filePath);

      if (remoteFile) {
        const remoteData = JSON.parse(remoteFile.content);
        const localGraph = this.memoryManager.getGraph();
        const conflictResolved = await this.resolveConflicts(localGraph, remoteData, project);
        this.memoryManager.fromJSON(remoteData);
        return { success: true, conflictResolved, lastSync: new Date().toISOString() };
      } else {
        // 원격에 파일 없음 → 빈 상태 유지, push 안 함
        return { success: true, conflictResolved: false, lastSync: new Date().toISOString() };
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

  async pushToRemote(commitMessage?: string, project?: string): Promise<SyncResult> {
    const filePath = this.memoryFilePath(project);
    try {
      const localData = this.memoryManager.toJSON();

      if (
        Object.keys(localData.entities || {}).length === 0 &&
        (!localData.relations || localData.relations.length === 0)
      ) {
        return { success: true, conflictResolved: false, lastSync: new Date().toISOString() };
      }

      const content = JSON.stringify(localData, null, 2);
      const existingFile = await this.githubClient.getFile(filePath);
      const defaultMessage = `Update memory graph - ${new Date().toISOString()}`;

      await this.githubClient.putFile(
        { path: filePath, content, sha: existingFile?.sha },
        commitMessage || defaultMessage
      );

      const graph = this.memoryManager.getGraph();
      graph.metadata.lastSync = new Date().toISOString();
      this.memoryManager.loadGraph(graph);

      return { success: true, conflictResolved: false, lastSync: new Date().toISOString() };
    } catch (error) {
      return {
        success: false,
        conflictResolved: false,
        lastSync: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async resolveConflicts(localGraph: any, remoteGraph: any, project?: string): Promise<boolean> {
    const localModified = new Date(localGraph.metadata.lastModified);
    const remoteModified = new Date(remoteGraph.metadata.lastModified);

    if (localModified > remoteModified) {
      await this.pushToRemote(undefined, project);
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
    return await this.pushToRemote(undefined, project);
  }

  async forceSync(project?: string): Promise<SyncResult> {
    const pullResult = await this.pullFromRemote(project);
    if (pullResult.success) {
      return await this.pushToRemote(undefined, project);
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
