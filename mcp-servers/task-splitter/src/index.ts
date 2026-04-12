#!/usr/bin/env node

/**
 * 🦉 NightOwl - Task Splitter MCP Server
 * 
 * Intelligently splits development tasks across the 7-agent NightOwl team.
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
// Types & Interfaces
// ============================================================================

interface SubTask {
  id: string;
  title: string;
  description: string;
  agent: string;
  dependencies: string[];
  estimatedHours: number;
  complexity: 'S' | 'M' | 'L';
  skills: string[];
  deliverables: string[];
}

interface TaskSplit {
  originalTask: string;
  strategy: string;
  subtasks: SubTask[];
  parallelGroups: string[][];
  totalEstimatedHours: number;
  criticalPath: string[];
}

interface TaskAnalysis {
  type: 'feature' | 'bugfix' | 'refactor' | 'infrastructure' | 'testing';
  domains: string[];
  complexity: 'S' | 'M' | 'L';
  requiresFrontend: boolean;
  requiresBackend: boolean;
  requiresDatabase: boolean;
  requiresTesting: boolean;
  parallelizable: boolean;
}

// ============================================================================
// Task Analysis Engine
// ============================================================================

function analyzeTask(task: string): TaskAnalysis {
  const taskLower = task.toLowerCase();
  
  let type: TaskAnalysis['type'] = 'feature';
  if (/bug|fix|error|issue|crash/i.test(taskLower)) type = 'bugfix';
  else if (/refactor|cleanup|restructure/i.test(taskLower)) type = 'refactor';
  else if (/deploy|infrastructure|terraform|docker/i.test(taskLower)) type = 'infrastructure';
  else if (/test|spec|coverage/i.test(taskLower)) type = 'testing';
  
  const domains: string[] = [];
  if (/api|endpoint|controller|service/i.test(taskLower)) domains.push('backend');
  if (/component|page|screen|ui/i.test(taskLower)) domains.push('frontend');
  if (/database|migration|schema/i.test(taskLower)) domains.push('database');
  if (/auth|login|security/i.test(taskLower)) domains.push('security');
  if (/payment|stripe|hyperpay/i.test(taskLower)) domains.push('payment');
  
  let complexity: TaskAnalysis['complexity'] = 'S';
  if (/microservice|architecture|migration|redesign/i.test(taskLower)) complexity = 'L';
  else if (/feature|integration|workflow/i.test(taskLower)) complexity = 'M';
  
  return {
    type,
    domains,
    complexity,
    requiresFrontend: /ui|component|page|screen|frontend|react/i.test(taskLower),
    requiresBackend: /api|backend|server|endpoint/i.test(taskLower),
    requiresDatabase: /database|db|migration|entity/i.test(taskLower),
    requiresTesting: /test|spec/i.test(taskLower),
    parallelizable: type !== 'refactor' && type !== 'infrastructure',
  };
}

// ============================================================================
// Task Splitting
// ============================================================================

function splitTask(task: string, analysis: TaskAnalysis): TaskSplit {
  const subtasks: SubTask[] = [];
  let id = 1;
  
  // Planning task
  if (analysis.complexity !== 'S') {
    subtasks.push({
      id: `task-${id++}`,
      title: 'Create implementation plan',
      description: `Analyze and plan: ${task}`,
      agent: 'planner',
      dependencies: [],
      estimatedHours: analysis.complexity === 'L' ? 2 : 1,
      complexity: analysis.complexity === 'L' ? 'M' : 'S',
      skills: ['architecture', 'planning'],
      deliverables: ['Implementation plan', 'File change list'],
    });
  }
  
  const planningDep = analysis.complexity !== 'S' ? [`task-${id - 1}`] : [];
  
  // Backend
  if (analysis.requiresBackend) {
    subtasks.push({
      id: `task-${id++}`,
      title: 'Implement backend',
      description: 'Create backend API and business logic',
      agent: 'backend-dev',
      dependencies: planningDep,
      estimatedHours: analysis.complexity === 'L' ? 6 : analysis.complexity === 'M' ? 4 : 2,
      complexity: analysis.complexity === 'L' ? 'L' : 'M',
      skills: ['nodejs', 'api-design'],
      deliverables: ['API endpoints', 'Services'],
    });
  }
  
  // Frontend
  if (analysis.requiresFrontend) {
    const deps = [...planningDep];
    if (analysis.requiresBackend) deps.push(`task-${id - 1}`);
    
    subtasks.push({
      id: `task-${id++}`,
      title: 'Implement frontend',
      description: 'Create React components and UI',
      agent: 'frontend-dev',
      dependencies: deps,
      estimatedHours: analysis.complexity === 'L' ? 5 : analysis.complexity === 'M' ? 3 : 1.5,
      complexity: analysis.complexity === 'L' ? 'M' : 'S',
      skills: ['react', 'typescript', 'rtl'],
      deliverables: ['Components', 'Styles'],
    });
  }
  
  // Testing
  subtasks.push({
    id: `task-${id++}`,
    title: 'Write and run tests',
    description: 'Create test suite',
    agent: 'qa-tester',
    dependencies: subtasks.filter(st => st.agent === 'backend-dev' || st.agent === 'frontend-dev').map(st => st.id),
    estimatedHours: analysis.complexity === 'L' ? 4 : 2,
    complexity: 'M',
    skills: ['testing', 'jest'],
    deliverables: ['Tests', 'Report'],
  });
  
  // Review
  subtasks.push({
    id: `task-${id++}`,
    title: 'Code review',
    description: 'Review all changes',
    agent: 'code-reviewer',
    dependencies: subtasks.filter(st => st.agent !== 'code-reviewer' && st.agent !== 'reporter').map(st => st.id),
    estimatedHours: 1,
    complexity: 'M',
    skills: ['security', 'quality'],
    deliverables: ['Review report'],
  });
  
  // Calculate parallel groups
  const groups: string[][] = [];
  const completed = new Set<string>();
  
  while (completed.size < subtasks.length) {
    const group = subtasks
      .filter(t => !completed.has(t.id) && t.dependencies.every(d => completed.has(d)))
      .map(t => t.id);
    
    if (group.length === 0) break;
    groups.push(group);
    group.forEach(id => completed.add(id));
  }
  
  return {
    originalTask: task,
    strategy: `${analysis.type} task: ${analysis.domains.join(', ')}`,
    subtasks,
    parallelGroups: groups,
    totalEstimatedHours: subtasks.reduce((sum, t) => sum + t.estimatedHours, 0),
    criticalPath: subtasks.slice(0, 3).map(t => t.id),
  };
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server({ name: 'task-splitter', version: '1.0.0' });

const TOOLS: Tool[] = [
  {
    name: 'analyze_complexity',
    description: 'Analyze task type, domains, and complexity',
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string' } },
      required: ['task'],
    },
  },
  {
    name: 'split_task',
    description: 'Split task into subtasks for NightOwl agents',
    inputSchema: {
      type: 'object',
      properties: { task: { type: 'string' } },
      required: ['task'],
    },
  },
  {
    name: 'detect_conflicts',
    description: 'Detect conflicts between parallel subtasks',
    inputSchema: {
      type: 'object',
      properties: {
        subtasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              agent: { type: 'string' },
              dependencies: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      required: ['subtasks'],
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
      case 'analyze_complexity': {
        const analysis = analyzeTask(args.task as string);
        return { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] };
      }
      case 'split_task': {
        const analysis = analyzeTask(args.task as string);
        const split = splitTask(args.task as string, analysis);
        return { content: [{ type: 'text', text: JSON.stringify(split, null, 2) }] };
      }
      case 'detect_conflicts': {
        const subtasks = args.subtasks as SubTask[];
        const agentTasks = new Map<string, number>();
        subtasks.forEach(t => {
          agentTasks.set(t.agent, (agentTasks.get(t.agent) || 0) + 1);
        });
        
        const conflicts = Array.from(agentTasks.entries())
          .filter(([_, count]) => count > 2)
          .map(([agent, count]) => ({
            type: 'agent_overload',
            agent,
            tasks: count,
            resolution: `Consider splitting ${agent} tasks`,
          }));
        
        return { content: [{ type: 'text', text: JSON.stringify({ hasConflicts: conflicts.length > 0, conflicts }, null, 2) }] };
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
  console.error('🦉 Task Splitter MCP Server running on stdio');
}

main().catch(console.error);
