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
- **Local mirror mode** (v2): persist the active project's graph to a local JSONL file in anthropic-memory canonical format, so external tools (e.g. graph-view) can read and write it directly. Includes divergence guard for multi-PC safety.

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
- `LOCAL_MIRROR_PATH`: Absolute path to a local JSONL mirror file (v2). When set, every mutation of the **active** project is mirrored to this file in anthropic-memory canonical format. External tools (e.g. graph-view) can read and write the same file. Unset = legacy behavior (in-memory + GitHub only).

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

## Local Mirror Mode (v2)

Set `LOCAL_MIRROR_PATH` to enable mirroring the **active project's** graph to a local JSONL file in anthropic-memory canonical format. External tools (e.g. graph-view) can read and write the same file, giving the user a UI on top of a remote-memory backed graph without graph-view needing to know about GitHub.

### Behavior

- **Bootstrap**: if the mirror file exists *and* its sidecar (`<mirror>.sync-state.json`) names the current active project, remote-memory loads from the mirror (preferring the user's local edits over GitHub). Otherwise, GitHub is pulled and the mirror is seeded.
- **Before every tool call**: mirror mtime is checked; if it changed (external writer), the in-memory graph is reloaded from the mirror.
- **After every mutation**: the in-memory graph is atomically written back to the mirror (`.tmp` + rename). If the file was modified externally during the operation (race), the in-memory mutation is rolled back and an error is surfaced.
- **JSONL line format**: anthropic memory MCP compatible — `{"type":"entity"|"relation", ...}` with optional `createdAt`/`updatedAt` extension fields. Unknown fields are silently dropped on read.
- **Per-call `project` override** (e.g. `read_graph({ project: "blog" })`) does **not** touch the mirror — the mirror always represents the active project.
- **`switch_project`** rewrites the mirror with the new active project's graph and updates the sidecar.

### Divergence Guard (multi-PC safety)

When the same GitHub repo is shared across multiple machines, `sync_pull` / `sync_push` follow this policy (active project only):

| State | `sync_pull` result |
|---|---|
| Only GitHub changed | normal pull, mirror updated (status: `pulled`) |
| Only local changed | pull skipped, suggest `sync_push` (status: `local-only`) |
| Both changed (divergence) | **pull refused**, choose with `force_sync` (status: `diverged`) |
| Neither changed | no-op (status: `up-to-date`) |

`sync_push` applies the same baseline check — if GitHub advanced since the last sync, the push is refused (`remote-ahead`). `force_sync` is the escape hatch and bypasses both guards.

The baseline (last-pull SHA + graph digest + project name) is persisted to the sidecar file (`<LOCAL_MIRROR_PATH>.sync-state.json`) so it survives process restarts. **The sidecar is owned by remote-memory; external tools must not modify it.**

### graph-view integration example

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

graph-view auto-detects `LOCAL_MIRROR_PATH` (via env or `mcpServers.remote-memory.env`) and switches to mirror backend automatically.

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
