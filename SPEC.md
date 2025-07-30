# Remote Memory MCP Server API 사양서

이 문서는 Remote Memory MCP Server의 상세한 API 사용법과 예제를 제공합니다.

## 개요

Remote Memory MCP Server는 다음과 같은 도구들을 제공합니다:

- **엔티티 관리**: `create_entities`, `delete_entities`, `open_nodes`, `search_nodes`
- **관계 관리**: `create_relations`, `delete_relations`
- **관찰 내용 관리**: `add_observations`, `delete_observations`
- **동기화**: `sync_pull`, `sync_push`, `force_sync`
- **조회**: `read_graph`

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
sync_push()
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