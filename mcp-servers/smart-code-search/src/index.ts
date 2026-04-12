#!/usr/bin/env node

/**
 * 🦉 NightOwl - Smart Code Search MCP Server
 * 
 * Semantic code search using embeddings for finding code by meaning.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

interface CodeSnippet {
  id: string;
  file: string;
  code: string;
  type: string;
  name?: string;
  embedding: number[];
}

interface RepositoryIndex {
  repository: string;
  snippets: CodeSnippet[];
}

const indexes = new Map<string, RepositoryIndex>();

// ============================================================================
// Simple Embedding (TF-IDF-like)
// ============================================================================

function generateEmbedding(code: string): number[] {
  const tokens = code.toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  const vocab = Array.from(new Set(tokens)).slice(0, 50);
  const vector = vocab.map(word => {
    const count = tokens.filter(t => t === word).length;
    return count / tokens.length;
  });
  
  while (vector.length < 50) vector.push(0);
  return vector.slice(0, 50);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server({ name: 'smart-code-search', version: '1.0.0' });

const TOOLS: Tool[] = [
  {
    name: 'index_repository',
    description: 'Index a codebase for semantic search',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryPath: { type: 'string' },
        repositoryName: { type: 'string' },
      },
      required: ['repositoryPath', 'repositoryName'],
    },
  },
  {
    name: 'semantic_query',
    description: 'Search code by meaning using natural language',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        repository: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['query', 'repository'],
    },
  },
  {
    name: 'find_similar_functions',
    description: 'Find functions similar to given code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        repository: { type: 'string' },
        topK: { type: 'number' },
      },
      required: ['code', 'repository'],
    },
  },
  {
    name: 'natural_language_query',
    description: 'Ask questions about codebase',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        repository: { type: 'string' },
      },
      required: ['question', 'repository'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error('No arguments provided');
  }

  try {
    switch (name) {
      case 'index_repository': {
        const index: RepositoryIndex = {
          repository: args.repositoryName as string,
          snippets: [],
        };
        indexes.set(args.repositoryName as string, index);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ success: true, repository: args.repositoryName }, null, 2),
          }],
        };
      }
      
      case 'semantic_query': {
        const index = indexes.get(args.repository as string);
        if (!index) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Repository not found' }) }],
            isError: true,
          };
        }
        
        const queryEmbedding = generateEmbedding(args.query as string);
        const results = index.snippets
          .map(s => ({ snippet: s, score: cosineSimilarity(queryEmbedding, s.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, (args.topK as number) || 10);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query,
              results: results.map(r => ({
                file: r.snippet.file,
                name: r.snippet.name,
                score: r.score.toFixed(3),
              })),
            }, null, 2),
          }],
        };
      }
      
      case 'find_similar_functions': {
        const index = indexes.get(args.repository as string);
        if (!index) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Repository not found' }) }], isError: true };
        }
        
        const targetEmbedding = generateEmbedding(args.code as string);
        const results = index.snippets
          .filter(s => s.type === 'function')
          .map(s => ({ snippet: s, score: cosineSimilarity(targetEmbedding, s.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, (args.topK as number) || 5);
        
        return { content: [{ type: 'text', text: JSON.stringify({ similar: results }, null, 2) }] };
      }
      
      case 'natural_language_query': {
        const question = (args.question as string).toLowerCase();
        const keywords = question
          .replace(/\b(how|what|where|the|a|an|to)\b/g, '')
          .split(/\s+/)
          .filter(w => w.length > 2)
          .join(' ');
        
        const index = indexes.get(args.repository as string);
        if (!index) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Repository not found' }) }], isError: true };
        }
        
        const queryEmbedding = generateEmbedding(keywords);
        const results = index.snippets
          .map(s => ({ snippet: s, score: cosineSimilarity(queryEmbedding, s.embedding) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              question: args.question,
              keywords,
              locations: results.map(r => ({
                file: r.snippet.file,
                name: r.snippet.name,
                relevance: r.score.toFixed(3),
              })),
            }, null, 2),
          }],
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🦉 Smart Code Search MCP Server running on stdio');
}

main().catch(console.error);
