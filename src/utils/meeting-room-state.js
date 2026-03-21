/**
 * In-memory shared history per meeting token (multi-participant Socket.IO rooms).
 */

const MAX_HISTORY = 80;

/** token -> { history: Array, processing: boolean } */
const rooms = new Map();

function getRoom(token) {
  if (!rooms.has(token)) {
    rooms.set(token, { history: [], processing: false });
  }
  return rooms.get(token);
}

function getHistory(token) {
  return getRoom(token).history.slice();
}

function setProcessing(token, v) {
  getRoom(token).processing = !!v;
}

function isProcessing(token) {
  return !!getRoom(token).processing;
}

function appendUserMessage(token, { content, from }) {
  const r = getRoom(token);
  r.history.push({
    role: 'user',
    content: String(content || '').trim(),
    from: (from && String(from).trim()) || 'Guest',
  });
  trim(r);
}

function appendAgentTurns(token, turns) {
  const r = getRoom(token);
  (turns || []).forEach(t => {
    r.history.push({
      role: 'agent',
      agentType: t.agentType,
      label: t.label,
      content: t.content,
    });
  });
  trim(r);
}

function trim(r) {
  if (r.history.length > MAX_HISTORY) {
    r.history = r.history.slice(-MAX_HISTORY);
  }
}

function clearHistory(token) {
  const r = getRoom(token);
  r.history = [];
  r.processing = false;
}

function popLastUserMessage(token) {
  const r = getRoom(token);
  if (r.history.length && r.history[r.history.length - 1].role === 'user') {
    r.history.pop();
  }
}

/** Strip display-only fields for AI roundtable */
function historyForAi(history) {
  return (history || []).map(h => {
    if (h.role === 'user') {
      return { role: 'user', content: h.content, from: h.from };
    }
    return {
      role: 'agent',
      content: h.content,
      agentType: h.agentType,
      label: h.label,
    };
  });
}

module.exports = {
  getHistory,
  appendUserMessage,
  appendAgentTurns,
  setProcessing,
  isProcessing,
  clearHistory,
  historyForAi,
  popLastUserMessage,
};
