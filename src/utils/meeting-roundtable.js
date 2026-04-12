/**
 * Multi-agent roundtable: one facilitator prompt, strict JSON turns (no cross-talk).
 */

const MEETING_ORDER = [
  'orchestrator',
  'architect',
  'planner',
  'backend-dev',
  'frontend-dev',
  'devops',
  'security',
  'qa-tester',
  'code-reviewer',
  'reporter',
];

const LABELS = {
  orchestrator: 'Orchestrator',
  architect: 'Architect',
  planner: 'Planner',
  'backend-dev': 'Backend Dev',
  'frontend-dev': 'Frontend Dev',
  devops: 'DevOps',
  security: 'Security',
  'qa-tester': 'QA Tester',
  'code-reviewer': 'Code Reviewer',
  reporter: 'Reporter',
};

function extractJsonFromAi(content) {
  if (!content || typeof content !== 'string') throw new Error('Empty AI response');
  let t = content.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const o = t.indexOf('{');
  const c = t.lastIndexOf('}');
  if (o >= 0 && c > o) t = t.slice(o, c + 1);
  return JSON.parse(t);
}

function orderAgents(selected) {
  const set = new Set((selected || []).map(String));
  return MEETING_ORDER.filter(a => set.has(a));
}

function normalizeAgentType(s) {
  let a = String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-');
  const aliases = {
    backenddev: 'backend-dev',
    backend_dev: 'backend-dev',
    frontenddev: 'frontend-dev',
    frontend_dev: 'frontend-dev',
    qatester: 'qa-tester',
    qa_tester: 'qa-tester',
    codereviewer: 'code-reviewer',
    code_reviewer: 'code-reviewer',
    securityanalyst: 'security',
    security_analyst: 'security',
    solutionsarchitect: 'architect',
    solutions_architect: 'architect',
  };
  if (aliases[a]) a = aliases[a];
  return a;
}

/**
 * Map AI response to facilitator order (one slot per selected agent).
 */
function normalizeTurns(raw, allowedAgents) {
  const allowed = new Set(allowedAgents);
  const list = Array.isArray(raw.turns) ? raw.turns : Array.isArray(raw) ? raw : [];
  const byType = new Map();
  list.forEach(t => {
    const agentType = normalizeAgentType(t.agentType || t.role);
    if (!allowed.has(agentType)) return;
    const label = (t.label && String(t.label).trim()) || LABELS[agentType] || agentType;
    const content = (t.content || t.message || t.text || '').toString().trim();
    if (!content) return;
    if (!byType.has(agentType)) {
      byType.set(agentType, { agentType, label, content });
    }
  });
  const out = [];
  allowedAgents.forEach(a => {
    if (byType.has(a)) {
      const o = byType.get(a);
      out.push({
        agentType: o.agentType,
        label: o.label,
        content: o.content,
        turn: out.length + 1,
      });
    }
  });
  return out;
}

function buildHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '(none — this is the first message.)';
  return history
    .slice(-20)
    .map(h => {
      if (h.role === 'user') {
        const who = h.from ? ` (${h.from})` : '';
        return `User${who}: ${h.content || ''}`;
      }
      if (h.role === 'agent') return `${LABELS[h.agentType] || h.agentType}: ${h.content || ''}`;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildSystemMessage(agentsOrdered) {
  const names = agentsOrdered.map(a => `${a} (${LABELS[a]})`).join(', ');
  return `You are the invisible facilitator of a software development team meeting (Nigents platform).

STRICT RULES — agents must respect each other:
1. ONLY these agents speak, in EXACTLY this order for this round: ${names}
2. Each agent speaks ONCE per round, after the previous agent has finished. No interruptions, no talking over each other.
3. Each reply is 2–5 sentences unless the user asked for a detailed technical answer.
4. Later agents may agree, add detail, or raise concerns — but must NOT repeat earlier points verbatim.
5. The Orchestrator (first) frames goals and constraints; others follow that thread.
6. If an agent has nothing substantive to add, they should say one short sentence acknowledging alignment.

Output ONLY valid JSON (no markdown outside JSON) with this exact shape:
{"turns":[{"agentType":"orchestrator","label":"Orchestrator","content":"..."}, ...]}
The "agentType" values must be exactly one of: ${agentsOrdered.join(', ')}.
Include exactly one object per selected agent, in the same order as listed above.`;
}

function buildUserPrompt(message, context, agentsOrdered, history) {
  return `Project / context: ${context || '(none)'}

Prior conversation in this meeting:
${buildHistoryBlock(history)}

---

User message (addressed to the team):
${message}`;
}

/**
 * Run multi-agent roundtable via configured AI (used by dashboard + public meeting room).
 */
async function runRoundtable({ message, context, agents, history }) {
  const aiClient = require('./ai-client');
  const msg = (message || '').trim();
  if (!msg) {
    const err = new Error('message required');
    err.code = 'VALIDATION';
    throw err;
  }
  let agentList = agents;
  if (!Array.isArray(agentList) || agentList.length === 0) {
    agentList = ['orchestrator', 'planner', 'backend-dev'];
  }
  const agentsOrdered = orderAgents(agentList);
  if (agentsOrdered.length === 0) {
    const err = new Error('Select at least one valid agent role');
    err.code = 'VALIDATION';
    throw err;
  }
  const systemMessage = buildSystemMessage(agentsOrdered);
  const userPrompt = buildUserPrompt(msg, (context || '').trim(), agentsOrdered, history || []);
  const result = await aiClient.call(userPrompt, {
    maxTokens: 4096,
    temperature: 0.32,
    systemMessage,
  });
  const raw = result.content || '';
  let parsed;
  try {
    parsed = extractJsonFromAi(raw);
  } catch (pe) {
    const err = new Error('AI_JSON_PARSE');
    err.code = 'PARSE';
    err.raw = raw;
    err.cause = pe;
    throw err;
  }
  const turns = normalizeTurns(parsed, agentsOrdered);
  if (!turns.length) {
    const err = new Error('NO_TURNS');
    err.code = 'PARSE';
    err.raw = raw;
    throw err;
  }
  return {
    turns,
    agentsOrder: agentsOrdered,
    provider: result.provider,
    model: result.model,
    raw,
  };
}

module.exports = {
  MEETING_ORDER,
  LABELS,
  orderAgents,
  extractJsonFromAi,
  normalizeTurns,
  buildSystemMessage,
  buildUserPrompt,
  runRoundtable,
};
