/**
 * Parse AI responses that contain FILE: path + body.
 * README/markdown often includes nested ``` fences; non-greedy regex truncates at first inner fence.
 * Delimiter format avoids that. Legacy ``` format kept for simple code files.
 */

function isDocPath(p) {
  if (!p || typeof p !== 'string') return false;
  const lower = p.toLowerCase();
  return /\.md$/i.test(p) || /readme/i.test(lower) || /changelog|contributing\.md|license\.md/.test(lower);
}

/**
 * Extract file path + content from one AI response chunk.
 * @param {string} raw
 * @param {string} [defaultPath] from step.files[0]
 * @returns {{ path: string, content: string }[]}
 */
function parseAiFileBlocks(raw, defaultPath) {
  const out = [];
  if (!raw || typeof raw !== 'string') return out;

  // 1) Delimiter format (best for README / long markdown)
  const delimGlobal = /FILE:\s*([^\s\n]+)[\s\r\n]*<<<NIGENTS_FILE_START>>>[\s\r\n]*([\s\S]*?)[\s\r\n]*<<<NIGENTS_FILE_END>>>/gi;
  let m;
  while ((m = delimGlobal.exec(raw)) !== null) {
    out.push({ path: m[1].trim(), content: m[2].trim() });
  }
  if (out.length > 0) return out;

  // 2) Multiple FILE: sections with delimiter (no FILE repeat in regex above if one block)
  const singleDelim = raw.match(/FILE:\s*([^\s\n]+)[\s\r\n]*<<<NIGENTS_FILE_START>>>[\s\r\n]*([\s\S]*?)[\s\r\n]*<<<NIGENTS_FILE_END>>>/i);
  if (singleDelim) {
    out.push({ path: singleDelim[1].trim(), content: singleDelim[2].trim() });
    return out;
  }

  // 3) Legacy: FILE + single fenced block — only safe when content has no inner ``` lines
  const fileMatch = raw.match(/FILE:\s*([^\s\n]+)/);
  const path = fileMatch ? fileMatch[1].trim() : (defaultPath || '');
  if (!path) return out;

  const afterFile = fileMatch ? raw.slice(raw.indexOf(fileMatch[0]) + fileMatch[0].length) : raw;
  const open = afterFile.match(/```[\w]*\r?\n/);
  if (!open) {
    const t = raw.trim();
    if (t && defaultPath) out.push({ path: defaultPath, content: t });
    return out;
  }

  const start = afterFile.indexOf(open[0]) + open[0].length;
  const rest = afterFile.slice(start);
  if (isDocPath(path)) {
    const lines = rest.split(/\r?\n/);
    let depth = 1;
    let endIdx = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```[A-Za-z0-9_+-]+/.test(line)) depth += 1;
      else if (/^```\s*$/.test(line)) {
        depth -= 1;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    out.push({ path, content: lines.slice(0, endIdx).join('\n').trim() });
  } else {
    const blockMatch = raw.match(/```[\w]*\r?\n([\s\S]*?)```/);
    if (blockMatch) out.push({ path, content: blockMatch[1].trim() });
  }
  return out;
}

/**
 * @param {Array<{ code?: string, content?: string, files?: string[] }>} generatedCode
 */
function parseGeneratedCodeToFiles(generatedCode) {
  const files = [];
  for (const item of generatedCode || []) {
    const raw = item.code || item.content || '';
    const defaultPath = item.files && item.files[0];
    const blocks = parseAiFileBlocks(raw, defaultPath);
    for (const b of blocks) {
      if (b.path && b.content) files.push(b);
    }
    if (blocks.length === 0 && defaultPath && raw.trim()) {
      files.push({ path: defaultPath, content: raw.trim() });
    }
  }
  return files;
}

function docGenerationInstructions(fileList) {
  const paths = (fileList || []).join(', ');
  return `
DOCUMENTATION FILE (${paths}) — use this exact wrapper so long READMEs are not truncated:
FILE: <exact path from list>
<<<NIGENTS_FILE_START>>>
# Your full README here (comprehensive: overview, features, install, env vars, scripts, architecture, API, troubleshooting, contributing — write thoroughly, many sections)
<<<NIGENTS_FILE_END>>>

Rules:
- Put the ENTIRE document between <<<NIGENTS_FILE_START>>> and <<<NIGENTS_FILE_END>>> only.
- You may use normal markdown including fenced code blocks (\`\`\`bash etc.) inside; the END marker must appear only once at the very end.
- Aim for a complete, professional README (typically 150+ lines when the app is non-trivial). Do not stop after a short intro.
`;
}

/** Max output tokens (set NIGENTS_MAX_TOKENS_DOC higher if your model supports it, e.g. 16384) */
const MAX_TOKENS_DOC = Math.min(
  parseInt(process.env.NIGENTS_MAX_TOKENS_DOC || '8192', 10) || 8192,
  128000
);
const MAX_TOKENS_CODE = Math.min(
  parseInt(process.env.NIGENTS_MAX_TOKENS_CODE || '8192', 10) || 8192,
  32768
);

function maxTokensForStepFiles(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.some(f => isDocPath(f))) return MAX_TOKENS_DOC;
  return MAX_TOKENS_CODE;
}

module.exports = {
  isDocPath,
  parseAiFileBlocks,
  parseGeneratedCodeToFiles,
  docGenerationInstructions,
  maxTokensForStepFiles,
  MAX_TOKENS_DOC,
  MAX_TOKENS_CODE,
};
