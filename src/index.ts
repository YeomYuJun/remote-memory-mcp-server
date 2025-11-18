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
import { MemoryGraphManager, Entity, Relation } from './memory-graph.js';
import { SyncManager } from './sync-manager.js';

interface ServerConfig {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  branch?: string;
  syncInterval?: number;
  autoPush?: boolean; // 새로 추가
}

class RemoteMemoryMCPServer {
  private server: Server;
  private memoryManager: MemoryGraphManager;
  private githubClient!: GitHubClient;
  private syncManager!: SyncManager;
  private autoPush = false; // 자동 푸시 비활성화 기본값


  constructor() {
    this.server = new Server(
      {
        name: 'remote-memory-mcp',
        version: '1.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.memoryManager = new MemoryGraphManager();
    this.setupTools();
    this.setupErrorHandling();
  }

  async initialize(config: ServerConfig): Promise<void> {
    console.error('Initialize start')
    const githubConfig: GitHubConfig = {
      token: config.githubToken,
      owner: config.githubOwner,
      repo: config.githubRepo,
      branch: config.branch || 'main',
    };

    this.githubClient = new GitHubClient(githubConfig);
    this.syncManager = new SyncManager(this.githubClient, this.memoryManager);
	this.autoPush = config.autoPush ?? false; // 자동 푸시 설정

    // 초기 동기화 (오류 처리 추가)
    try {
      console.error('Starting initial sync...');
      await this.syncManager.pullFromRemote();
      console.error('Initial sync completed');
    } catch (error) {
      console.error('Initial sync failed, continuing without sync:', error);
    }

    // 자동 동기화 설정
    if (config.syncInterval && config.syncInterval > 0) {
      this.syncManager.startAutoSync(config.syncInterval);
    }
    console.error('Initialize completed');
  }

  private setupTools(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
                    observations: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['name', 'entityType', 'observations'],
                },
              },
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
                    contents: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['entityName', 'contents'],
                },
              },
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
              entityNames: {
                type: 'array',
                items: { type: 'string' },
              },
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
                    observations: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                  required: ['entityName', 'observations'],
                },
              },
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
            },
            required: ['relations'],
          },
        },
        {
          name: 'search_nodes',
          description: '엔티티를 검색합니다',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
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
              names: {
                type: 'array',
                items: { type: 'string' },
              },
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
              entityType: {
                type: 'string',
                description: '특정 엔티티 타입으로 필터링'
              },
              sortBy: {
                type: 'string',
                enum: ['createdAt', 'updatedAt', 'name'],
                description: '정렬 기준 (기본값: createdAt)'
              },
              sortOrder: {
                type: 'string',
                enum: ['asc', 'desc'],
                description: '정렬 순서 (기본값: desc)'
              },
              dateFrom: {
                type: 'string',
                description: '시작 날짜 (ISO 8601 형식)'
              },
              dateTo: {
                type: 'string',
                description: '종료 날짜 (ISO 8601 형식)'
              },
              limit: {
                type: 'number',
                description: '페이지 크기 (기본값: 50)'
              },
              offset: {
                type: 'number',
                description: '시작 위치 (기본값: 0)'
              }
            },
          },
        },
        {
          name: 'get_entity_names',
          description: '엔티티 이름 목록만 조회합니다 (가볍고 빠름)',
          inputSchema: {
            type: 'object',
            properties: {
              entityType: {
                type: 'string',
                description: '특정 엔티티 타입으로 필터링'
              },
              sortBy: {
                type: 'string',
                enum: ['createdAt', 'updatedAt', 'name'],
                description: '정렬 기준 (기본값: createdAt)'
              },
              sortOrder: {
                type: 'string',
                enum: ['asc', 'desc'],
                description: '정렬 순서 (기본값: desc)'
              }
            },
          },
        },
        {
          name: 'get_entity_types',
          description: '모든 엔티티 타입과 각 타입별 개수를 조회합니다',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'read_graph',
          description: '전체 지식 그래프를 읽습니다',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'sync_pull',
          description: 'GitHub에서 데이터를 가져와 동기화합니다',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'sync_push',
          description: '로컬 데이터를 GitHub로 푸시합니다',
          inputSchema: {
            type: 'object',
            properties: {
              commitMessage: {
                type: 'string',
                description: '커밋 메시지 (선택사항)'
              }
            },
          },
        },
        {
          name: 'force_sync',
          description: '강제로 양방향 동기화를 수행합니다',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'create_backup',
          description: '현재 메모리 상태의 백업을 생성합니다',
          inputSchema: {
            type: 'object',
            properties: {
              backupName: {
                type: 'string',
                description: '백업 이름 (선택사항)'
              }
            },
          },
        },
        {
          name: 'get_commit_history',
          description: '최근 커밋 히스토리를 조회합니다',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: '조회할 커밋 수 (기본: 10)'
              }
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'create_entities':
            return await this.handleCreateEntities(args);
          case 'create_relations':
            return await this.handleCreateRelations(args);
          case 'add_observations':
            return await this.handleAddObservations(args);
          case 'delete_entities':
            return await this.handleDeleteEntities(args);
          case 'delete_observations':
            return await this.handleDeleteObservations(args);
          case 'delete_relations':
            return await this.handleDeleteRelations(args);
          case 'search_nodes':
            return await this.handleSearchNodes(args);
          case 'open_nodes':
            return await this.handleOpenNodes(args);
          case 'list_entities':
            return await this.handleListEntities(args);
          case 'get_entity_names':
            return await this.handleGetEntityNames(args);
          case 'get_entity_types':
            return await this.handleGetEntityTypes(args);
          case 'read_graph':
            return await this.handleReadGraph(args);
          case 'sync_pull':
            return await this.handleSyncPull(args);
          case 'sync_push':
            return await this.handleSyncPush(args);
          case 'force_sync':
            return await this.handleForceSync(args);
          case 'create_backup':
            return await this.handleCreateBackup(args);
          case 'get_commit_history':
            return await this.handleGetCommitHistory(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  private async handleCreateEntities(args: any) {
    this.memoryManager.createEntities(args.entities);
    
    
    // 자동 푸시가 활성화된 경우에만 동기화
    if (this.autoPush) {
		// 더 의미있는 커밋 메시지로 자동 동기화
      const entityNames = args.entities.map((e: any) => e.name).join(', ');
      const commitMessage = `feat: Add ${args.entities.length} entities (${entityNames})`;
      await this.syncWithMessage(commitMessage);
    }
	
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Created ${args.entities.length} entities`,
          entities: args.entities.map((e: any) => e.name),
        }, null, 2),
      }],
    };
  }

  private async handleCreateRelations(args: any) {
    this.memoryManager.createRelations(args.relations);
    
    const commitMessage = `feat: Add ${args.relations.length} relations`;
    await this.syncWithMessage(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Created ${args.relations.length} relations`,
          relations: args.relations,
        }, null, 2),
      }],
    };
  }

  private async handleAddObservations(args: any) {
    this.memoryManager.addObservations(args.observations);
    
    const totalObservations = args.observations.reduce((sum: number, obs: any) => sum + obs.contents.length, 0);
    const commitMessage = `feat: Add ${totalObservations} observations to ${args.observations.length} entities`;
    await this.syncWithMessage(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Added observations',
          observations: args.observations,
        }, null, 2),
      }],
    };
  }

  private async handleDeleteEntities(args: any) {
    this.memoryManager.deleteEntities(args.entityNames);
    
    const entityNames = args.entityNames.join(', ');
    const commitMessage = `feat: Delete ${args.entityNames.length} entities (${entityNames})`;
    await this.syncWithMessage(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Deleted entities: ${args.entityNames.join(', ')}`,
          deletedEntities: args.entityNames,
        }, null, 2),
      }],
    };
  }

  private async handleDeleteObservations(args: any) {
    this.memoryManager.deleteObservations(args.deletions);
    
    const totalDeleted = args.deletions.reduce((sum: number, del: any) => sum + del.observations.length, 0);
    const commitMessage = `feat: Delete ${totalDeleted} observations from ${args.deletions.length} entities`;
    await this.syncWithMessage(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: 'Deleted observations',
          deletions: args.deletions,
        }, null, 2),
      }],
    };
  }

  private async handleDeleteRelations(args: any) {
    this.memoryManager.deleteRelations(args.relations);
    
    const commitMessage = `feat: Delete ${args.relations.length} relations`;
    await this.syncWithMessage(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `Deleted ${args.relations.length} relations`,
          deletedRelations: args.relations,
        }, null, 2),
      }],
    };
  }

  private async handleSearchNodes(args: any) {
    const results = this.memoryManager.searchNodes(args.query);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          query: args.query,
          results: results,
          count: results.length,
        }, null, 2),
      }],
    };
  }

  private async handleOpenNodes(args: any) {
    const nodes = this.memoryManager.getNodes(args.names);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          requestedNames: args.names,
          nodes: nodes,
          found: nodes.length,
          requested: args.names.length,
        }, null, 2),
      }],
    };
  }

  private async handleListEntities(args: any) {
    const result = this.memoryManager.listEntities({
      entityType: args.entityType,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      limit: args.limit,
      offset: args.offset,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          entities: result.entities,
          count: result.entities.length,
          total: result.total,
          offset: args.offset || 0,
          limit: args.limit || 50,
          hasMore: (args.offset || 0) + result.entities.length < result.total,
        }, null, 2),
      }],
    };
  }

  private async handleGetEntityNames(args: any) {
    const names = this.memoryManager.getEntityNames({
      entityType: args.entityType,
      sortBy: args.sortBy,
      sortOrder: args.sortOrder,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          names: names,
          count: names.length,
          filters: {
            entityType: args.entityType || 'all',
            sortBy: args.sortBy || 'createdAt',
            sortOrder: args.sortOrder || 'desc',
          },
        }, null, 2),
      }],
    };
  }

  private async handleGetEntityTypes(args: any) {
    const types = this.memoryManager.getEntityTypes();

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          types: types,
          totalTypes: types.length,
          totalEntities: types.reduce((sum, t) => sum + t.count, 0),
        }, null, 2),
      }],
    };
  }

  private async handleReadGraph(args: any) {
    const graph = this.memoryManager.getGraph();
    const serializable = {
      entities: Object.fromEntries(graph.entities),
      relations: graph.relations,
      metadata: graph.metadata,
      summary: {
        entityCount: graph.entities.size,
        relationCount: graph.relations.length,
        lastModified: graph.metadata.lastModified,
        lastSync: graph.metadata.lastSync,
      },
    };
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(serializable, null, 2),
      }],
    };
  }

  private async handleSyncPull(args: any) {
    const result = await this.syncManager.pullFromRemote();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: 'sync_pull',
          ...result,
        }, null, 2),
      }],
    };
  }

  private async handleSyncPush(args: any) {
    const commitMessage = args.commitMessage || undefined;
    const result = await this.syncManager.pushToRemote(commitMessage);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: 'sync_push',
          ...result,
        }, null, 2),
      }],
    };
  }

  private async handleForceSync(args: any) {
    const result = await this.syncManager.forceSync();
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          operation: 'force_sync',
          ...result,
        }, null, 2),
      }],
    };
  }

  private async handleCreateBackup(args: any) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = args.backupName || `backup-${timestamp}`;
      const backupPath = `backups/${backupName}.json`;
      
      const currentData = this.memoryManager.toJSON();
      const backupContent = JSON.stringify({
        ...currentData,
        backupInfo: {
          createdAt: new Date().toISOString(),
          name: backupName,
          originalPath: 'memory/graph.json'
        }
      }, null, 2);
      
      await this.githubClient.putFile(
        {
          path: backupPath,
          content: backupContent,
        },
        `backup: Create backup '${backupName}'`
      );
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Backup created successfully`,
            backupName,
            backupPath,
            timestamp: new Date().toISOString()
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, null, 2),
        }],
      };
    }
  }

  private async handleGetCommitHistory(args: any) {
    try {
      const limit = args.limit || 10;
      const commits = await this.syncManager.getCommitHistory(limit);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            commits,
            count: commits.length
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, null, 2),
        }],
      };
    }
  }

  private async autoSync(): Promise<void> {
    // 자동 푸시 (변경사항이 있을 때마다)
    try {
      const autoMessage = `Auto-sync: ${new Date().toLocaleString()}`;
      await this.syncManager.pushToRemote(autoMessage);
    } catch (error) {
      console.error('Auto sync failed:', error);
    }
  }

  private async syncWithMessage(message: string): Promise<void> {
    if (!this.autoPush) return; // 자동 푸시가 비활성화된 경우 스킵
	
    try {
      await this.syncManager.pushToRemote(message);
    } catch (error) {
      console.error('Sync with message failed:', error);
      // 폴백으로 기본 주동 동기화 시도
      await this.autoSync();
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

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
    hasToken: !!process.env.GITHUB_TOKEN
  });
  
  const server = new RemoteMemoryMCPServer();
  
  // 환경변수에서 설정 읽기
  const config: ServerConfig = {
    githubToken: process.env.GITHUB_TOKEN || '',
    githubOwner: process.env.GITHUB_OWNER || '',
    githubRepo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
    syncInterval: process.env.SYNC_INTERVAL ? parseInt(process.env.SYNC_INTERVAL) : 0,
	autoPush: process.env.AUTO_PUSH === 'true', // 환경변수로 제어
  };

  // 필수 설정 확인
  if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
    console.error('Error: Missing required configuration');
    console.error('Required environment variables:');
    console.error('- GITHUB_TOKEN: GitHub Personal Access Token');
    console.error('- GITHUB_OWNER: GitHub repository owner');
    console.error('- GITHUB_REPO: GitHub repository name');
    console.error('Optional:');
    console.error('- GITHUB_BRANCH: Branch name (default: main)');
    console.error('- SYNC_INTERVAL: Auto sync interval in seconds (default: 0 = manual)');
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

// 직접 실행 조건 단순화
console.error('Module loaded, starting main...');
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});