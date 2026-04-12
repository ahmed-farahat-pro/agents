# 🦉 NightOwl Custom MCP Servers

Three custom MCP servers created specifically for NightOwl to enhance the AI agent team's capabilities.

---

## 📁 Server Locations

```
mcp-servers/
├── arabic-rtl-auditor/     # Arabic RTL compliance auditing
├── task-splitter/          # Intelligent task splitting
└── smart-code-search/      # Semantic code search
```

---

## 1. 🌙 Arabic/RTL Auditor MCP

**Location:** `mcp-servers/arabic-rtl-auditor/`

### Purpose
Audits and fixes Arabic RTL (Right-to-Left) compliance in code. Essential for Saudi/GCC projects like Bonyad and Problem-X.

### Tools

| Tool | Description |
|------|-------------|
| `check_rtl_compliance` | Analyze code for RTL issues, returns score (0-100) |
| `suggest_arabic_fixes` | Auto-fix RTL issues (CSS logical properties, etc.) |
| `validate_arabic_text` | Validate Arabic text rendering |
| `generate_arabic_tests` | Generate RTL test cases for components |

### Usage Example

```typescript
// Check a CSS file for RTL issues
const result = await mcp.callTool('arabic-rtl-auditor', 'check_rtl_compliance', {
  code: `
    .button {
      margin-left: 10px;
      text-align: left;
      float: right;
    }
  `,
  language: 'css',
  filename: 'Button.module.css'
});

// Result:
// {
//   "score": 40,
//   "issues": [
//     {
//       "line": 3,
//       "severity": "error",
//       "rule": "NO_PHYSICAL_DIRECTIONS",
//       "message": "Use logical properties instead of physical directions",
//       "suggestion": "Replace with margin-inline-start"
//     }
//   ]
// }
```

### Assigned To
- **frontend-dev** - For RTL component development
- **qa-tester** - For RTL testing
- **code-reviewer** - For RTL compliance review

---

## 2. 🔀 Task Splitter MCP

**Location:** `mcp-servers/task-splitter/`

### Purpose
Intelligently splits development tasks across NightOwl's 7-agent team. Optimizes for parallel execution.

### Tools

| Tool | Description |
|------|-------------|
| `analyze_complexity` | Analyze task type, domains, complexity |
| `split_task` | Split into subtasks for each agent |
| `detect_conflicts` | Detect parallel execution conflicts |

### Usage Example

```typescript
// Split a task across agents
const split = await mcp.callTool('task-splitter', 'split_task', {
  task: 'Add HyperPay refund webhook to Bonyad backend'
});

// Result:
// {
//   "originalTask": "Add HyperPay refund webhook...",
//   "strategy": "feature task: backend, payment",
//   "subtasks": [
//     { "id": "task-1", "agent": "planner", "title": "Create plan", "estimatedHours": 2 },
//     { "id": "task-2", "agent": "backend-dev", "title": "Implement API", "estimatedHours": 6 },
//     { "id": "task-3", "agent": "qa-tester", "title": "Write tests", "estimatedHours": 3 }
//   ],
//   "parallelGroups": [["task-1"], ["task-2"], ["task-3"]],
//   "totalEstimatedHours": 12
// }
```

### Assigned To
- **orchestrator** - For task delegation planning

---

## 3. 🔍 Smart Code Search MCP

**Location:** `mcp-servers/smart-code-search/`

### Purpose
Semantic code search using embeddings. Find code by meaning, not just keywords.

### Tools

| Tool | Description |
|------|-------------|
| `index_repository` | Index a codebase for searching |
| `semantic_query` | Search by natural language |
| `find_similar_functions` | Find similar code patterns |
| `natural_language_query` | Ask questions about codebase |

### Usage Example

```typescript
// 1. Index the repository
await mcp.callTool('smart-code-search', 'index_repository', {
  repositoryPath: '/workspace/bonyad',
  repositoryName: 'bonyad'
});

// 2. Search semantically
const results = await mcp.callTool('smart-code-search', 'semantic_query', {
  query: 'how do we handle payment retries when they fail',
  repository: 'bonyad',
  topK: 5
});

// 3. Ask natural language questions
const answer = await mcp.callTool('smart-code-search', 'natural_language_query', {
  question: 'Where is the HyperPay integration configured?',
  repository: 'bonyad'
});
```

### Assigned To
- **planner** - For codebase understanding
- **backend-dev** - For finding similar implementations

---

## 🚀 Building & Running

### Build All MCP Servers

```bash
cd /Users/ahmedfarahat/Desktop/ai-agent-poc/nightowl

# Build Arabic RTL Auditor
cd mcp-servers/arabic-rtl-auditor
npm install
npm run build

# Build Task Splitter
cd ../task-splitter
npm install
npm run build

# Build Smart Code Search
cd ../smart-code-search
npm install
npm run build
```

### Test MCP Servers

```bash
# Run individual server
node mcp-servers/arabic-rtl-auditor/dist/index.js
```

---

## ⚙️ Configuration

Already added to `config/mcp-servers.json`:

```json
{
  "servers": {
    "arabic-rtl-auditor": {
      "type": "stdio",
      "command": "node",
      "args": ["/workspace/mcp-servers/arabic-rtl-auditor/dist/index.js"],
      "enabled": true
    },
    "task-splitter": {
      "type": "stdio",
      "command": "node",
      "args": ["/workspace/mcp-servers/task-splitter/dist/index.js"],
      "enabled": true
    },
    "smart-code-search": {
      "type": "stdio",
      "command": "node",
      "args": ["/workspace/mcp-servers/smart-code-search/dist/index.js"],
      "enabled": true
    }
  },
  "agentTools": {
    "orchestrator": [..., "task-splitter"],
    "planner": [..., "smart-code-search"],
    "backend-dev": [..., "smart-code-search"],
    "frontend-dev": [..., "arabic-rtl-auditor"],
    "qa-tester": [..., "arabic-rtl-auditor"],
    "code-reviewer": [..., "arabic-rtl-auditor"]
  }
}
```

---

## 🎯 Use Cases

### For Bonyad/Problem-X (Saudi Projects)

```typescript
// Frontend dev uses RTL auditor
const rtlCheck = await mcp.callTool('arabic-rtl-auditor', 'check_rtl_compliance', {
  code: componentCode,
  language: 'tsx'
});

// Generate tests for RTL
const tests = await mcp.callTool('arabic-rtl-auditor', 'generate_arabic_tests', {
  componentCode,
  componentName: 'PaymentForm'
});
```

### For Task Management

```typescript
// Orchestrator splits large tasks
const plan = await mcp.callTool('task-splitter', 'split_task', {
  task: 'Build new user dashboard with analytics'
});

// Execute in parallel where possible
for (const group of plan.parallelGroups) {
  await Promise.all(group.map(taskId => executeTask(taskId)));
}
```

### For Code Understanding

```typescript
// Planner searches for patterns
const similar = await mcp.callTool('smart-code-search', 'find_similar_functions', {
  code: currentFunction,
  repository: 'bonyad',
  topK: 3
});
```

---

## 📝 Notes

- **Arabic RTL Auditor**: Uses regex-based rules. For production, consider adding AI-powered analysis with Claude.
- **Task Splitter**: Simple heuristic-based splitting. Can be enhanced with ML models for better estimation.
- **Smart Code Search**: Uses simplified TF-IDF embeddings. For production, integrate OpenAI/Cohere embeddings API.

---

**NightOwl now has 38 MCP servers (35 built-in + 3 custom)!** 🦉🚀
