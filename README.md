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
        "SYNC_INTERVAL": "300"
      }
    }
  }
}
```

## 사용법

자세한 API 사용법과 예제는 ...를 참조하세요.

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
