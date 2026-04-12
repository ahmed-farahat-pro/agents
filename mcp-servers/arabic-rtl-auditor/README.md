# 🦉 Arabic/RTL Auditor MCP Server

MCP server for auditing and fixing Arabic RTL (Right-to-Left) compliance in code.
Perfect for Saudi/GCC localization projects.

## Features

- **RTL Compliance Checking** - Detects physical directions, hardcoded LTR, and non-logical CSS
- **Automatic Fixes** - Suggests and applies RTL-friendly code transformations
- **Arabic Text Validation** - Validates Arabic text rendering and mixed content
- **Test Generation** - Generates RTL compliance tests for React components

## Installation

```bash
cd mcp-servers/arabic-rtl-auditor
npm install
npm run build
```

## Tools

### `check_rtl_compliance`
Analyzes code for RTL compliance issues.

**Input:**
- `code` - Source code to analyze
- `language` - Programming language (css, scss, jsx, tsx, etc.)
- `filename` - Optional filename for context

**Output:** RTL report with score and issues list.

### `suggest_arabic_fixes`
Automatically fixes RTL compliance issues.

### `validate_arabic_text`
Validates Arabic text for rendering issues.

### `generate_arabic_tests`
Generates RTL compliance test cases.

## Usage Example

```javascript
// Check a React component
const result = await client.callTool('check_rtl_compliance', {
  code: `
    .button {
      margin-left: 10px;
      text-align: left;
    }
  `,
  language: 'css',
});

// Returns:
// {
//   score: 60,
//   issues: [
//     { rule: 'NO_PHYSICAL_DIRECTIONS', message: '...', suggestion: '...' }
//   ]
// }
```

## Rules Checked

| Rule | Description | Severity |
|------|-------------|----------|
| NO_PHYSICAL_DIRECTIONS | Use logical properties | Error |
| NO_TEXT_ALIGN_LEFT | Use `start` instead of `left` | Error |
| NO_HARDCODED_LTR | Don't hardcode LTR direction | Error |
| MISSING_ARABIC_FONT | Add Arabic-friendly fonts | Warning |

## Integration with NightOwl

Add to your `config/mcp-servers.json`:

```json
{
  "arabic-rtl-auditor": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/mcp-servers/arabic-rtl-auditor/dist/index.js"],
    "enabled": true
  }
}
```
