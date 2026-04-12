/**
 * Compile/syntax check layer: run checks so the app compiles or builds correctly.
 * Uses AI to detect project type and choose the right build/run check, then runs it.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('../utils/logger');

/** Max chars of project context sent to AI */
const MAX_CONTEXT_CHARS = 4000;

/**
 * Gather project context (file list, key config snippets) for AI to infer type and check command.
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {string}
 */
function gatherProjectContext(repoRoot) {
  const lines = [];
  if (!fs.existsSync(repoRoot)) return '';

  const top = fs.readdirSync(repoRoot, { withFileTypes: true });
  lines.push('Top-level:', ...top.map(d => (d.isDirectory() ? '  [dir]  ' : '  [file] ') + d.name));

  const srcDir = path.join(repoRoot, 'src');
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    const src = fs.readdirSync(srcDir, { withFileTypes: true });
    lines.push('', 'src/:', ...src.slice(0, 40).map(d => (d.isDirectory() ? '  [dir]  ' : '  [file] ') + d.name));
  }

  const pkgPath = path.join(repoRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const truncated = raw.split('\n').slice(0, 50).join('\n');
      lines.push('', 'package.json (excerpt):', truncated);
    } catch (e) { lines.push('', 'package.json: (read error)'); }
  }
  const pomPath = path.join(repoRoot, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    try {
      const raw = fs.readFileSync(pomPath, 'utf8');
      lines.push('', 'pom.xml (excerpt):', raw.split('\n').slice(0, 30).join('\n'));
    } catch (e) { lines.push('', 'pom.xml: (read error)'); }
  }
  const reqPath = path.join(repoRoot, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      lines.push('', 'requirements.txt:', fs.readFileSync(reqPath, 'utf8').split('\n').slice(0, 30).join('\n'));
    } catch (e) { lines.push('', 'requirements.txt: (read error)'); }
  }
  const pyPath = path.join(repoRoot, 'pyproject.toml');
  if (fs.existsSync(pyPath)) {
    try {
      lines.push('', 'pyproject.toml (excerpt):', fs.readFileSync(pyPath, 'utf8').split('\n').slice(0, 25).join('\n'));
    } catch (e) { lines.push('', 'pyproject.toml: (read error)'); }
  }
  const goPath = path.join(repoRoot, 'go.mod');
  if (fs.existsSync(goPath)) {
    try {
      lines.push('', 'go.mod:', fs.readFileSync(goPath, 'utf8').split('\n').slice(0, 15).join('\n'));
    } catch (e) { lines.push('', 'go.mod: (read error)'); }
  }

  const out = lines.join('\n');
  return out.length > MAX_CONTEXT_CHARS ? out.slice(0, MAX_CONTEXT_CHARS) + '\n... (truncated)' : out;
}

/**
 * Get a shell script that prints the same kind of context when run inside workDir (e.g. OpenHands).
 * @param {string} workDir - Path (e.g. /workspace/group/repo)
 * @returns {string[]} One command that cd's to workDir and prints context to stdout
 */
function getGatherContextCommands(workDir) {
  const dir = workDir.replace(/'/g, "'\\''");
  const script = `cd '${dir}' && ( echo "Top-level:"; ls -1a 2>/dev/null; echo ""; ( test -d src && ( echo "src/:"; ls -1a src 2>/dev/null ) ); ( test -f package.json && echo "" && echo "package.json (excerpt):" && head -50 package.json ); ( test -f pom.xml && echo "" && echo "pom.xml (excerpt):" && head -30 pom.xml ); ( test -f requirements.txt && echo "" && echo "requirements.txt:" && head -30 requirements.txt ); ( test -f pyproject.toml && echo "" && echo "pyproject.toml (excerpt):" && head -25 pyproject.toml ); ( test -f go.mod && echo "" && echo "go.mod:" && head -15 go.mod ) )`;
  return [script];
}

/**
 * Use AI to infer project type and the shell command to run to verify build/syntax.
 * @param {string} contextText - Output from gatherProjectContext or from getGatherContextCommands
 * @returns {Promise<{ type: string, command: string }|null>} null if AI fails or returns invalid
 */
async function getBuildCheckCommandFromAI(contextText) {
  let aiClient;
  try {
    aiClient = require('../utils/ai-client');
  } catch (e) {
    logger.debug('[compile-check] AI client not available, skip AI detection');
    return null;
  }
  const prompt = `You are a build engineer. Given the following project layout and config excerpts, determine the project type and the exact shell command to run to verify the project builds or at least compiles/syntax-checks. Run from the project root. Prefer: npm run build, or npm run lint, or mvn compile, or ./gradlew compileJava, or python -m py_compile, or go build, etc. Reply with a single JSON object and nothing else, no markdown:
{"type":"node|java|python|go|other","command":"single shell command to run from project root"}

Project context:
${contextText}`;

  try {
    const result = await aiClient.call(prompt, { maxTokens: 256, temperature: 0.1 });
    const content = (result.content || '').trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed.command !== 'string' || !parsed.command.trim()) return null;
    const type = (parsed.type || 'other').toLowerCase();
    const command = parsed.command.trim();
    logger.info('[compile-check] AI detected type:', type, 'command:', command);
    return { type, command };
  } catch (e) {
    logger.warn('[compile-check] AI detection failed:', e.message);
    return null;
  }
}

/**
 * Detect project type from repo root (rule-based fallback).
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {'node'|'java'|'python'|'unknown'}
 */
function detectProjectType(repoRoot) {
  if (fs.existsSync(path.join(repoRoot, 'package.json'))) return 'node';
  if (fs.existsSync(path.join(repoRoot, 'pom.xml'))) return 'java';
  if (fs.existsSync(path.join(repoRoot, 'build.gradle'))) return 'java';
  if (fs.existsSync(path.join(repoRoot, 'requirements.txt')) || fs.existsSync(path.join(repoRoot, 'pyproject.toml'))) return 'python';
  return 'unknown';
}

/**
 * Get shell commands to run compile/syntax check inside a directory (e.g. OpenHands working dir).
 * One command that cd's into workDir, detects type, and runs the appropriate check.
 * @param {string} workDir - Path (e.g. /workspace/group/repo)
 * @returns {string[]} Commands to execute (single command that does cd + check)
 */
function getCheckCommands(workDir) {
  const dir = workDir.replace(/'/g, "'\\''");
  // cd to dir and run one check based on project type. Exit code reflects check result.
  const script = `cd '${dir}' && ( test -f package.json && ( npm run build 2>&1 || npm run lint 2>&1 || ( test -f src/bot.js && node --check src/bot.js 2>&1; test -f src/index.js && node --check src/index.js 2>&1 ) ) || test -f pom.xml && mvn compile -q -B 2>&1 || test -f build.gradle && ./gradlew compileJava --no-daemon -q 2>&1 || test -f requirements.txt && python3 -m py_compile $(find . -name "*.py" -not -path "./.git/*" 2>/dev/null | head -5) 2>&1 || echo "No known project type, skip check" )`;
  return [script];
}

/**
 * Rule-based compile/syntax check (no AI). Used when AI is unavailable or fails.
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {{ success: boolean, type: string, stdout?: string, stderr?: string, error?: string }}
 */
function runCheckLocalRuleBased(repoRoot) {
  const type = detectProjectType(repoRoot);
  try {
    if (type === 'node') {
      const pkgPath = path.join(repoRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts || {};
      let cmd = null;
      if (scripts.build) cmd = 'npm run build';
      else if (scripts.lint) cmd = 'npm run lint';
      else {
        const entries = ['src/bot.js', 'src/index.js', 'index.js', 'src/main.js', 'app.js'];
        for (const e of entries) {
          if (fs.existsSync(path.join(repoRoot, e))) {
            cmd = `node --check ${e}`;
            break;
          }
        }
      }
      if (!cmd) return { success: true, type: 'node', stdout: 'No build/lint or entrypoint found, skip check' };
      const result = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
      return { success: true, type: 'node', stdout: result || '' };
    }
    if (type === 'java') {
      const hasMaven = fs.existsSync(path.join(repoRoot, 'pom.xml'));
      const cmd = hasMaven ? 'mvn compile -q -B' : './gradlew compileJava --no-daemon -q';
      execSync(cmd, { cwd: repoRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
      return { success: true, type: 'java' };
    }
    if (type === 'python') {
      const pyFiles = findPyFiles(repoRoot, [], repoRoot).slice(0, 20);
      if (pyFiles.length === 0) return { success: true, type: 'python' };
      execSync(`python3 -m py_compile ${pyFiles.join(' ')}`, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
      return { success: true, type: 'python' };
    }
    return { success: true, type: 'unknown', stdout: 'Unknown project type, skip check' };
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || err.message || '';
    logger.warn('[compile-check] Check failed:', stderr.slice(0, 300));
    return { success: false, type, stdout, stderr: stderr.slice(0, 1000), error: err.message };
  }
}

/**
 * Run compile/syntax check locally: use AI to detect type and command, then run it; fallback to rule-based.
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {Promise<{ success: boolean, type: string, stdout?: string, stderr?: string, error?: string, usedAI?: boolean }>}
 */
async function runCheckLocal(repoRoot) {
  const context = gatherProjectContext(repoRoot);
  if (context) {
    const aiResult = await getBuildCheckCommandFromAI(context);
    if (aiResult && aiResult.command) {
      try {
        const result = execSync(aiResult.command, { cwd: repoRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
        return { success: true, type: aiResult.type, stdout: result || '', usedAI: true };
      } catch (err) {
        logger.warn('[compile-check] AI-suggested check failed:', err.message);
        return {
          success: false,
          type: aiResult.type,
          stdout: err.stdout || '',
          stderr: (err.stderr || err.message || '').slice(0, 1000),
          error: err.message,
          usedAI: true,
        };
      }
    }
  }
  return runCheckLocalRuleBased(repoRoot);
}

function findPyFiles(dir, list = [], rootDir = null) {
  if (!fs.existsSync(dir)) return list;
  const root = rootDir || dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '__pycache__') continue;
    if (e.isDirectory()) findPyFiles(full, list, root);
    else if (e.name.endsWith('.py')) list.push(path.relative(root, full));
  }
  return list;
}

module.exports = {
  detectProjectType,
  gatherProjectContext,
  getGatherContextCommands,
  getBuildCheckCommandFromAI,
  getCheckCommands,
  runCheckLocal,
  runCheckLocalRuleBased,
};
