/**
 * Nigents - Skills Registry
 * Loads, indexes, and serves skills from the claude-skills directory.
 * Skills can be activated per-agent from the dashboard or Telegram.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Default skills directory — override via SKILLS_DIR env
const SKILLS_DIR = process.env.SKILLS_DIR || path.resolve(require('os').homedir(), 'Desktop/claude-skills');

/** In-memory cache: slug -> skill metadata */
let skillsCache = null;
let lastScanTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

/** Per-agent active skill sets: agentName -> Set<skillSlug> */
const agentSkills = new Map();

// Persist agent-skill assignments
const DATA_DIR = path.join(__dirname, '../../data');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'skill-assignments.json');

function ensureDataDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}

function loadAssignments() {
  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf8'));
      for (const [agent, slugs] of Object.entries(raw)) {
        agentSkills.set(agent, new Set(slugs));
      }
    }
  } catch (e) {
    logger.warn('[Skills] Could not load assignments:', e.message);
  }
}

function saveAssignments() {
  ensureDataDir();
  const obj = {};
  for (const [agent, set] of agentSkills) {
    obj[agent] = [...set];
  }
  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// Load on startup
loadAssignments();

/**
 * Parse YAML frontmatter from a SKILL.md file (lightweight — no yaml dep).
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  // Nested metadata
  if (block.includes('metadata:')) {
    const metaBlock = block.split('metadata:')[1];
    for (const line of metaBlock.split('\n')) {
      const m = line.match(/^\s+(\w[\w-]*):\s*"?(.+?)"?\s*$/);
      if (m) {
        if (!meta.metadata) meta.metadata = {};
        meta.metadata[m[1]] = m[2];
      }
    }
  }
  return meta;
}

/**
 * Scan the skills directory and build the index.
 */
function scanSkills(force = false) {
  const now = Date.now();
  if (!force && skillsCache && (now - lastScanTime) < CACHE_TTL) return skillsCache;

  const skills = new Map();

  if (!fs.existsSync(SKILLS_DIR)) {
    logger.warn(`[Skills] Skills directory not found: ${SKILLS_DIR}`);
    skillsCache = skills;
    lastScanTime = now;
    return skills;
  }

  const categories = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));

  for (const catDir of categories) {
    const catPath = path.join(SKILLS_DIR, catDir.name);
    const subDirs = fs.readdirSync(catPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));

    for (const skillDir of subDirs) {
      const skillPath = path.join(catPath, skillDir.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        const meta = parseFrontmatter(content);
        const slug = meta.name || skillDir.name;
        // Extract first paragraph after frontmatter as summary
        const body = content.replace(/^---[\s\S]*?---\n*/, '');
        const firstPara = body.split('\n\n').find(p => p.trim() && !p.startsWith('#')) || '';

        skills.set(slug, {
          slug,
          name: meta.name || skillDir.name,
          description: meta.description || '',
          category: catDir.name,
          version: meta.metadata?.version || '1.0.0',
          author: meta.metadata?.author || '',
          domain: meta.metadata?.domain || '',
          summary: firstPara.trim().slice(0, 300),
          skillPath: path.join(catPath, skillDir.name),
          hasScripts: fs.existsSync(path.join(catPath, skillDir.name, 'scripts')),
          hasTemplates: fs.existsSync(path.join(catPath, skillDir.name, 'templates')),
          hasReferences: fs.existsSync(path.join(catPath, skillDir.name, 'references')),
        });
      } catch (e) {
        // Skip broken skill files
      }
    }
  }

  logger.info(`[Skills] Scanned ${skills.size} skills from ${SKILLS_DIR}`);
  skillsCache = skills;
  lastScanTime = now;
  return skills;
}

/**
 * Get all skills (cached).
 */
function getAllSkills() {
  return scanSkills();
}

/**
 * Get skills grouped by category.
 */
function getSkillsByCategory() {
  const skills = scanSkills();
  const grouped = {};
  for (const s of skills.values()) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }
  return grouped;
}

/**
 * Search skills by query string (matches name, description, category).
 */
function searchSkills(query) {
  const q = (query || '').toLowerCase();
  if (!q) return [...scanSkills().values()];
  return [...scanSkills().values()].filter(s =>
    s.slug.includes(q) ||
    s.name.includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.category.includes(q) ||
    (s.domain && s.domain.toLowerCase().includes(q))
  );
}

/**
 * Get full skill content (the SKILL.md body) for injection into agent prompts.
 */
function getSkillContent(slug) {
  const skills = scanSkills();
  const skill = skills.get(slug);
  if (!skill) return null;
  const skillPath = path.join(skill.skillPath, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf8');
}

/**
 * Activate a skill for an agent.
 */
function activateSkill(agentName, skillSlug) {
  if (!agentSkills.has(agentName)) agentSkills.set(agentName, new Set());
  agentSkills.get(agentName).add(skillSlug);
  saveAssignments();
  logger.info(`[Skills] Activated "${skillSlug}" for agent "${agentName}"`);
}

/**
 * Deactivate a skill for an agent.
 */
function deactivateSkill(agentName, skillSlug) {
  if (!agentSkills.has(agentName)) return;
  agentSkills.get(agentName).delete(skillSlug);
  saveAssignments();
  logger.info(`[Skills] Deactivated "${skillSlug}" for agent "${agentName}"`);
}

/**
 * Get active skills for an agent.
 */
function getAgentSkills(agentName) {
  const slugs = agentSkills.get(agentName);
  if (!slugs || slugs.size === 0) return [];
  const allSkills = scanSkills();
  return [...slugs].map(s => allSkills.get(s)).filter(Boolean);
}

/**
 * Build a skill-augmented system prompt for an agent.
 * Appends active skill knowledge to the agent's base system message.
 */
function buildSkillAugmentedPrompt(agentName, baseSystemMessage) {
  const active = getAgentSkills(agentName);
  if (active.length === 0) return baseSystemMessage;

  const skillBlocks = active.map(s => {
    const content = getSkillContent(s.slug);
    if (!content) return '';
    // Strip frontmatter, keep the body
    const body = content.replace(/^---[\s\S]*?---\n*/, '');
    return `\n--- SKILL: ${s.name} (${s.category}) ---\n${body.slice(0, 4000)}\n--- END SKILL ---`;
  }).filter(Boolean);

  if (skillBlocks.length === 0) return baseSystemMessage;

  return `${baseSystemMessage}

=== ACTIVATED SKILLS (${active.length}) ===
Use the following skill knowledge to enhance your responses when relevant:
${skillBlocks.join('\n')}
=== END SKILLS ===`;
}

/**
 * Bulk activate skills for an agent by category.
 */
function activateCategory(agentName, category) {
  const skills = scanSkills();
  let count = 0;
  for (const s of skills.values()) {
    if (s.category === category) {
      activateSkill(agentName, s.slug);
      count++;
    }
  }
  return count;
}

/**
 * Get a summary of all skill assignments for the dashboard.
 */
function getAssignmentsSummary() {
  const result = {};
  for (const [agent, slugs] of agentSkills) {
    result[agent] = [...slugs];
  }
  return result;
}

module.exports = {
  scanSkills,
  getAllSkills,
  getSkillsByCategory,
  searchSkills,
  getSkillContent,
  activateSkill,
  deactivateSkill,
  getAgentSkills,
  buildSkillAugmentedPrompt,
  activateCategory,
  getAssignmentsSummary,
  SKILLS_DIR,
};
