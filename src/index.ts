#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { GitHubClient, GitHubConfig } from './github-client.js';
import { MemoryGraphManager } from './memory-graph.js';
import { SyncManager } from './sync-manager.js';

interface ServerConfig {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  branch?: string;
  syncInterval?: number;
  autoPush?: boolean;
  projectName?: string;
}

// project 파라미터가 있으면 해당 프로젝트, 없으면 active project로 동작하는 헬퍼
function resolveProject(args: any): string | undefined {
  return args?.project ?? undefined;
}

// MCP 프레임워크에서 배열이 string으로 직렬화되어 올 수 있으므로 방어적 파싱
function parseArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
}

class RemoteMemoryMCPServer {
  private server: Server;
  private memoryManager: MemoryGraphManager;
  private githubClient!: GitHubClient;
  private syncManager!: SyncManager;
  private autoPush = false;

  constructor() {
    this.server = new Server(
      { name: 'remote-memory-mcp', version: '1.4.0' },
      { capabilities: { tools: {} } }
    );

    this.memoryManager = new MemoryGraphManager();
    this.setupTools();
    this.setupErrorHandling();
  }

  async initialize(config: ServerConfig): Promise<void> {
    console.error('Initialize start');
    const githubConfig: GitHubConfig = {
      token: config.githubToken,
      owner: config.githubOwner,
      repo: config.githubRepo,
      branch: config.branch || 'main',
    };

    this.githubClient = new GitHubClient(githubConfig);
    this.syncManager = new SyncManager(this.githubClient, this.memoryManager);
    this.autoPush = config.autoPush ?? false;

    try {
      console.error('Loading project index...');
      await this.syncManager.initializeProject(config.projectName);
      console.error(`Active project: ${this.syncManager.getActiveProject()}`);

      console.error('Starting initial sync...');
      await this.syncManager.pullFromRemote();
      console.error('Initial sync completed');
    } catch (error) {
      console.error('Initialization failed, continuing:', error);
    }

    if (config.syncInterval && config.syncInterval > 0) {
      this.syncManager.startAutoSync(config.syncInterval);
    }
    console.error('Initialize completed');
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // ── Project Management ──────────────────────────────────────────────
        {
          name: 'list_projects',
          description: '사용 가능한 프로젝트 목록과 현재 활성 프로젝트를 조회합니다',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'create_project',
          description: '새 프로젝트를 생성합니다',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '프로젝트 이름 (영문, 숫자, 하이픈, 언더스코어만)' },
              description: { type: 'string', description: '프로젝트 설명 (선택)' },
            },
            required: ['name'],
          },
        },
        {
          name: 'switch_project',
          description: '활성 프로젝트를 변경합니다. 변경 후 해당 프로젝트 데이터를 즉시 로드합니다',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: '전환할 프로젝트 이름' },
            },
            required: ['project'],
          },
        },

        // ── Entity / Relation CRUD ───────────────────────────────────────────
        {
          name: 'create_entities',
          description: '새로운 엔티티들을 생성합니다',
          inputSchema: {
            type: 'object',
            properties: {
              entities: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    entityType: { type: 'string' },
                    observations: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['name', 'entityType', 'observations'],
                },
              },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['entities'],
          },
        },
        {
          name: 'create_relations',
          description: '엔티티 간의 관계를 생성합니다',
          inputSchema: {
            type: 'object',
            properties: {
              relations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    relationType: { type: 'string' },
                  },
                  required: ['from', 'to', 'relationType'],
                },
              },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['relations'],
          },
        },
        {
          name: 'add_observations',
          description: '기존 엔티티에 관찰 내용을 추가합니다',
          inputSchema: {
            type: 'object',
            properties: {
              observations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    entityName: { type: 'string' },
                    contents: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['entityName', 'contents'],
                },
              },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['observations'],
          },
        },
        {
          name: 'delete_entities',
          description: '엔티티와 관련 관계를 삭제합니다',
          inputSchema: {
            type: 'object',
            properties: {
              entityNames: { type: 'array', items: { type: 'string' } },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['entityNames'],
          },
        },
        {
          name: 'delete_observations',
          description: '엔티티에서 특정 관찰 내용을 삭제합니다',
          inputSchema: {
            type: 'object',
            properties: {
              deletions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    entityName: { type: 'string' },
                    observations: { type: 'array', items: { type: 'string' } },
                  },
                  required: ['entityName', 'observations'],
                },
              },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['deletions'],
          },
        },
        {
          name: 'delete_relations',
          description: '특정 관계를 삭제합니다',
          inputSchema: {
            type: 'object',
            properties: {
              relations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    from: { type: 'string' },
                    to: { type: 'string' },
                    relationType: { type: 'string' },
                  },
                  required: ['from', 'to', 'relationType'],
                },
              },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['relations'],
          },
        },

        // ── Query ───────────────────────────────────────────────────────────
        {
          name: 'search_nodes',
          description: '엔티티를 검색합니다',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['query'],
          },
        },
        {
          name: 'open_nodes',
          description: '특정 이름의 엔티티들을 조회합니다',
          inputSchema: {
            type: 'object',
            properties: {
              names: { type: 'array', items: { type: 'string' } },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
            required: ['names'],
          },
        },
        {
          name: 'list_entities',
          description: '엔티티 목록을 조회합니다 (필터링, 정렬, 페이지네이션 지원)',
          inputSchema: {
            type: 'object',
            properties: {
              entityType: { type: 'string', description: '특정 엔티티 타입으로 필터링' },
              sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'name'], description: '정렬 기준' },
              sortOrder: { type: 'string', enum: ['asc', 'desc'], description: '정렬 순서' },
              dateFrom: { type: 'string', description: '시작 날짜 (ISO 8601)' },
              dateTo: { type: 'string', description: '종료 날짜 (ISO 8601)' },
              limit: { type: 'number', description: '페이지 크기 (기본: 50)' },
              offset: { type: 'number', description: '시작 위치 (기본: 0)' },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'get_entity_names',
          description: '엔티티 이름 목록만 조회합니다 (가볍고 빠름)',
          inputSchema: {
            type: 'object',
            properties: {
              entityType: { type: 'string', description: '특정 엔티티 타입으로 필터링' },
              sortBy: { type: 'string', enum: ['createdAt', 'updatedAt', 'name'] },
              sortOrder: { type: 'string', enum: ['asc', 'desc'] },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'get_entity_types',
          description: '모든 엔티티 타입과 각 타입별 개수를 조회합니다',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'read_graph',
          description: '전체 지식 그래프를 읽습니다',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },

        // ── Sync ────────────────────────────────────────────────────────────
        {
          name: 'sync_pull',
          description: 'GitHub에서 데이터를 가져와 동기화합니다',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'sync_push',
          description: '로컬 데이터를 GitHub로 푸시합니다',
          inputSchema: {
            type: 'object',
            properties: {
              commitMessage: { type: 'string', description: '커밋 메시지 (선택)' },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'force_sync',
          description: '강제로 양방향 동기화를 수행합니다',
          inputSchema: {
            type: 'object',
            properties: {
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'create_backup',
          description: '현재 메모리 상태의 백업을 생성합니다',
          inputSchema: {
            type: 'object',
            properties: {
              backupName: { type: 'string', description: '백업 이름 (선택)' },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
        {
          name: 'get_commit_history',
          description: '최근 커밋 히스토리를 조회합니다',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: '조회할 커밋 수 (기본: 10)' },
              project: { type: 'string', description: '대상 프로젝트 (생략 시 현재 활성 프로젝트)' },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          // Project management
          case 'list_projects':     return await this.handleListProjects();
          case 'create_project':    return await this.handleCreateProject(args);
          case 'switch_project':    return await this.handleSwitchProject(args);
          // CRUD
          case 'create_entities':   return await this.handleCreateEntities(args);
          case 'create_relations':  return await this.handleCreateRelations(args);
          case 'add_observations':  return await this.handleAddObservations(args);
          case 'delete_entities':   return await this.handleDeleteEntities(args);
          case 'delete_observations': return await this.handleDeleteObservations(args);
          case 'delete_relations':  return await this.handleDeleteRelations(args);
          // Query
          case 'search_nodes':      return await this.handleSearchNodes(args);
          case 'open_nodes':        return await this.handleOpenNodes(args);
          case 'list_entities':     return await this.handleListEntities(args);
          case 'get_entity_names':  return await this.handleGetEntityNames(args);
          case 'get_entity_types':  return await this.handleGetEntityTypes(args);
          case 'read_graph':        return await this.handleReadGraph(args);
          // Sync
          case 'sync_pull':         return await this.handleSyncPull(args);
          case 'sync_push':         return await this.handleSyncPush(args);
          case 'force_sync':        return await this.handleForceSync(args);
          case 'create_backup':     return await this.handleCreateBackup(args);
          case 'get_commit_history': return await this.handleGetCommitHistory(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  // ── project 전환이 필요한 경우 임시로 pull/push 경로를 override하는 헬퍼 ──
  // project가 active와 다를 경우 해당 프로젝트 데이터를 별도 매니저로 처리하지 않고
  // "다른 프로젝트 read는 직접 GitHub에서 파일 fetch" 방식으로 처리
  // (쓰기는 active project에만 허용 — 안전성을 위해)

  private ok(data: object) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  // ── Project Management Handlers ─────────────────────────────────────────

  private async handleListProjects() {
    const index = await this.syncManager.listProjects();
    return this.ok({
      success: true,
      activeProject: this.syncManager.getActiveProject(),
      projects: index.projects,
      count: index.projects.length,
    });
  }

  private async handleCreateProject(args: any) {
    const info = await this.syncManager.createProject(args.name, args.description);
    return this.ok({
      success: true,
      message: `Project '${args.name}' created. Use switch_project to activate it.`,
      project: info,
    });
  }

  private async handleSwitchProject(args: any) {
    await this.syncManager.switchProject(args.project);
    return this.ok({
      success: true,
      message: `Switched to project '${args.project}'. Memory loaded.`,
      activeProject: this.syncManager.getActiveProject(),
    });
  }

  // ── CRUD Handlers ───────────────────────────────────────────────────────
  // project 파라미터가 현재 active project와 다르면 먼저 pull, 작업 후 push

  private async withProject<T>(project: string | undefined, fn: () => T): Promise<T> {
    const active = this.syncManager.getActiveProject();

    if (project && project !== active) {
      // 임시로 해당 프로젝트 데이터를 로드
      await this.syncManager.pullFromRemote(project);
    }
    const result = fn();
    if (project && project !== active) {
      // 작업 후 push하고 active project 데이터 복구
      await this.syncManager.pushToRemote(undefined, project);
      await this.syncManager.pullFromRemote(); // active project 복구
    }
    return result;
  }

  private async handleCreateEntities(args: any) {
    const project = resolveProject(args);
    const entities = parseArray(args.entities);
    await this.withProject(project, () => this.memoryManager.createEntities(entities));

    if (this.autoPush) {
      const names = entities.map((e: any) => e.name).join(', ');
      await this.syncWithMessage(`feat: Add ${entities.length} entities (${names})`, project);
    }

    return this.ok({
      success: true,
      message: `Created ${entities.length} entities`,
      entities: entities.map((e: any) => e.name),
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleCreateRelations(args: any) {
    const project = resolveProject(args);
    const relations = parseArray(args.relations);
    await this.withProject(project, () => this.memoryManager.createRelations(relations));
    await this.syncWithMessage(`feat: Add ${relations.length} relations`, project);

    return this.ok({
      success: true,
      message: `Created ${relations.length} relations`,
      relations,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleAddObservations(args: any) {
    const project = resolveProject(args);
    const observations = parseArray(args.observations);
    await this.withProject(project, () => this.memoryManager.addObservations(observations));

    const total = observations.reduce((s: number, o: any) => s + parseArray(o.contents).length, 0);
    await this.syncWithMessage(`feat: Add ${total} observations to ${observations.length} entities`, project);

    return this.ok({
      success: true,
      message: 'Added observations',
      observations,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleDeleteEntities(args: any) {
    const project = resolveProject(args);
    const entityNames = parseArray(args.entityNames);
    await this.withProject(project, () => this.memoryManager.deleteEntities(entityNames));
    await this.syncWithMessage(`fix: Delete ${entityNames.length} entities (${entityNames.join(', ')})`, project);

    return this.ok({
      success: true,
      message: `Deleted entities: ${entityNames.join(', ')}`,
      deletedEntities: entityNames,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleDeleteObservations(args: any) {
    const project = resolveProject(args);
    const deletions = parseArray(args.deletions);
    await this.withProject(project, () => this.memoryManager.deleteObservations(deletions));

    const total = deletions.reduce((s: number, d: any) => s + parseArray(d.observations).length, 0);
    await this.syncWithMessage(`fix: Delete ${total} observations from ${deletions.length} entities`, project);

    return this.ok({
      success: true,
      message: 'Deleted observations',
      deletions,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleDeleteRelations(args: any) {
    const project = resolveProject(args);
    const relations = parseArray(args.relations);
    await this.withProject(project, () => this.memoryManager.deleteRelations(relations));
    await this.syncWithMessage(`fix: Delete ${relations.length} relations`, project);

    return this.ok({
      success: true,
      message: `Deleted ${relations.length} relations`,
      deletedRelations: relations,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  // ── Query Handlers ───────────────────────────────────────────────────────
  // 다른 프로젝트를 읽을 때는 해당 프로젝트를 pull해서 읽고 active project 복구

  private async handleSearchNodes(args: any) {
    const project = resolveProject(args);
    let results;
    await this.withProject(project, () => { results = this.memoryManager.searchNodes(args.query); });

    return this.ok({
      success: true,
      query: args.query,
      results,
      count: (results as any).length,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleOpenNodes(args: any) {
    const project = resolveProject(args);
    const names = parseArray(args.names);
    let nodes;
    await this.withProject(project, () => { nodes = this.memoryManager.getNodes(names); });

    return this.ok({
      success: true,
      requestedNames: names,
      nodes,
      found: (nodes as any).length,
      requested: names.length,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleListEntities(args: any) {
    const project = resolveProject(args);
    let result;
    await this.withProject(project, () => {
      result = this.memoryManager.listEntities({
        entityType: args.entityType,
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        limit: args.limit,
        offset: args.offset,
      });
    });

    const r = result as any;
    return this.ok({
      success: true,
      entities: r.entities,
      count: r.entities.length,
      total: r.total,
      offset: args.offset || 0,
      limit: args.limit || 50,
      hasMore: (args.offset || 0) + r.entities.length < r.total,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleGetEntityNames(args: any) {
    const project = resolveProject(args);
    let names;
    await this.withProject(project, () => {
      names = this.memoryManager.getEntityNames({
        entityType: args.entityType,
        sortBy: args.sortBy,
        sortOrder: args.sortOrder,
      });
    });

    return this.ok({
      success: true,
      names,
      count: (names as any).length,
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleGetEntityTypes(args: any) {
    const project = resolveProject(args);
    let types;
    await this.withProject(project, () => { types = this.memoryManager.getEntityTypes(); });

    return this.ok({
      success: true,
      types,
      totalTypes: (types as any).length,
      totalEntities: (types as any).reduce((s: number, t: any) => s + t.count, 0),
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  private async handleReadGraph(args: any) {
    const project = resolveProject(args);
    let graph: any;
    await this.withProject(project, () => { graph = this.memoryManager.getGraph(); });

    return this.ok({
      entities: Object.fromEntries(graph.entities),
      relations: graph.relations,
      metadata: graph.metadata,
      summary: {
        entityCount: graph.entities.size,
        relationCount: graph.relations.length,
        lastModified: graph.metadata.lastModified,
        lastSync: graph.metadata.lastSync,
      },
      project: project ?? this.syncManager.getActiveProject(),
    });
  }

  // ── Sync Handlers ───────────────────────────────────────────────────────

  private async handleSyncPull(args: any) {
    const project = resolveProject(args);
    const result = await this.syncManager.pullFromRemote(project);
    return this.ok({ operation: 'sync_pull', ...result, project: project ?? this.syncManager.getActiveProject() });
  }

  private async handleSyncPush(args: any) {
    const project = resolveProject(args);
    const result = await this.syncManager.pushToRemote(args.commitMessage, project);
    return this.ok({ operation: 'sync_push', ...result, project: project ?? this.syncManager.getActiveProject() });
  }

  private async handleForceSync(args: any) {
    const project = resolveProject(args);
    const result = await this.syncManager.forceSync(project);
    return this.ok({ operation: 'force_sync', ...result, project: project ?? this.syncManager.getActiveProject() });
  }

  private async handleCreateBackup(args: any) {
    try {
      const project = resolveProject(args) ?? this.syncManager.getActiveProject();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = args.backupName || `backup-${timestamp}`;
      const backupPath = `backups/${project}/${backupName}.json`;

      const currentData = this.memoryManager.toJSON();
      const backupContent = JSON.stringify({
        ...currentData,
        backupInfo: {
          createdAt: new Date().toISOString(),
          name: backupName,
          project,
          originalPath: project === 'default' ? 'memory/graph.json' : `memory/${project}/graph.json`,
        },
      }, null, 2);

      await this.githubClient.putFile({ path: backupPath, content: backupContent }, `backup: Create backup '${backupName}' for project '${project}'`);

      return this.ok({ success: true, message: 'Backup created successfully', backupName, backupPath, project, timestamp: new Date().toISOString() });
    } catch (error) {
      return this.ok({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async handleGetCommitHistory(args: any) {
    try {
      const project = resolveProject(args);
      const commits = await this.syncManager.getCommitHistory(args.limit || 10, project);
      return this.ok({ success: true, commits, count: commits.length, project: project ?? this.syncManager.getActiveProject() });
    } catch (error) {
      return this.ok({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async syncWithMessage(message: string, project?: string): Promise<void> {
    if (!this.autoPush) return;
    try {
      await this.syncManager.pushToRemote(message, project);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Remote Memory MCP server running on stdio');
  }
}

// Main execution
async function main() {
  console.error('Starting server with config:', {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH,
    project: process.env.PROJECT_NAME || '(from index.json)',
    hasToken: !!process.env.GITHUB_TOKEN,
  });

  const server = new RemoteMemoryMCPServer();

  const config: ServerConfig = {
    githubToken: process.env.GITHUB_TOKEN || '',
    githubOwner: process.env.GITHUB_OWNER || '',
    githubRepo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
    syncInterval: process.env.SYNC_INTERVAL ? parseInt(process.env.SYNC_INTERVAL) : 0,
    autoPush: process.env.AUTO_PUSH === 'true',
    projectName: process.env.PROJECT_NAME || undefined,
  };

  if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
    console.error('Error: Missing required configuration');
    console.error('Required: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
    console.error('Optional: GITHUB_BRANCH, SYNC_INTERVAL, AUTO_PUSH, PROJECT_NAME');
    process.exit(1);
  }

  try {
    await server.initialize(config);
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

console.error('Module loaded, starting main...');
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
