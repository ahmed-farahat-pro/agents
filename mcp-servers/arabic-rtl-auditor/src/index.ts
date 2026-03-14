#!/usr/bin/env node

/**
 * 🦉 NightOwl - Arabic/RTL Auditor MCP Server
 * 
 * Provides tools for auditing and fixing Arabic RTL compliance in code.
 * Perfect for Saudi/GCC localization projects.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// RTL Audit Engine
// ============================================================================

interface RTLLIssue {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  code: string;
  suggestion?: string;
}

interface RTLReport {
  file: string;
  score: number;
  issues: RTLLIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

// RTL Audit Rules
const RTL_RULES: Record<string, { pattern: RegExp; message: string; suggestion: string }> = {
  NO_PHYSICAL_DIRECTIONS: {
    pattern: /(margin-left|margin-right|padding-left|padding-right|border-left|border-right|left:|right:)/g,
    message: 'Use logical properties (margin-inline-start/end) instead of physical directions',
    suggestion: 'Replace with margin-inline-start/end for RTL support',
  },
  NO_TEXT_ALIGN_LEFT: {
    pattern: /text-align:\s*left/g,
    message: 'Use text-align: start instead of left for RTL',
    suggestion: 'Change to text-align: start',
  },
  NO_TEXT_ALIGN_RIGHT: {
    pattern: /text-align:\s*right/g,
    message: 'Use text-align: end instead of right for RTL',
    suggestion: 'Change to text-align: end',
  },
  NO_FLOAT_LEFT_RIGHT: {
    pattern: /float:\s*(left|right)/g,
    message: 'Avoid float; use flexbox with logical properties',
    suggestion: 'Use display: flex with justify-content instead',
  },
  NO_HARDCODED_LTR: {
    pattern: /dir="ltr"|direction:\s*ltr/g,
    message: 'Hardcoded LTR direction breaks RTL layouts',
    suggestion: 'Remove or make conditional based on locale',
  },
  NO_LEFT_RIGHT_PROPS: {
    pattern: /(left|right)(?:=|:)\s*["']\d+/g,
    message: 'Avoid absolute positioning with left/right',
    suggestion: 'Use inset-inline-start/end or flexbox',
  },
  NO_ALIGN_LEFT_RIGHT: {
    pattern: /align="(left|right)"/g,
    message: 'Deprecated align attribute; use CSS with logical properties',
    suggestion: 'Use CSS text-align: start/end',
  },
  MISSING_ARABIC_FONT: {
    pattern: /font-family:[^;]*(?:sans-serif|Arial)[^;]*;/gi,
    message: 'Consider adding Arabic-friendly fonts for better rendering',
    suggestion: 'Add fonts like "Noto Sans Arabic", "Dubai", "Cairo"',
  },
};

const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

// ============================================================================
// Audit Functions
// ============================================================================

function auditCode(code: string, language: string, filename?: string): RTLReport {
  const issues: RTLLIssue[] = [];
  const lines = code.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    Object.entries(RTL_RULES).forEach(([ruleName, rule]) => {
      let match: RegExpExecArray | null;
      const regex = new RegExp(rule.pattern);
      while ((match = regex.exec(line)) !== null) {
        issues.push({
          line: lineNum,
          column: match.index + 1,
          severity: ruleName.includes('MISSING') ? 'warning' : 'error',
          rule: ruleName,
          message: rule.message,
          code: line.trim(),
          suggestion: rule.suggestion,
        });
      }
    });
  });
  
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, 100 - (errors * 10) - (warnings * 5));
  
  return {
    file: filename || 'unknown',
    score,
    issues,
    summary: { errors, warnings, infos: 0 },
  };
}

function suggestFixes(code: string, language: string): string {
  let fixed = code;
  
  if (['css', 'scss', 'less'].includes(language)) {
    fixed = fixed.replace(/margin-left/g, 'margin-inline-start');
    fixed = fixed.replace(/margin-right/g, 'margin-inline-end');
    fixed = fixed.replace(/padding-left/g, 'padding-inline-start');
    fixed = fixed.replace(/padding-right/g, 'padding-inline-end');
    fixed = fixed.replace(/border-left/g, 'border-inline-start');
    fixed = fixed.replace(/border-right/g, 'border-inline-end');
    fixed = fixed.replace(/text-align:\s*left/g, 'text-align: start');
    fixed = fixed.replace(/text-align:\s*right/g, 'text-align: end');
  }
  
  return fixed;
}

function validateArabicText(text: string, context: string) {
  const issues: string[] = [];
  const suggestions: string[] = [];
  
  if (!ARABIC_PATTERN.test(text)) {
    return { isValid: true, issues: [], suggestions: ['No Arabic text detected'] };
  }
  
  if (/[a-zA-Z]/.test(text) && ARABIC_PATTERN.test(text)) {
    issues.push('Mixed Arabic and Latin text detected');
    suggestions.push('Consider using <bdi> tags or dir="auto"');
  }
  
  if (context === 'ui' && text.length > 50) {
    issues.push('UI text may be too long for Arabic (expands ~30%)');
    suggestions.push('Test with longest Arabic translations');
  }
  
  return { isValid: issues.length === 0, issues, suggestions };
}

function generateTests(componentCode: string, componentName: string): string {
  return `
import { render, screen } from '@testing-library/react';
import ${componentName} from './${componentName}';

describe('${componentName} RTL Compliance', () => {
  it('renders correctly in RTL mode', () => {
    document.dir = 'rtl';
    render(<${componentName} />);
    document.dir = 'ltr';
  });

  it('handles Arabic text correctly', () => {
    render(<${componentName} text="مرحبا بالعالم" />);
    expect(screen.getByText('مرحبا بالعالم')).toBeInTheDocument();
  });
});
`;
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server({ name: 'arabic-rtl-auditor', version: '1.0.0' });

const TOOLS: Tool[] = [
  {
    name: 'check_rtl_compliance',
    description: 'Analyze code for Arabic RTL compliance issues',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code to analyze' },
        language: { type: 'string', enum: ['css', 'scss', 'less', 'javascript', 'typescript', 'jsx', 'tsx', 'html', 'vue'] },
        filename: { type: 'string', description: 'Optional filename' },
      },
      required: ['code', 'language'],
    },
  },
  {
    name: 'suggest_arabic_fixes',
    description: 'Automatically fix RTL compliance issues in code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        language: { type: 'string', enum: ['css', 'scss', 'less', 'javascript', 'typescript', 'jsx', 'tsx', 'html', 'vue'] },
      },
      required: ['code', 'language'],
    },
  },
  {
    name: 'validate_arabic_text',
    description: 'Validate Arabic text for rendering issues',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        context: { type: 'string', enum: ['ui', 'notification', 'error', 'label', 'placeholder'] },
      },
      required: ['text', 'context'],
    },
  },
  {
    name: 'generate_arabic_tests',
    description: 'Generate RTL compliance test cases',
    inputSchema: {
      type: 'object',
      properties: {
        componentCode: { type: 'string' },
        componentName: { type: 'string' },
      },
      required: ['componentCode', 'componentName'],
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
      case 'check_rtl_compliance': {
        const code = args.code as string;
        const language = args.language as string;
        const filename = args.filename as string | undefined;
        const report = auditCode(code, language, filename);
        return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
      }
      case 'suggest_arabic_fixes': {
        const code = args.code as string;
        const language = args.language as string;
        const fixed = suggestFixes(code, language);
        return { content: [{ type: 'text', text: JSON.stringify({ fixed }, null, 2) }] };
      }
      case 'validate_arabic_text': {
        const text = args.text as string;
        const context = args.context as string;
        const result = validateArabicText(text, context);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      case 'generate_arabic_tests': {
        const componentCode = args.componentCode as string;
        const componentName = args.componentName as string;
        const tests = generateTests(componentCode, componentName);
        return { content: [{ type: 'text', text: tests }] };
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
  console.error('🦉 Arabic/RTL Auditor MCP Server running on stdio');
}

main().catch(console.error);
