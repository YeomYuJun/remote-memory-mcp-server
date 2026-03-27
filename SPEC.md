# Remote Memory MCP Server API Specification

This document provides detailed API usage and examples for the Remote Memory MCP Server.

## Overview

Remote Memory MCP Server provides 20 tools across 4 categories:

- **Project Management** (v1.4.0+): `list_projects`, `create_project`, `switch_project`
- **Entity Management**: `create_entities`, `delete_entities`, `open_nodes`, `search_nodes`
- **Entity Query** (v1.3.0+): `list_entities`, `get_entity_names`, `get_entity_types`
- **Relation Management**: `create_relations`, `delete_relations`
- **Observation Management**: `add_observations`, `delete_observations`
- **Synchronization**: `sync_pull`, `sync_push`, `force_sync`
- **Backup/History**: `create_backup`, `get_commit_history`
- **Full Query**: `read_graph`

### Common Parameter: `project`

All tools (except project management tools) accept an optional `project` parameter.
- **Omitted**: operates on the current active project
- **Specified**: targets that specific project without changing the active project

```typescript
// Active project (default behavior)
create_entities({ entities: [...] })

// Target a specific project without switching
create_entities({ entities: [...], project: "blog" })
```

---

## Project Management (v1.4.0+)

Projects isolate memory data per context (e.g., per codebase, per client, per domain).
Each project is stored as a separate file in the GitHub repository.

### Repository structure

```
memory/
├── index.json           ← project index + active project pointer
├── graph.json           ← "default" project (backward compatible)
└── blog/
    └── graph.json       ← "blog" project
└── my-app/
    └── graph.json       ← "my-app" project
```

### List Projects (`list_projects`)

Returns all projects and the currently active project.

```typescript
list_projects()
```

**Response**:
```json
{
  "success": true,
  "activeProject": "blog",
  "projects": [
    { "name": "default", "createdAt": "2025-01-01T00:00:00.000Z" },
    { "name": "blog", "description": "Blog project memory", "createdAt": "2025-03-01T00:00:00.000Z" }
  ],
  "count": 2
}
```

### Create Project (`create_project`)

Creates a new project. Does **not** switch to it automatically.

```typescript
create_project({
  name: "my-app",           // required: alphanumeric, hyphens, underscores only
  description: "My app"     // optional
})
```

**Response**:
```json
{
  "success": true,
  "message": "Project 'my-app' created. Use switch_project to activate it.",
  "project": {
    "name": "my-app",
    "description": "My app",
    "createdAt": "2025-03-27T00:00:00.000Z"
  }
}
```

### Switch Project (`switch_project`)

Switches the active project and immediately loads its data.
The switch is persisted to `memory/index.json` in GitHub.

```typescript
switch_project({ project: "blog" })
```

**Response**:
```json
{
  "success": true,
  "message": "Switched to project 'blog'. Memory loaded.",
  "activeProject": "blog"
}
```

---

## Entity Management

### Create Entities (`create_entities`)

```typescript
create_entities({
  entities: [
    {
      name: "Kim Kim",
      entityType: "Person",
      observations: ["Software developer", "Lives in Seoul"]
    }
  ],
  project: "blog"  // optional
})
```

**Parameters**:
- `entities`: Array of entities
  - `name` (string): Unique identifier
  - `entityType` (string): Category (Person, Company, Project, etc.)
  - `observations` (string[]): Facts about the entity
- `project` (string, optional): Target project

**Response**:
```json
{
  "success": true,
  "message": "Created 1 entities",
  "entities": ["Kim Kim"],
  "project": "blog"
}
```

### Search Entities (`search_nodes`)

```typescript
search_nodes({
  query: "developer",
  project: "blog"   // optional
})
```

**Response**:
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
  "count": 1,
  "project": "blog"
}
```

### Retrieve Specific Entities (`open_nodes`)

```typescript
open_nodes({
  names: ["Kim Kim", "KimCorp"],
  project: "blog"  // optional
})
```

**Response**:
```json
{
  "success": true,
  "requestedNames": ["Kim Kim", "KimCorp"],
  "nodes": [...],
  "found": 1,
  "requested": 2,
  "project": "blog"
}
```

### Delete Entities (`delete_entities`)

Deletes entities and all associated relations.

```typescript
delete_entities({
  entityNames: ["Kim Kim"],
  project: "blog"  // optional
})
```

---

## Entity Query (v1.3.0+)

### Entity Type Statistics (`get_entity_types`)

```typescript
get_entity_types({ project: "blog" })  // project optional
```

**Response**:
```json
{
  "success": true,
  "types": [
    { "type": "Person", "count": 45 },
    { "type": "Company", "count": 23 }
  ],
  "totalTypes": 2,
  "totalEntities": 68,
  "project": "blog"
}
```

### Entity Name List (`get_entity_names`)

```typescript
get_entity_names({
  entityType: "Person",   // optional
  sortBy: "name",         // optional: createdAt | updatedAt | name
  sortOrder: "asc",       // optional: asc | desc
  project: "blog"         // optional
})
```

**Response**:
```json
{
  "success": true,
  "names": ["Alice", "Bob", "Charlie"],
  "count": 3,
  "project": "blog"
}
```

### Entity List (`list_entities`)

```typescript
list_entities({
  entityType: "Person",
  sortBy: "createdAt",
  sortOrder: "desc",
  dateFrom: "2025-01-01T00:00:00Z",
  dateTo: "2025-01-31T23:59:59Z",
  limit: 50,
  offset: 0,
  project: "blog"   // optional
})
```

**Response**:
```json
{
  "success": true,
  "entities": [...],
  "count": 1,
  "total": 45,
  "offset": 0,
  "limit": 50,
  "hasMore": true,
  "project": "blog"
}
```

---

## Relation Management

### Create Relations (`create_relations`)

```typescript
create_relations({
  relations: [
    { from: "Kim Kim", to: "KimCorp", relationType: "works_at" }
  ],
  project: "blog"  // optional
})
```

### Delete Relations (`delete_relations`)

```typescript
delete_relations({
  relations: [
    { from: "Kim Kim", to: "KimCorp", relationType: "works_at" }
  ],
  project: "blog"  // optional
})
```

---

## Observation Management

### Add Observations (`add_observations`)

```typescript
add_observations({
  observations: [
    { entityName: "Kim Kim", contents: ["Expert in TypeScript"] }
  ],
  project: "blog"  // optional
})
```

### Delete Observations (`delete_observations`)

```typescript
delete_observations({
  deletions: [
    { entityName: "Kim Kim", observations: ["Lives in Seoul"] }
  ],
  project: "blog"  // optional
})
```

---

## Synchronization

All sync tools accept an optional `project` parameter.

### Pull from Remote (`sync_pull`)

```typescript
sync_pull({ project: "blog" })  // project optional
```

### Push to Remote (`sync_push`)

```typescript
sync_push({ commitMessage: "Update project data", project: "blog" })
```

### Force Sync (`force_sync`)

```typescript
force_sync({ project: "blog" })
```

---

## Backup and History

### Create Backup (`create_backup`)

Backup is stored under `backups/{project}/` in the repository.

```typescript
create_backup({ backupName: "stable-v2.0", project: "blog" })
```

**Response**:
```json
{
  "success": true,
  "backupName": "stable-v2.0",
  "backupPath": "backups/blog/stable-v2.0.json",
  "project": "blog",
  "timestamp": "2025-03-27T00:00:00.000Z"
}
```

### Get Commit History (`get_commit_history`)

```typescript
get_commit_history({ limit: 5, project: "blog" })
```

---

## Full Query

### Read Graph (`read_graph`)

```typescript
read_graph({ project: "blog" })  // project optional
```

**Response**:
```json
{
  "entities": { ... },
  "relations": [ ... ],
  "metadata": {
    "version": "1.0.0",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  },
  "summary": {
    "entityCount": 1,
    "relationCount": 1
  },
  "project": "blog"
}
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GITHUB_TOKEN` | Yes | — | Personal Access Token (repo scope) |
| `GITHUB_OWNER` | Yes | — | Repository owner |
| `GITHUB_REPO` | Yes | — | Repository name |
| `GITHUB_BRANCH` | No | `main` | Branch to use |
| `SYNC_INTERVAL` | No | `0` | Auto-pull interval in seconds (0 = manual) |
| `AUTO_PUSH` | No | `false` | Auto-push after CRUD operations |
| `PROJECT_NAME` | No | from `index.json` | Override active project on startup |

### Priority for active project

`PROJECT_NAME` env var → `index.json` activeProject field → `"default"`

---

## Error Handling

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common errors:
- Project not found → use `create_project` first
- Invalid project name → alphanumeric, hyphens, underscores only
- GitHub API rate limit exceeded → 5,000 requests/hour

---

## Limitations

- Entity names must be unique **within a project**
- GitHub API rate limit: 5,000 requests/hour
- Network connection required for sync operations
- Project name: alphanumeric, hyphens (`-`), underscores (`_`) only; `"default"` is reserved

---

## Usage Example (Link)

https://github.com/YeomYuJun/remote_memory/blob/main/memory/graph.json

---

# Remote Memory MCP Server API 사양서

## 개요

Remote Memory MCP Server는 4개 카테고리의 20개 도구를 제공합니다:

- **프로젝트 관리** (v1.4.0+): `list_projects`, `create_project`, `switch_project`
- **엔티티 관리**: `create_entities`, `delete_entities`, `open_nodes`, `search_nodes`
- **엔티티 조회** (v1.3.0+): `list_entities`, `get_entity_names`, `get_entity_types`
- **관계 관리**: `create_relations`, `delete_relations`
- **관찰 내용 관리**: `add_observations`, `delete_observations`
- **동기화**: `sync_pull`, `sync_push`, `force_sync`
- **백업/히스토리**: `create_backup`, `get_commit_history`
- **전체 조회**: `read_graph`

### 공통 파라미터: `project`

프로젝트 관리 도구를 제외한 **모든 도구**에 선택적 `project` 파라미터가 있습니다.
- **생략 시**: 현재 활성 프로젝트에 동작
- **지정 시**: 활성 프로젝트를 변경하지 않고 해당 프로젝트를 대상으로 동작

```typescript
// 활성 프로젝트에 동작 (기본)
create_entities({ entities: [...] })

// 활성 프로젝트 변경 없이 특정 프로젝트 대상
create_entities({ entities: [...], project: "blog" })
```

---

## 프로젝트 관리 (v1.4.0+)

프로젝트는 컨텍스트별(코드베이스, 클라이언트, 도메인 등)로 메모리 데이터를 격리합니다.
각 프로젝트는 GitHub 저장소의 별도 파일로 저장됩니다.

### 저장소 구조

```
memory/
├── index.json           ← 프로젝트 인덱스 + 활성 프로젝트 포인터
├── graph.json           ← "default" 프로젝트 (하위 호환)
└── blog/
    └── graph.json       ← "blog" 프로젝트
└── my-app/
    └── graph.json       ← "my-app" 프로젝트
```

### 프로젝트 목록 조회 (`list_projects`)

모든 프로젝트와 현재 활성 프로젝트를 반환합니다.

```typescript
list_projects()
```

**응답**:
```json
{
  "success": true,
  "activeProject": "blog",
  "projects": [
    { "name": "default", "createdAt": "2025-01-01T00:00:00.000Z" },
    { "name": "blog", "description": "블로그 프로젝트 메모리", "createdAt": "2025-03-01T00:00:00.000Z" }
  ],
  "count": 2
}
```

### 프로젝트 생성 (`create_project`)

새 프로젝트를 생성합니다. 생성 후 자동으로 전환되지 않습니다.

```typescript
create_project({
  name: "my-app",           // 필수: 영문자, 숫자, 하이픈, 언더스코어만
  description: "내 앱"      // 선택
})
```

**응답**:
```json
{
  "success": true,
  "message": "Project 'my-app' created. Use switch_project to activate it.",
  "project": {
    "name": "my-app",
    "description": "내 앱",
    "createdAt": "2025-03-27T00:00:00.000Z"
  }
}
```

### 프로젝트 전환 (`switch_project`)

활성 프로젝트를 변경하고 즉시 해당 프로젝트 데이터를 로드합니다.
전환 내용은 GitHub의 `memory/index.json`에 영속적으로 저장됩니다.

```typescript
switch_project({ project: "blog" })
```

**응답**:
```json
{
  "success": true,
  "message": "Switched to project 'blog'. Memory loaded.",
  "activeProject": "blog"
}
```

---

## 엔티티 관리

### 엔티티 생성 (`create_entities`)

```typescript
create_entities({
  entities: [
    {
      name: "Kim Kim",
      entityType: "Person",
      observations: ["Software developer", "Lives in Seoul"]
    }
  ],
  project: "blog"  // 선택
})
```

### 엔티티 검색 (`search_nodes`)

```typescript
search_nodes({ query: "developer", project: "blog" })
```

### 특정 엔티티 조회 (`open_nodes`)

```typescript
open_nodes({ names: ["Kim Kim", "KimCorp"], project: "blog" })
```

### 엔티티 삭제 (`delete_entities`)

엔티티와 관련 관계를 모두 삭제합니다.

```typescript
delete_entities({ entityNames: ["Kim Kim"], project: "blog" })
```

---

## 관계 관리

```typescript
create_relations({
  relations: [{ from: "Kim Kim", to: "KimCorp", relationType: "works_at" }],
  project: "blog"  // 선택
})

delete_relations({
  relations: [{ from: "Kim Kim", to: "KimCorp", relationType: "works_at" }],
  project: "blog"  // 선택
})
```

---

## 관찰 내용 관리

```typescript
add_observations({
  observations: [{ entityName: "Kim Kim", contents: ["Expert in TypeScript"] }],
  project: "blog"  // 선택
})

delete_observations({
  deletions: [{ entityName: "Kim Kim", observations: ["Lives in Seoul"] }],
  project: "blog"  // 선택
})
```

---

## 동기화

모든 동기화 도구에 선택적 `project` 파라미터를 지원합니다.

```typescript
sync_pull({ project: "blog" })
sync_push({ commitMessage: "업데이트", project: "blog" })
force_sync({ project: "blog" })
```

---

## 백업 및 히스토리

백업은 저장소의 `backups/{project}/` 하위에 저장됩니다.

```typescript
create_backup({ backupName: "stable-v2.0", project: "blog" })
get_commit_history({ limit: 5, project: "blog" })
```

---

## 설정

### 환경 변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `GITHUB_TOKEN` | 필수 | — | Personal Access Token (repo 권한) |
| `GITHUB_OWNER` | 필수 | — | 저장소 소유자 |
| `GITHUB_REPO` | 필수 | — | 저장소 이름 |
| `GITHUB_BRANCH` | 선택 | `main` | 사용할 브랜치 |
| `SYNC_INTERVAL` | 선택 | `0` | 자동 pull 간격(초), 0=수동 |
| `AUTO_PUSH` | 선택 | `false` | CRUD 후 자동 push 여부 |
| `PROJECT_NAME` | 선택 | `index.json`에서 | 시작 시 활성 프로젝트 override |

### 활성 프로젝트 우선순위

`PROJECT_NAME` 환경변수 → `index.json`의 activeProject → `"default"`

---

## 에러 처리

```json
{
  "success": false,
  "error": "Error message here"
}
```

주요 에러:
- 프로젝트 없음 → `create_project` 먼저 실행
- 잘못된 프로젝트 이름 → 영문자, 숫자, 하이픈, 언더스코어만 허용
- GitHub API 한도 초과 → 시간당 5,000 요청 제한

---

## 제한사항

- 엔티티 이름은 **프로젝트 내에서** 고유해야 함
- GitHub API rate limit: 시간당 5,000 요청
- 네트워크 연결 필수 (동기화 시)
- 프로젝트 이름: 영문자, 숫자, 하이픈(`-`), 언더스코어(`_`)만 허용; `"default"` 예약어
