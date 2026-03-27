# remote-memory-mcp-server
Remote Memory MCP Server

A GitHub-integrated remote memory management MCP server that syncs knowledge graph data with GitHub repositories for remote storage and collaboration.

## Features

- CRUD operations for entities, relations, and observations
- Real-time synchronization with GitHub repositories
- Conflict detection and resolution
- Automatic/manual synchronization options
- Search and filtering capabilities
- **Project-level memory isolation** (v1.4.0)
  - Multiple projects, each with independent memory
  - Persistent active project (stored in GitHub `memory/index.json`)
  - Per-call project override without switching active project
- **Enhanced entity query features** (v1.3.0)
  - Entity list retrieval (with filtering, sorting, pagination)
  - Quick entity name lookup
  - Entity type statistics
  - Date range filtering
- Enhanced commit messages (customizable)
- Backup functionality (per-project)
- Commit history tracking
- Optional auto-push (AUTO_PUSH environment variable)

## Installation

```bash
cd C:\YOUR_PATH\remote-memory-mcp
npm install
npm run build
```

## Configuration

### Required Parameters
- `GITHUB_TOKEN`: GitHub Personal Access Token (requires repo permissions)
- `GITHUB_OWNER`: GitHub repository owner
- `GITHUB_REPO`: GitHub repository name

### Optional Parameters
- `GITHUB_BRANCH`: Branch name to use (default: main)
- `SYNC_INTERVAL`: Auto-sync interval in seconds (0 for manual)
- `AUTO_PUSH`: Auto-push after CRUD operations (true/false, default: false)
- `PROJECT_NAME`: Active project on startup (default: from `memory/index.json`, fallback: `"default"`)

## Claude Desktop Setup

Add to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "remote-memory": {
      "command": "node",
      "args": ["C://YOUR_PATH//remote-memory-mcp//dist//index.js"],
      "env": {
        "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE",
        "GITHUB_OWNER": "YOUR_GITHUB_USERNAME",
        "GITHUB_REPO": "YOUR_GITHUB_REPO",
        "GITHUB_BRANCH": "main",
        "SYNC_INTERVAL": "0",
        "AUTO_PUSH": "false",
        "PROJECT_NAME": "my-project"
      }
    }
  }
}
```

## Usage

For detailed API usage and examples, see [SPEC.md](https://github.com/YeomYuJun/remote-memory-mcp-server/blob/main/SPEC.md/).

## Project-level Memory (v1.4.0)

Each project stores memory independently in the GitHub repository:

```
memory/
├── index.json           ← project index + active project pointer
├── graph.json           ← "default" project (backward compatible)
├── blog/
│   └── graph.json       ← "blog" project
└── my-app/
    └── graph.json       ← "my-app" project
```

### Quick Start

```typescript
// 1. Create a project
create_project({ name: "blog", description: "Blog memory" })

// 2. Switch to it
switch_project({ project: "blog" })

// 3. Work normally — all tools now target "blog"
create_entities({ entities: [...] })

// 4. Access another project without switching
read_graph({ project: "my-app" })
```

### Active Project Priority

`PROJECT_NAME` env var → `memory/index.json` → `"default"`

## Data Structure

Memory data is stored per project in the GitHub repository:

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
      "to": "Company ABC",
      "relationType": "works_at",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "lastModified": "2025-01-01T00:00:00.000Z",
    "lastSync": "2025-01-01T00:00:00.000Z"
  }
}
```

## Architecture

### Core Components

1. **GitHubClient**: Handles GitHub API interactions
2. **MemoryGraphManager**: Manages the in-memory knowledge graph
3. **SyncManager**: Handles synchronization and project management
4. **RemoteMemoryMCPServer**: Main MCP server class

### Synchronization Strategy

1. **Conflict Resolution**: Prioritizes based on latest modification timestamp
2. **Auto-push**: Immediately pushes local changes to remote
3. **Auto-pull**: Checks for remote changes at configured intervals
4. **Force Sync**: Performs bidirectional sync ignoring conflicts

## Important Notes

- Requires GitHub Personal Access Token (with repo permissions)
- GitHub API limits: 5,000 requests per hour for authenticated users
- Network connection required
- Project names: alphanumeric, hyphens, underscores only; `"default"` is reserved

## License

MIT License - Free to use, modify, and distribute

## Changelog

### v1.4.0
- **Project-level memory isolation**
  - `list_projects`: List all projects and active project
  - `create_project`: Create a new isolated project
  - `switch_project`: Switch active project (persisted to GitHub)
- **`project` parameter on all tools**: Target any project per-call without switching
- **Per-project backup paths**: `backups/{project}/backup-*.json`
- Added `PROJECT_NAME` environment variable
- Server version bumped to 1.4.0

### v1.3.0
- **New query tools**
  - `list_entities`: Retrieve entity list (with filtering, sorting, pagination)
  - `get_entity_names`: Quick entity name lookup
  - `get_entity_types`: Entity type statistics
- **Enhanced query capabilities**
  - EntityType filtering
  - Date range filtering (based on createdAt)
  - Sort options (createdAt, updatedAt, name)
  - Pagination (limit, offset)
- Improved handling of large datasets

### v1.2.0
- Prevented unnecessary auto-commits on initialization
- Added AUTO_PUSH environment variable for optional auto-push
- Added logic to prevent pushing empty graphs
- Improved initial load state tracking

### v1.1.0
- Custom commit message support
- Added backup system (`create_backup`)
- Commit history tracking (`get_commit_history`)
- Automatic commit message generation

### v1.0.0
- Initial release

---

# remote-memory-mcp-server
Remote Memory MCP Server

GitHub 연동 원격 메모리 관리 MCP 서버입니다.
지식 그래프 데이터를 GitHub 저장소와 동기화하여 Memory의 원격 저장 및 협업을 지원합니다.

## 기능

- 엔티티, 관계, 관찰 데이터의 CRUD 연산
- GitHub 저장소와의 실시간 동기화
- 충돌 감지 및 해결
- 자동/수동 동기화 옵션
- 검색 및 필터링 기능
- **프로젝트별 메모리 격리** (v1.4.0)
  - 프로젝트마다 독립된 메모리 저장
  - 활성 프로젝트 영속 저장 (GitHub `memory/index.json`)
  - 활성 프로젝트 전환 없이 특정 프로젝트 대상 per-call 지정
- **향상된 엔티티 조회 기능** (v1.3.0)
  - 엔티티 목록 조회 (필터링, 정렬, 페이지네이션)
  - 엔티티 이름만 조회 (빠른 검색)
  - 엔티티 타입별 통계
  - 날짜 범위 필터링
- 향상된 커밋 메시지(커스텀 명령 가능)
- 프로젝트별 백업 기능
- 커밋 히스토리 조회 기능
- 선택적 자동 푸시 기능 (AUTO_PUSH 환경변수)

## 설치

```bash
cd C:\YOUR_PATH\remote-memory-mcp
npm install
npm run build
```

## 설정

### 필수 파라미터
- `GITHUB_TOKEN`: GitHub Personal Access Token (repo 권한 필요)
- `GITHUB_OWNER`: GitHub 저장소 소유자
- `GITHUB_REPO`: GitHub 저장소 이름

### 선택 파라미터
- `GITHUB_BRANCH`: 사용할 브랜치명 (기본값: main)
- `SYNC_INTERVAL`: 자동 동기화 간격 초단위 (0이면 수동)
- `AUTO_PUSH`: CRUD 작업 후 자동 푸시 여부 (true/false, 기본값: false)
- `PROJECT_NAME`: 시작 시 활성 프로젝트 (기본값: `memory/index.json` 참조, fallback: `"default"`)

## Claude Desktop 설정

`claude_desktop_config.json` 파일에 추가:

```json
{
  "mcpServers": {
    "remote-memory": {
      "command": "node",
      "args": ["C://YOUR_PATH//remote-memory-mcp//dist//index.js"],
      "env": {
        "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE",
        "GITHUB_OWNER": "YOUR_GITHUB_USERNAME",
        "GITHUB_REPO": "YOUR_GITHUB_REPO",
        "GITHUB_BRANCH": "main",
        "SYNC_INTERVAL": "0",
        "AUTO_PUSH": "false",
        "PROJECT_NAME": "my-project"
      }
    }
  }
}
```

## 사용법

자세한 API 사용법과 예제는 [SPEC.md](https://github.com/YeomYuJun/remote-memory-mcp-server/blob/main/SPEC.md/)를 참조하세요.

## 프로젝트별 메모리 (v1.4.0)

```
memory/
├── index.json           ← 프로젝트 인덱스 + 활성 프로젝트 포인터
├── graph.json           ← "default" 프로젝트 (하위 호환)
├── blog/
│   └── graph.json       ← "blog" 프로젝트
└── my-app/
    └── graph.json       ← "my-app" 프로젝트
```

### 빠른 시작

```typescript
// 1. 프로젝트 생성
create_project({ name: "blog", description: "블로그 메모리" })

// 2. 전환
switch_project({ project: "blog" })

// 3. 평소처럼 사용 — 모든 툴이 "blog" 대상
create_entities({ entities: [...] })

// 4. 전환 없이 다른 프로젝트 접근
read_graph({ project: "my-app" })
```

## 아키텍처

### 주요 컴포넌트

1. **GitHubClient**: GitHub API 상호작용 담당
2. **MemoryGraphManager**: 메모리 그래프 관리
3. **SyncManager**: 동기화 및 프로젝트 관리
4. **RemoteMemoryMCPServer**: MCP 서버 메인 클래스

### 동기화 전략

1. **충돌 해결**: 최신 수정 시간 기준으로 우선순위 결정
2. **자동 푸시**: 로컬 변경 시 즉시 원격으로 푸시
3. **자동 풀**: 설정된 간격으로 원격 변경사항 확인
4. **강제 동기화**: 충돌 무시하고 양방향 동기화

## 주의사항

- GitHub Personal Access Token 필요 (repo 권한)
- GitHub API 제한: 인증된 사용자 시간당 5,000 요청
- 네트워크 연결 필수
- 프로젝트 이름: 영문자, 숫자, 하이픈, 언더스코어만 허용; `"default"` 예약어

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 변경 로그

### v1.4.0
- **프로젝트별 메모리 격리**
  - `list_projects`: 프로젝트 목록 및 활성 프로젝트 조회
  - `create_project`: 독립 프로젝트 생성
  - `switch_project`: 활성 프로젝트 전환 (GitHub에 영속 저장)
- **모든 툴에 `project` 파라미터 추가**: 전환 없이 per-call 프로젝트 지정
- **프로젝트별 백업 경로**: `backups/{project}/backup-*.json`
- `PROJECT_NAME` 환경변수 추가
- 서버 버전 1.4.0으로 업그레이드

### v1.3.0
- **새로운 조회 도구 추가**
  - `list_entities`: 엔티티 목록 조회 (필터링, 정렬, 페이지네이션 지원)
  - `get_entity_names`: 엔티티 이름만 빠르게 조회
  - `get_entity_types`: 엔티티 타입별 통계 조회
- **향상된 쿼리 기능**
  - EntityType별 필터링
  - 날짜 범위 필터링 (createdAt 기준)
  - 정렬 옵션 (createdAt, updatedAt, name)
  - 페이지네이션 (limit, offset)
- 대량 데이터 처리 개선

### v1.2.0
- 초기화 시 불필요한 자동 커밋 방지
- AUTO_PUSH 환경변수 추가로 선택적 자동 푸시 지원
- 빈 그래프 푸시 방지 로직 추가
- 초기 로드 상태 추적 개선

### v1.1.0
- 커스텀 커밋 메시지 지원
- 백업 시스템 추가 (`create_backup`)
- 커밋 히스토리 조회 (`get_commit_history`)
- 자동 커밋 메시지 생성

### v1.0.0
- 초기 릴리스
