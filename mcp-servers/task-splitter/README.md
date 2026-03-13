# 🦉 Task Splitter MCP Server

Intelligent task splitting across the NightOwl 7-agent team.
Optimizes for parallel execution and agent expertise.

## Features

- **Task Analysis** - Determines type, domains, and complexity
- **Smart Splitting** - Creates subtasks for each agent
- **Conflict Detection** - Identifies potential parallel execution issues
- **Execution Planning** - Generates optimal execution order

## Installation

```bash
cd mcp-servers/task-splitter
npm install
npm run build
```

## Tools

### `analyze_complexity`
Analyzes task characteristics.

**Input:**
- `task` - Task description

**Output:**
```json
{
  "type": "feature",
  "domains": ["backend", "database"],
  "complexity": "M",
  "requiresFrontend": false,
  "requiresBackend": true,
  "requiresDatabase": true,
  "parallelizable": true
}
```

### `split_task`
Splits task into agent subtasks.

**Output:**
```json
{
  "originalTask": "Add payment webhook",
  "subtasks": [
    { "id": "task-1", "agent": "planner", "title": "Create plan", ... },
    { "id": "task-2", "agent": "backend-dev", "title": "Implement API", ... },
    { "id": "task-3", "agent": "qa-tester", "title": "Write tests", ... }
  ],
  "parallelGroups": [["task-1"], ["task-2"], ["task-3"]],
  "totalEstimatedHours": 12
}
```

### `detect_conflicts`
Detects parallel execution conflicts.

## Usage Example

```javascript
const split = await client.callTool('split_task', {
  task: 'Add HyperPay refund webhook to Bonyad backend'
});

// NightOwl orchestrator uses this to delegate to agents
```

## Integration with NightOwl

Add to `config/mcp-servers.json`:

```json
{
  "task-splitter": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/mcp-servers/task-splitter/dist/index.js"],
    "enabled": true
  }
}
```
