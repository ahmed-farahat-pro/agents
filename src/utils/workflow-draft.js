/**
 * Layout + parse helpers for AI-generated workflow drafts from GitLab repo analysis
 */

const AGENT_TYPES = new Set([
  'orchestrator',
  'planner',
  'backend-dev',
  'frontend-dev',
  'qa-tester',
  'code-reviewer',
  'reporter',
]);

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

/**
 * Assign x/y for nodes using BFS levels (left-to-right pipeline).
 */
function layoutWorkflowNodes(nodesIn, edgesIn) {
  const nodes = (nodesIn || []).map((n, i) => {
    const agentType = AGENT_TYPES.has(n.agentType) ? n.agentType : 'backend-dev';
    const label = (n.label || agentType).toString().slice(0, 120);
    const dup = n.duplicateReason ? String(n.duplicateReason).slice(0, 200) : '';
    const note = dup ? `${label} — ${dup}` : label;
    return {
      id: String(n.id || `n_${i}`),
      agentType,
      note,
    };
  });

  const ids = new Set(nodes.map(n => n.id));
  const edges = (edgesIn || []).filter(e => ids.has(e.from) && ids.has(e.to));

  const incoming = new Map(nodes.map(n => [n.id, 0]));
  edges.forEach(e => incoming.set(e.to, (incoming.get(e.to) || 0) + 1));

  let roots = nodes.filter(n => (incoming.get(n.id) || 0) === 0);
  if (roots.length === 0 && nodes.length) roots = [nodes[0]];

  const level = new Map();
  roots.forEach(n => level.set(n.id, 0));
  const q = roots.map(n => n.id);
  let qi = 0;
  while (qi < q.length) {
    const id = q[qi++];
    const L = level.get(id) ?? 0;
    edges
      .filter(e => e.from === id)
      .forEach(e => {
        const nextL = Math.max(level.get(e.to) ?? 0, L + 1);
        level.set(e.to, nextL);
        q.push(e.to);
      });
  }

  nodes.forEach(n => {
    if (!level.has(n.id)) level.set(n.id, 0);
  });

  const rowAt = {};
  nodes.forEach(n => {
    const L = level.get(n.id) ?? 0;
    const row = rowAt[L] ?? 0;
    rowAt[L] = row + 1;
    n.x = 56 + L * 228;
    n.y = 48 + row * 112;
  });

  return { nodes, edges };
}

module.exports = {
  AGENT_TYPES,
  extractJsonFromAi,
  layoutWorkflowNodes,
};
