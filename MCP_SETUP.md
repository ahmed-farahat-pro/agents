# 🔧 MCP Servers Setup Guide

This guide explains how to get MCP servers running correctly for GitLab integration and codebase access.

## Quick Start

### 1. Run Initialization Script

```bash
node scripts/init-mcp.js
```

This will:
- Check prerequisites (Node.js, npx)
- Create workspace directories
- Pre-install critical MCP packages
- Test GitLab connectivity

### 2. Start the Bot

```bash
npm start
# or
pm2 restart ecosystem.config.js
```

The MCP servers will initialize automatically when the bot starts.

### 3. Test via Telegram

Send these commands to your bot:
- `/status` - Check system and MCP status
- `/testmcp` - Run full MCP connectivity test
- `/findproject myapp` - Search for GitLab projects

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/status` | Check system status including MCP servers |
| `/testmcp` | Run MCP servers and GitLab connectivity test |
| `/initmcp` | Initialize/re-initialize MCP servers |
| `/findproject <query>` | Search GitLab projects by name |
| `/project <name>` | Switch to a specific project |

## How It Works

### Project Resolution

When you create a plan with `/plan task | project`, the system:

1. **Resolves the project name** using multiple strategies:
   - Direct path lookup (e.g., `namespace/project-name`)
   - Cached project list
   - GitLab API search
   - Fuzzy matching on project names

2. **Fetches codebase context**:
   - Tries MCP filesystem first (if project cloned locally)
   - Falls back to GitLab API for file listing
   - Identifies relevant files based on task keywords
   - Reads content of key files (up to 3KB each)

3. **Creates implementation plan**:
   - Analyzes existing codebase structure
   - Suggests files to modify/create
   - Provides step-by-step implementation guide

### MCP Server Architecture

```
┌─────────────────┐
│   Nigents Bot   │
└────────┬────────┘
         │
    ┌────┴────┐
    │ MCP     │  ← Manages MCP server connections
    │ Client  │
    └────┬────┘
         │
    ┌────┴────┬────────┬────────┐
    │         │        │        │
┌───▼───┐ ┌───▼──┐ ┌───▼──┐ ┌──▼───┐
│GitLab │ │Git   │ │Files │ │Fetch │
│Server │ │Server│ │System│ │Server│
└───┬───┘ └──┬───┘ └───┬──┘ └──┬───┘
    │        │         │       │
    ▼        ▼         ▼       ▼
 GitLab   Git      Local    HTTP
  API   Repos    Filesystem  APIs
```

## Configuration

### Environment Variables

Required:
```bash
GITLAB_TOKEN=your_gitlab_personal_access_token
```

Optional:
```bash
GITLAB_NAMESPACE=your-default-namespace
GITLAB_URL=https://gitlab.com  # or your self-hosted URL
GITHUB_TOKEN=your_github_token
```

### MCP Servers Config

File: `config/mcp-servers.json`

Key servers enabled by default:
- `filesystem` - Read/write local files in `/workspace`
- `git` - Git operations on local repos
- `gitlab` - GitLab API access
- `github` - GitHub API access
- `fetch` - HTTP requests
- `sequential-thinking` - Advanced reasoning
- `memory` - Persistent memory

## Troubleshooting

### MCP Servers Not Connecting

1. **Check npx is available**:
   ```bash
   which npx
   npx --version
   ```

2. **Run the init script**:
   ```bash
   node scripts/init-mcp.js
   ```

3. **Check logs**:
   ```bash
   tail -f logs/bot.log | grep "\[MCP\]"
   ```

4. **Test manually**:
   ```bash
   npx -y @modelcontextprotocol/server-filesystem /workspace
   ```

### GitLab Projects Not Found

1. **Verify token**:
   ```bash
   curl -H "PRIVATE-TOKEN: $GITLAB_TOKEN" https://gitlab.com/api/v4/user
   ```

2. **Check namespace**:
   - If your projects are under a group/namespace, set `GITLAB_NAMESPACE`
   - Or use full path: `/project namespace/project-name`

3. **Search for projects**:
   - Use `/findproject keyword` to search
   - Use `/projects` to list accessible projects

### Workspace Not Accessible

The filesystem server expects projects at `/workspace/repos/<project-name>`. To clone a project:

```bash
mkdir -p /workspace/repos
cd /workspace/repos
git clone git@gitlab.com:namespace/project-name.git
```

Then use `/project project-name` in the bot.

## Dashboard Endpoints

The dashboard provides MCP health information:

- `GET /api/status` - System status with MCP info
- `GET /api/mcp/health` - Detailed MCP server health
- `GET /api/gitlab/test` - GitLab connectivity test

## Architecture Improvements

### Changes Made

1. **MCP Client** (`src/mcp/mcp-client.js`):
   - Better error handling and logging
   - Automatic workspace directory creation
   - Server status tracking
   - Connection timeout handling

2. **GitLab Tool** (`src/tools/gitlab.js`):
   - Project caching for faster lookups
   - Fuzzy project name matching
   - Multiple resolution strategies
   - Better error messages

3. **Planner Agent** (`src/agents/planner.js`):
   - Project resolution before analysis
   - Multiple codebase analysis sources
   - Better fallback handling
   - Improved prompt with codebase context

4. **New Commands**:
   - `/testmcp` - Full MCP test
   - `/initmcp` - Initialize MCP servers
   - `/findproject` - Search projects

## Next Steps

1. Run `node scripts/init-mcp.js` to initialize
2. Set `GITLAB_TOKEN` in your environment
3. Start the bot with `npm start`
4. Test with `/testmcp` in Telegram
5. Try creating a plan: `/plan add login feature | myproject`
