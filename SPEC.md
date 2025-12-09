# Remote Memory MCP Server API Specification

This document provides detailed API usage and examples for the Remote Memory MCP Server.

## Overview

Remote Memory MCP Server provides the following tools:

- **Entity Query** (v1.3.0+): `get_entity_types`, `get_entity_names`, `list_entities`
- **Entity Management**: `create_entities`, `delete_entities`, `open_nodes`, `search_nodes`
- **Relation Management**: `create_relations`, `delete_relations`
- **Observation Management**: `add_observations`, `delete_observations`
- **Synchronization**: `sync_pull`, `sync_push`, `force_sync`
- **Backup/History**: `create_backup`, `get_commit_history`
- **Query**: `read_graph`

## Entity Query (v1.3.0+)

### Entity Type Statistics (`get_entity_types`)

Retrieves count statistics by entity type.

```typescript
get_entity_types()
```

**Response example**:
```json
{
  "success": true,
  "types": [
    { "type": "Person", "count": 45 },
    { "type": "Company", "count": 23 }
  ],
  "totalTypes": 2,
  "totalEntities": 68
}
```

### Entity Name List (`get_entity_names`)

Quickly retrieves entity names only.

```typescript
get_entity_names({
  entityType: "Person",  // optional
  sortBy: "name",        // optional: createdAt, updatedAt, name
  sortOrder: "asc"       // optional: asc, desc
})
```

**Response example**:
```json
{
  "success": true,
  "names": ["Alice", "Bob", "Charlie"],
  "count": 3
}
```

### Entity List Retrieval (`list_entities`)

Retrieve entity list with filtering and pagination support.

```typescript
list_entities({
  entityType: "Person",               // optional
  sortBy: "createdAt",               // optional: createdAt, updatedAt, name
  sortOrder: "desc",                 // optional: asc, desc
  dateFrom: "2025-01-01T00:00:00Z", // optional
  dateTo: "2025-01-31T23:59:59Z",   // optional
  limit: 50,                         // optional, default: 50
  offset: 0                          // optional, default: 0
})
```

**Response example**:
```json
{
  "success": true,
  "entities": [
    {
      "name": "Alice",
      "entityType": "Person",
      "observations": ["Software engineer"],
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-18T14:22:00Z"
    }
  ],
  "count": 1,
  "total": 45,
  "hasMore": true
}
```

## Entity Management

### Create Entities (`create_entities`)

Creates new entities.

```typescript
create_entities({
  entities: [
    {
      name: "Kim Kim",
      entityType: "Person",
      observations: ["Software developer", "Lives in Seoul"]
    },
    {
      name: "KimCorp",
      entityType: "Company", 
      observations: ["AI startup", "Founded in 2023"]
    }
  ]
})
```

**Parameters**:
- `entities`: Array of entities to create
  - `name` (string): Entity name (unique identifier)
  - `entityType` (string): Entity type (Person, Company, Project, etc.)
  - `observations` (string[]): Array of observation contents

**Response example**:
```json
{
  "success": true,
  "message": "Created 2 entities",
  "entities": ["Kim Kim", "KimCorp"]
}
```

### Search Entities (`search_nodes`)

Search for entities using keywords.

```typescript
search_nodes({ query: "developer" })
```

**Parameters**:
- `query` (string): Search keyword (searches in name, type, observations)

**Response example**:
```json
{
  "success": true,
  "query": "developer",
  "results": [
    {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Retrieve Specific Entities (`open_nodes`)

Retrieve specific entities by name.

```typescript
open_nodes({ names: ["Kim Kim", "KimCorp"] })
```

**Parameters**:
- `names` (string[]): Array of entity names to retrieve

**Response example**:
```json
{
  "success": true,
  "requestedNames": ["Kim Kim", "KimCorp"],
  "nodes": [
    {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "found": 1,
  "requested": 2
}
```

### Delete Entities (`delete_entities`)

Deletes entities and all their associated relations.

```typescript
delete_entities({ entityNames: ["Kim Kim"] })
```

**Parameters**:
- `entityNames` (string[]): Array of entity names to delete

**Response example**:
```json
{
  "success": true,
  "message": "Deleted entities: Kim Kim",
  "deletedEntities": ["Kim Kim"]
}
```

## Relation Management

### Create Relations (`create_relations`)

Creates relationships between entities.

```typescript
create_relations({
  relations: [
    {
      from: "Kim Kim",
      to: "KimCorp",
      relationType: "works_at"
    },
    {
      from: "Kim Kim", 
      to: "AI Project",
      relationType: "leads"
    }
  ]
})
```

**Parameters**:
- `relations`: Array of relations to create
  - `from` (string): Source entity name
  - `to` (string): Target entity name
  - `relationType` (string): Relation type (works_at, leads, belongs_to, etc.)

**Response example**:
```json
{
  "success": true,
  "message": "Created 2 relations",
  "relations": [
    {
      "from": "Kim Kim",
      "to": "KimCorp", 
      "relationType": "works_at"
    }
  ]
}
```

### Delete Relations (`delete_relations`)

Deletes specific relations.

```typescript
delete_relations({
  relations: [
    {
      from: "Kim Kim",
      to: "KimCorp",
      relationType: "works_at"
    }
  ]
})
```

**Parameters**:
- `relations`: Array of relations to delete (must match from, to, and relationType exactly)

## Observation Management

### Add Observations (`add_observations`)

Adds new observations to existing entities.

```typescript
add_observations({
  observations: [
    {
      entityName: "Kim Kim",
      contents: ["Speaks Korean fluently", "Expert in TypeScript"]
    },
    {
      entityName: "KimCorp",
      contents: ["Remote-first company", "15 employees"]
    }
  ]
})
```

**Parameters**:
- `observations`: Array of observations to add
  - `entityName` (string): Target entity name
  - `contents` (string[]): Array of observation contents to add

**Response example**:
```json
{
  "success": true,
  "message": "Added observations",
  "observations": [
    {
      "entityName": "Kim Kim",
      "contents": ["Speaks Korean fluently", "Expert in TypeScript"]
    }
  ]
}
```

### Delete Observations (`delete_observations`)

Deletes specific observations from entities.

```typescript
delete_observations({
  deletions: [
    {
      entityName: "Kim Kim", 
      observations: ["Lives in Seoul"]
    }
  ]
})
```

**Parameters**:
- `deletions`: Array of observations to delete
  - `entityName` (string): Target entity name
  - `observations` (string[]): Array of observation contents to delete (must match exactly)

## Synchronization Operations

### Pull from Remote (`sync_pull`)

Fetches the latest data from GitHub and syncs with local data.

```typescript
sync_pull()
```

**Response example**:
```json
{
  "operation": "sync_pull",
  "success": true,
  "conflictResolved": false,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

### Push to Remote (`sync_push`)

Pushes local data to the GitHub repository.

```typescript
// Basic push
sync_push()

// Push with custom message
sync_push({ commitMessage: "Update project data" })
```

**Response example**:
```json
{
  "operation": "sync_push",
  "success": true,
  "conflictResolved": false,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

### Force Synchronization (`force_sync`)

Performs bidirectional synchronization, ignoring conflicts.

```typescript
force_sync()
```

**Response example**:
```json
{
  "operation": "force_sync", 
  "success": true,
  "conflictResolved": true,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

## Backup and History Management

### Create Backup (`create_backup`)

Creates a backup of the current memory state.

```typescript
// Auto-generated name
create_backup()

// Custom name
create_backup({ backupName: "stable-v2.0" })
```

**Response example**:
```json
{
  "success": true,
  "backupName": "backup-2025-01-01T10:30:00.000Z",
  "message": "Backup created successfully"
}
```

### Get Commit History (`get_commit_history`)

Retrieves recent commit history from the GitHub repository.

```typescript
// Default 10 commits
get_commit_history()

// Custom number of commits
get_commit_history({ limit: 5 })
```
**Parameters**:
- `limit`: Number of commits to retrieve (default: 10)

**Response example**:
```json
{
  "success": true,
  "commits": [
    {
      "sha": "abc123...",
      "message": "feat: Add 2 entities (John Doe, Company ABC)",
      "author": "username",
      "date": "2025-01-01T10:30:00Z",
      "url": "https://github.com/user/repo/commit/abc123..."
    }
  ],
  "count": 5
}
```

## Full Query

### Read Entire Graph (`read_graph`)

Retrieves the entire knowledge graph.

```typescript
read_graph()
```

**Response example**:
```json
{
  "entities": {
    "Kim Kim": {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  },
  "relations": [
    {
      "from": "Kim Kim",
      "to": "KimCorp",
      "relationType": "works_at", 
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  },
  "summary": {
    "entityCount": 1,
    "relationCount": 1,
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  }
}
```

## Usage Example
Link: https://github.com/YeomYuJun/remote_memory/blob/main/memory/graph.json

## Error Handling

All API calls return errors in the following format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Limitations

- Entity names must be unique
- GitHub API rate limit: 5,000 requests per hour
- Maximum file size: 100MB (GitHub limitation)
- Network connection required (for synchronization)

## Synchronization Behavior

### Auto-push Configuration (AUTO_PUSH)
- `AUTO_PUSH=true`: Automatically pushes to GitHub after all CRUD operations
- `AUTO_PUSH=false` (default): Only pushes when `sync_push` is manually called

### Initialization Behavior
- Fetches data from remote repository on server startup
- Does not auto-push empty state even if remote file is missing
- Only pushes when data is present

---

# Remote Memory MCP Server API 사양서

이 문서는 Remote Memory MCP Server의 상세한 API 사용법과 예제를 제공합니다.

## 개요

Remote Memory MCP Server는 다음과 같은 도구들을 제공합니다:

- **엔티티 조회** (v1.3.0+): `get_entity_types`, `get_entity_names`, `list_entities`
- **엔티티 관리**: `create_entities`, `delete_entities`, `open_nodes`, `search_nodes`
- **관계 관리**: `create_relations`, `delete_relations`
- **관찰 내용 관리**: `add_observations`, `delete_observations`
- **동기화**: `sync_pull`, `sync_push`, `force_sync`
- **백업/히스토리**: `create_backup`, `get_commit_history`
- **조회**: `read_graph`

## 엔티티 조회 (v1.3.0+)

### 엔티티 타입 통계 (`get_entity_types`)

엔티티 타입별 개수를 조회합니다.

```typescript
get_entity_types()
```

**응답 예시**:
```json
{
  "success": true,
  "types": [
    { "type": "Person", "count": 45 },
    { "type": "Company", "count": 23 }
  ],
  "totalTypes": 2,
  "totalEntities": 68
}
```

### 엔티티 이름 목록 (`get_entity_names`)

엔티티 이름만 빠르게 조회합니다.

```typescript
get_entity_names({
  entityType: "Person",  // optional
  sortBy: "name",        // optional: createdAt, updatedAt, name
  sortOrder: "asc"       // optional: asc, desc
})
```

**응답 예시**:
```json
{
  "success": true,
  "names": ["Alice", "Bob", "Charlie"],
  "count": 3
}
```

### 엔티티 목록 조회 (`list_entities`)

필터링과 페이지네이션을 지원하는 엔티티 목록 조회입니다.

```typescript
list_entities({
  entityType: "Person",               // optional
  sortBy: "createdAt",               // optional: createdAt, updatedAt, name
  sortOrder: "desc",                 // optional: asc, desc
  dateFrom: "2025-01-01T00:00:00Z", // optional
  dateTo: "2025-01-31T23:59:59Z",   // optional
  limit: 50,                         // optional, default: 50
  offset: 0                          // optional, default: 0
})
```

**응답 예시**:
```json
{
  "success": true,
  "entities": [
    {
      "name": "Alice",
      "entityType": "Person",
      "observations": ["Software engineer"],
      "createdAt": "2025-01-15T10:30:00Z",
      "updatedAt": "2025-01-18T14:22:00Z"
    }
  ],
  "count": 1,
  "total": 45,
  "hasMore": true
}
```

## 엔티티 관리

### 엔티티 생성 (`create_entities`)

새로운 엔티티들을 생성합니다.

```typescript
create_entities({
  entities: [
    {
      name: "Kim Kim",
      entityType: "Person",
      observations: ["Software developer", "Lives in Seoul"]
    },
    {
      name: "KimCorp",
      entityType: "Company", 
      observations: ["AI startup", "Founded in 2023"]
    }
  ]
})
```

**파라미터**:
- `entities`: 생성할 엔티티 배열
  - `name` (string): 엔티티 이름 (고유 식별자)
  - `entityType` (string): 엔티티 타입 (Person, Company, Project 등)
  - `observations` (string[]): 관찰 내용 배열

**응답 예시**:
```json
{
  "success": true,
  "message": "Created 2 entities",
  "entities": ["Kim Kim", "KimCorp"]
}
```

### 엔티티 검색 (`search_nodes`)

키워드로 엔티티를 검색합니다.

```typescript
search_nodes({ query: "developer" })
```

**파라미터**:
- `query` (string): 검색 키워드 (이름, 타입, 관찰 내용에서 검색)

**응답 예시**:
```json
{
  "success": true,
  "query": "developer",
  "results": [
    {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

### 특정 엔티티 조회 (`open_nodes`)

이름으로 특정 엔티티들을 조회합니다.

```typescript
open_nodes({ names: ["Kim Kim", "KimCorp"] })
```

**파라미터**:
- `names` (string[]): 조회할 엔티티 이름 배열

**응답 예시**:
```json
{
  "success": true,
  "requestedNames": ["Kim Kim", "KimCorp"],
  "nodes": [
    {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "found": 1,
  "requested": 2
}
```

### 엔티티 삭제 (`delete_entities`)

엔티티와 관련된 모든 관계를 삭제합니다.

```typescript
delete_entities({ entityNames: ["Kim Kim"] })
```

**파라미터**:
- `entityNames` (string[]): 삭제할 엔티티 이름 배열

**응답 예시**:
```json
{
  "success": true,
  "message": "Deleted entities: Kim Kim",
  "deletedEntities": ["Kim Kim"]
}
```

## 관계 관리

### 관계 생성 (`create_relations`)

엔티티 간의 관계를 생성합니다.

```typescript
create_relations({
  relations: [
    {
      from: "Kim Kim",
      to: "KimCorp",
      relationType: "works_at"
    },
    {
      from: "Kim Kim", 
      to: "AI Project",
      relationType: "leads"
    }
  ]
})
```

**파라미터**:
- `relations`: 생성할 관계 배열
  - `from` (string): 관계의 시작 엔티티 이름
  - `to` (string): 관계의 대상 엔티티 이름  
  - `relationType` (string): 관계 타입 (works_at, leads, belongs_to 등)

**응답 예시**:
```json
{
  "success": true,
  "message": "Created 2 relations",
  "relations": [
    {
      "from": "Kim Kim",
      "to": "KimCorp", 
      "relationType": "works_at"
    }
  ]
}
```

### 관계 삭제 (`delete_relations`)

특정 관계를 삭제합니다.

```typescript
delete_relations({
  relations: [
    {
      from: "Kim Kim",
      to: "KimCorp",
      relationType: "works_at"
    }
  ]
})
```

**파라미터**:
- `relations`: 삭제할 관계 배열 (from, to, relationType 모두 일치해야 함)

## 관찰 내용 관리

### 관찰 내용 추가 (`add_observations`)

기존 엔티티에 새로운 관찰 내용을 추가합니다.

```typescript
add_observations({
  observations: [
    {
      entityName: "Kim Kim",
      contents: ["Speaks Korean fluently", "Expert in TypeScript"]
    },
    {
      entityName: "KimCorp",
      contents: ["Remote-first company", "15 employees"]
    }
  ]
})
```

**파라미터**:
- `observations`: 추가할 관찰 내용 배열
  - `entityName` (string): 대상 엔티티 이름
  - `contents` (string[]): 추가할 관찰 내용 배열

**응답 예시**:
```json
{
  "success": true,
  "message": "Added observations",
  "observations": [
    {
      "entityName": "Kim Kim",
      "contents": ["Speaks Korean fluently", "Expert in TypeScript"]
    }
  ]
}
```

### 관찰 내용 삭제 (`delete_observations`)

엔티티에서 특정 관찰 내용을 삭제합니다.

```typescript
delete_observations({
  deletions: [
    {
      entityName: "Kim Kim", 
      observations: ["Lives in Seoul"]
    }
  ]
})
```

**파라미터**:
- `deletions`: 삭제할 관찰 내용 배열
  - `entityName` (string): 대상 엔티티 이름
  - `observations` (string[]): 삭제할 관찰 내용 배열 (정확히 일치해야 함)

## 동기화 연산

### 원격에서 풀 (`sync_pull`)

GitHub에서 최신 데이터를 가져와 로컬과 동기화합니다.

```typescript
sync_pull()
```

**응답 예시**:
```json
{
  "operation": "sync_pull",
  "success": true,
  "conflictResolved": false,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

### 원격으로 푸시 (`sync_push`)

로컬 데이터를 GitHub 저장소로 푸시합니다.

```typescript
// 기본 푸시
sync_push()

// 커스텀 메시지로 푸시
sync_push({ commitMessage: "프로젝트 데이터 업데이트" })
```

**응답 예시**:
```json
{
  "operation": "sync_push",
  "success": true,
  "conflictResolved": false,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

### 강제 동기화 (`force_sync`)

충돌을 무시하고 양방향 동기화를 수행합니다.

```typescript
force_sync()
```

**응답 예시**:
```json
{
  "operation": "force_sync", 
  "success": true,
  "conflictResolved": true,
  "lastSync": "2025-01-01T00:00:00.000Z"
}
```

## 백업 및 히스토리 관리

### 백업 생성 (`create_backup`)

현재 메모리 상태의 백업을 생성합니다.

```typescript
// 자동 이름으로 백업
create_backup()

// 커스텀 이름으로 백업  
create_backup({ backupName: "stable-v2.0" })
```

**응답 예시**:
```json
{
  "success": true,
  "backupName": "backup-2025-01-01T10:30:00.000Z",
  "message": "Backup created successfully"
}
```

### 커밋 히스토리 조회 (get_commit_history)

GitHub 저장소의 최근 커밋 히스토리를 조회합니다.

```typescript
// 기본 10개 조회
get_commit_history()

// 원하는 개수만 조회
get_commit_history({ limit: 5 })
```
**파라미터**:
- `limit`: 조회할 커밋 개수 (기본값: 10)

**응답 예시**:
```json
{
  "success": true,
  "commits": [
    {
      "sha": "abc123...",
      "message": "feat: Add 2 entities (John Doe, Company ABC)",
      "author": "username",
      "date": "2025-01-01T10:30:00Z",
      "url": "https://github.com/user/repo/commit/abc123..."
    }
  ],
  "count": 5
}
```

## 전체 조회

### 전체 그래프 읽기 (`read_graph`)

전체 지식 그래프를 조회합니다.

```typescript
read_graph()
```

**응답 예시**:
```json
{
  "entities": {
    "Kim Kim": {
      "name": "Kim Kim",
      "entityType": "Person",
      "observations": ["Software developer", "Lives in Seoul"],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  },
  "relations": [
    {
      "from": "Kim Kim",
      "to": "KimCorp",
      "relationType": "works_at", 
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  },
  "summary": {
    "entityCount": 1,
    "relationCount": 1,
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  }
}
```

## 사용 예시
Link : https://github.com/YeomYuJun/remote_memory/blob/main/memory/graph.json

## 에러 처리

모든 API 호출에서 에러가 발생할 경우 다음과 같은 형식으로 응답됩니다:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## 제한사항

- 엔티티 이름은 고유해야 함
- GitHub API rate limit: 시간당 5,000 요청
- 최대 파일 크기: 100MB (GitHub 제한)
- 네트워크 연결 필수 (동기화 시)

## 동기화 동작

### 자동 푸시 설정 (AUTO_PUSH)
- `AUTO_PUSH=true`: 모든 CRUD 작업 후 자동으로 GitHub에 푸시
- `AUTO_PUSH=false` (기본값): 수동으로 `sync_push` 호출 시에만 푸시

### 초기화 동작
- 서버 시작 시 원격 저장소에서 데이터를 가져옴
- 원격에 파일이 없어도 빈 상태로 자동 푸시하지 않음
- 데이터가 있는 경우에만 푸시 수행