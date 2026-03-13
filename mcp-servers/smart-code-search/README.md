# 🦉 Smart Code Search MCP Server

Semantic code search using embeddings. Find code by meaning, not just keywords.

## Features

- **Semantic Search** - Find code by natural language description
- **Similar Functions** - Find similar implementations
- **NL Queries** - Ask questions about your codebase
- **Repository Indexing** - Fast vector-based search

## Installation

```bash
cd mcp-servers/smart-code-search
npm install
npm run build
```

## Tools

### `index_repository`
Indexes a codebase for searching.

### `semantic_query`
Search by natural language.

```javascript
const results = await client.callTool('semantic_query', {
  query: 'how do we handle payment retries',
  repository: 'bonyad',
  topK: 5
});
```

### `find_similar_functions`
Find similar code patterns.

### `natural_language_query`
Ask questions about the codebase.

```javascript
const answer = await client.callTool('natural_language_query', {
  question: 'Where is the HyperPay integration configured?',
  repository: 'bonyad'
});
```

## Usage Example

```javascript
// 1. Index repository
await client.callTool('index_repository', {
  repositoryPath: '/workspace/bonyad',
  repositoryName: 'bonyad'
});

// 2. Search
const results = await client.callTool('semantic_query', {
  query: 'payment refund logic',
  repository: 'bonyad'
});
```

## Integration with NightOwl

Add to `config/mcp-servers.json`:

```json
{
  "smart-code-search": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/mcp-servers/smart-code-search/dist/index.js"],
    "enabled": true
  }
}
```

## Note

This implementation uses simplified TF-IDF embeddings. For production, integrate with:
- OpenAI Embeddings API
- Cohere Embed
- Local models (sentence-transformers)
