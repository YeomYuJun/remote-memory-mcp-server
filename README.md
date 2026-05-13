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
- **향상된 엔티티 조회 기능** (v1.3.0)
  - 엔티티 목록 조회 (필터링, 정렬, 페이지네이션)
  - 엔티티 이름만 조회 (빠른 검색)
  - 엔티티 타입별 통계
  - 날짜 범위 필터링
- 향상된 커밋 메시지(커스텀 명령 가능)
- 백업 기능 추가
- 커밋 히스토리 조회 기능
- 선택적 자동 푸시 기능 (AUTO_PUSH 환경변수)
- **LOCAL_MIRROR_PATH 모드** — 모든 변경을 anthropic 호환 JSONL 미러 파일에 atomic write. graph-view 등 외부 도구와 동일 파일을 공유하면서 양방향 일관성 유지 (v2)

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
- `SYNC_INTERVAL` : 자동 동기화 간격 초단위 (0이면 수동)  
- `AUTO_PUSH`: CRUD 작업 후 자동 푸시 여부 (true/false, 기본값: false)
- `LOCAL_MIRROR_PATH`: anthropic 호환 JSONL 미러 파일 경로. 설정 시 모든 변경이 이 파일에 atomic write되며, 외부 도구(graph-view 등)가 같은 파일을 공유 가능. 미설정 시 기존 동작 (in-memory + GitHub만)

## LOCAL_MIRROR_PATH 모드 (v2)

`LOCAL_MIRROR_PATH`를 설정하면 remote-memory가 in-memory 그래프를 디스크 JSONL 파일에 항상 미러링합니다. 같은 파일을 graph-view 등 다른 도구가 직접 read/write할 수 있어, 한 그래프를 여러 시각으로 동시에 다룰 수 있습니다.

### 동작 요약

- **부팅**: 미러 파일이 있으면 그것을 로드 (GitHub pull 대체). 없으면 GitHub pull 후 미러 시드
- **매 도구 호출 직전**: 미러 mtime 변화 감지 시 자동 reload (외부 writer 반영)
- **매 mutation 직후**: in-memory → 미러 파일 atomic write (.tmp + rename). 실패 시 in-memory 변경 rollback
- **JSONL 라인 포맷**: anthropic memory MCP 호환 (`{"type":"entity"|"relation", ...}` + 옵션 `createdAt`/`updatedAt`)

### Divergence Guard (멀티 PC 안전성)

여러 PC에서 같은 GitHub repo를 공유할 때 데이터 손실을 막기 위해 `sync_pull` / `sync_push`는 다음 정책을 따릅니다:

| 상태 | sync_pull 결과 |
|---|---|
| GitHub만 변경 | 정상 pull, 미러 갱신 (status: `pulled`) |
| 로컬만 변경 | pull 건너뜀, `sync_push` 권유 (status: `local-only`) |
| 양쪽 다 변경 (divergence) | **pull 거부**. `force_sync`로 한쪽 선택 (status: `diverged`) |
| 양쪽 무변경 | no-op (status: `up-to-date`) |

`sync_push`도 동일 — GitHub이 baseline 이후 변경됐으면 push 거부 (`remote-ahead`). `force_sync`는 escape hatch.

Baseline은 `<LOCAL_MIRROR_PATH>.sync-state.json` 사이드카에 영속화되므로 프로세스 재시작 후에도 유지됩니다. **이 사이드카는 graph-view 등 외부 도구가 절대 손대지 않습니다.**

### graph-view 연동 예시

```json
{
  "mcpServers": {
    "remote-memory": {
      "command": "node",
      "args": ["C:/YOUR_PATH/remote-memory-mcp/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_...",
        "GITHUB_OWNER": "...",
        "GITHUB_REPO": "...",
        "LOCAL_MIRROR_PATH": "D:/memory/memory.jsonl"
      }
    },
    "graph-view": {
      "command": "node",
      "args": ["D:/mcpapps/graph-view/dist/server.js"],
      "env": {
        "MEMORY_FILE_PATH": "D:/memory/memory.jsonl"
      }
    }
  }
}
```

graph-view는 `LOCAL_MIRROR_PATH` env (또는 `mcpServers.remote-memory.env.LOCAL_MIRROR_PATH` auto-detect)를 인식해 mirror backend로 자동 전환됩니다.

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
        "AUTO_PUSH": "false"
      }
    }
  }
}
```

## 사용법

자세한 API 사용법과 예제는 [SPEC.md](https://github.com/YeomYuJun/remote-memory-mcp-server/blob/main/SPEC.md/)를 참조하세요.

## 데이터 구조

메모리 데이터는 GitHub 저장소의 `memory/graph.json` 파일에 저장됩니다:

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

## 아키텍처

### 주요 컴포넌트

1. **GitHubClient**: GitHub API 상호작용 담당
2. **MemoryGraphManager**: 메모리 그래프 관리  
3. **SyncManager**: 동기화 관리
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
- 시간당 5,000 요청 제한, 제한 초과 시 403 오류 발생

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 변경 로그

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