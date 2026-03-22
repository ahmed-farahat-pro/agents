/**
 * Workflow Studio — drag agents onto canvas, save flow, meeting transcript → AI
 */
(function () {
  const AGENTS = [
    { type: 'orchestrator', label: 'Orchestrator' },
    { type: 'planner', label: 'Planner' },
    { type: 'backend-dev', label: 'Backend Dev' },
    { type: 'frontend-dev', label: 'Frontend Dev' },
    { type: 'qa-tester', label: 'QA Tester' },
    { type: 'code-reviewer', label: 'Code Reviewer' },
    { type: 'reporter', label: 'Reporter' },
  ];

  let projects = [];
  let currentId = null;
  let nodes = [];
  let edges = [];
  let wireDrag = null; /* { fromId, x0, y0, curX, curY } while dragging a connection */
  let dragState = null;
  let wfBound = false;
  const NODE_W = 168;
  const CANVAS_PAD = 48;
  let gitlabRepos = [];
  let wfCanvasResizeObserver = null;
  /** { role:'user'|'agent', content, agentType?, label? } — multi-agent meeting thread */
  let roundtableHistory = [];

  /** Real-time link: tasks + agent highlight + stream panel */
  let wfTasks = [];
  let wfSocketAttached = false;
  /** @type {string|null} */
  let liveAgentFromSocket = null;
  const WF_STREAM_MAX = 120;
  /** Per-agent entries for the click popover (full streamed payloads, not the truncated global line). */
  const wfStreamsByAgent = {};
  const WF_AGENT_STREAM_MAX = 100;
  let livePopoverOpen = false;
  /** @type {string|null} */
  let livePopoverAgent = null;
  /** @type {HTMLElement|null} */
  let livePopoverNodeEl = null;

  function normalizeRepoPath(p) {
    if (p == null) return '';
    let s = String(p).trim();
    if (!s) return '';
    s = s.replace(/\.git$/i, '');
    if (s.includes('://')) {
      try {
        const u = new URL(s);
        s = u.pathname.replace(/^\/+/, '');
      } catch (_) {
        /* keep */
      }
    }
    return s.toLowerCase();
  }

  function currentWorkflowRepoPath() {
    const inp = el('wf-gitlab-path');
    const manual = inp && inp.value.trim();
    if (manual) return manual;
    const p = currentId && projects.find(x => x.id === currentId);
    return (p && p.gitlabPath) || '';
  }

  function taskRepo(t) {
    if (!t || !t.plan) return '';
    const pl = t.plan;
    return pl.project || pl.projectId || pl.projectName || pl.repo || '';
  }

  function hasRunningTaskForRepo(repoPath) {
    const want = normalizeRepoPath(repoPath);
    if (!want) return false;
    return wfTasks.some(t => {
      const st = (t.status || '').toLowerCase();
      if (st !== 'running' && st !== 'in_progress') return false;
      return normalizeRepoPath(taskRepo(t)) === want;
    });
  }

  function eventMatchesLinkedRepo(ev, repoPath) {
    const want = normalizeRepoPath(repoPath);
    const filterOn = el('wf-live-filter') && el('wf-live-filter').checked;
    if (!filterOn || !want) return true;
    if (ev && ev.project && normalizeRepoPath(ev.project) === want) return true;
    if (hasRunningTaskForRepo(repoPath)) {
      if (!ev || !ev.project) return true;
      return normalizeRepoPath(ev.project) === want;
    }
    if (ev && ev.project) return normalizeRepoPath(ev.project) === want;
    return false;
  }

  function appendLiveLine(kind, text) {
    const pre = el('wf-live-stream');
    if (!pre) return;
    const line = document.createElement('div');
    line.className = 'wf-live-line wf-live-line--' + kind;
    line.textContent = text;
    pre.appendChild(line);
    while (pre.childNodes.length > WF_STREAM_MAX) pre.removeChild(pre.firstChild);
    pre.scrollTop = pre.scrollHeight;
  }

  function feedAgentStream(agentKey, payload) {
    if (!agentKey || agentKey === '?') return;
    if (!wfStreamsByAgent[agentKey]) wfStreamsByAgent[agentKey] = [];
    wfStreamsByAgent[agentKey].push({ ...payload, t: Date.now() });
    while (wfStreamsByAgent[agentKey].length > WF_AGENT_STREAM_MAX) wfStreamsByAgent[agentKey].shift();
    if (livePopoverOpen && livePopoverAgent === agentKey) {
      renderAgentPopoverBody();
    }
  }

  function closeAgentPopover() {
    livePopoverOpen = false;
    livePopoverAgent = null;
    livePopoverNodeEl = null;
    const pop = el('wf-agent-popover');
    if (pop) pop.hidden = true;
  }

  function renderAgentPopoverBody() {
    const body = el('wf-agent-popover-body');
    if (!body || !livePopoverAgent) return;
    const rows = wfStreamsByAgent[livePopoverAgent] || [];
    body.textContent = '';
    rows.forEach(r => {
      const wrap = document.createElement('div');
      wrap.className = 'wf-pop-entry wf-pop-' + (r.kind || 'line');
      if (r.kind === 'code') {
        const meta = document.createElement('div');
        meta.className = 'wf-pop-meta';
        meta.textContent = (r.action ? r.action + ' ' : '') + (r.file || '');
        const code = document.createElement('pre');
        code.className = 'wf-pop-code';
        code.textContent = r.code != null ? String(r.code) : '';
        wrap.appendChild(meta);
        wrap.appendChild(code);
      } else if (r.kind === 'shell') {
        const pre = document.createElement('pre');
        pre.className = 'wf-pop-shell';
        pre.textContent = r.streamLine != null ? String(r.streamLine) : String(r.text || '');
        wrap.appendChild(pre);
      } else {
        wrap.textContent = String(r.text || '');
      }
      body.appendChild(wrap);
    });
    body.scrollTop = body.scrollHeight;
  }

  function positionAgentPopover(nodeDiv) {
    const pop = el('wf-agent-popover');
    const wrap = el('wf-canvas-wrap') || el('wf-canvas');
    if (!pop || !nodeDiv || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const nr = nodeDiv.getBoundingClientRect();
    const pw = Math.min(420, Math.max(280, wr.width * 0.42));
    pop.style.width = pw + 'px';
    let left = nr.left - wr.left + nr.width + 12;
    if (left + pw > wr.width - 8) left = Math.max(8, nr.left - wr.left - pw - 12);
    let top = nr.top - wr.top;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function repositionPopoverIfOpen() {
    if (!livePopoverOpen || !livePopoverAgent) return;
    const canvas = el('wf-canvas');
    const node =
      canvas && canvas.querySelector('.wf-node[data-agent="' + livePopoverAgent + '"]');
    if (node && node.classList.contains('wf-node-live')) {
      livePopoverNodeEl = node;
      positionAgentPopover(node);
    } else {
      closeAgentPopover();
    }
  }

  function maybeOpenWorkflowAgentPanel(nodeDiv) {
    if (!nodeDiv || !nodeDiv.classList.contains('wf-node-live')) {
      closeAgentPopover();
      return;
    }
    const ag = nodeDiv.dataset.agent;
    if (!ag || ag !== liveAgentFromSocket) {
      closeAgentPopover();
      return;
    }
    livePopoverAgent = ag;
    livePopoverOpen = true;
    livePopoverNodeEl = nodeDiv;
    const pop = el('wf-agent-popover');
    const title = el('wf-agent-popover-title');
    if (title) {
      const label = AGENTS.find(a => a.type === ag)?.label || ag;
      title.textContent = label + ' — flux temps réel';
    }
    if (pop) pop.hidden = false;
    renderAgentPopoverBody();
    positionAgentPopover(nodeDiv);
  }

  function applyLiveHighlight() {
    const canvas = el('wf-canvas');
    if (!canvas) return;
    canvas.querySelectorAll('.wf-node').forEach(node => {
      const ag = node.dataset.agent;
      node.classList.toggle('wf-node-live', Boolean(liveAgentFromSocket && ag === liveAgentFromSocket));
    });
    repositionPopoverIfOpen();
  }

  function workflowAttachSocket(socket) {
    if (!socket || wfSocketAttached) return;
    wfSocketAttached = true;

    socket.on('init', state => {
      wfTasks = (state && state.tasks) || [];
      updateLiveMeta();
    });

    socket.on('task', t => {
      if (!t || !t.id) return;
      const i = wfTasks.findIndex(x => x.id === t.id);
      if (i >= 0) wfTasks[i] = { ...wfTasks[i], ...t };
      else wfTasks.unshift(t);
      updateLiveMeta();
    });

    socket.on('agentStatus', data => {
      const next = (data && data.name) || null;
      if (livePopoverOpen && livePopoverAgent && next !== livePopoverAgent) {
        closeAgentPopover();
      }
      liveAgentFromSocket = next;
      applyLiveHighlight();
      const path = currentWorkflowRepoPath();
      if (data && data.activity && eventMatchesLinkedRepo({ agent: data.name, project: null }, path)) {
        appendLiveLine('status', '[' + (data.name || 'agent') + '] ' + data.activity);
        if (data.name) {
          feedAgentStream(data.name, { kind: 'status', text: String(data.activity) });
        }
      }
      updateLiveMeta();
    });

    socket.on('codeEdit', edit => {
      const path = currentWorkflowRepoPath();
      if (!eventMatchesLinkedRepo(edit, path)) return;
      const k = (edit && edit.kind) || 'code';
      const agent = (edit && edit.agent) || '?';
      const file = (edit && edit.file) || '';
      const action = (edit && edit.action) || '';
      const proj = (edit && edit.project) ? ' @' + edit.project : '';
      if (k === 'shell' || k === 'terminal') {
        const chunk = (edit && (edit.stream || edit.code)) || '';
        appendLiveLine('shell', '[' + agent + '] $ ' + chunk + proj);
        if (agent && agent !== '?') {
          feedAgentStream(agent, { kind: 'shell', streamLine: String(chunk) + proj });
        }
      } else {
        const snippet = (edit && edit.code) ? String(edit.code).replace(/\s+/g, ' ').trim().slice(0, 220) : '';
        appendLiveLine('code', '[' + agent + '] ' + action + ' ' + file + proj + (snippet ? ' — ' + snippet : ''));
        if (agent && agent !== '?') {
          feedAgentStream(agent, {
            kind: 'code',
            file,
            action,
            code: edit.code != null ? String(edit.code) : '',
          });
        }
      }
    });

    socket.on('agentCommunication', c => {
      const path = currentWorkflowRepoPath();
      if (!eventMatchesLinkedRepo(c, path)) return;
      const msg = '[' + (c.from || '?') + ' → ' + (c.to || '?') + '] ' + (c.message || '') + (c.type ? ' (' + c.type + ')' : '');
      appendLiveLine('comm', msg);
    });

    socket.on('activity', a => {
      const path = currentWorkflowRepoPath();
      if (!eventMatchesLinkedRepo({ project: a && a.project, agent: a && a.agent }, path)) return;
      const msg =
        (a && a.message) ||
        (a && a.type === 'task-progress' && a.taskId ? 'Task ' + a.taskId + ': ' + (a.message || '') : '');
      if (msg) appendLiveLine('act', String(msg));
    });

    updateLiveMeta();
    try {
      socket.emit('requestStatus');
    } catch (_) {}
  }

  function updateLiveMeta() {
    const meta = el('wf-live-meta');
    if (!meta) return;
    const path = currentWorkflowRepoPath();
    const running = path ? hasRunningTaskForRepo(path) : wfTasks.some(t => /running|in_progress/i.test(t.status || ''));
    if (running) {
      meta.textContent = path
        ? 'Run in progress for ' + path + ' — streaming below when agents emit code/shell/events.'
        : 'A task is running — streaming below.';
    } else {
      meta.textContent = path
        ? 'Idle for ' + path + ' — start a task (dashboard or Telegram) to see live streams here.'
        : 'Link a GitLab repo or select a workflow project to focus the stream.';
    }
  }

  function el(id) {
    return document.getElementById(id);
  }

  /** Ensure edge from/to match node ids (string) — avoids silent misses after JSON/API */
  function normalizeWorkflowEdges() {
    const idSet = new Set(nodes.map(n => String(n.id)));
    edges = (edges || [])
      .map(e => {
        if (!e || typeof e !== 'object') return null;
        const from = String(e.from ?? e.source ?? '');
        const to = String(e.to ?? e.target ?? '');
        return { from, to };
      })
      .filter(e => e && e.from && e.to && e.from !== e.to && idSet.has(e.from) && idSet.has(e.to));
  }

  function clientToCanvas(canvas, clientX, clientY) {
    const c = canvas.getBoundingClientRect();
    return { x: clientX - c.left, y: clientY - c.top };
  }

  /** Port center in canvas-local px (uses real .wf-port-* elements when present) */
  function portCenterForNode(canvas, nodeEl, side) {
    const sel = side === 'out' ? '.wf-port-out' : '.wf-port-in';
    const port = nodeEl.querySelector(sel);
    const c = canvas.getBoundingClientRect();
    if (port) {
      const r = port.getBoundingClientRect();
      return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
    }
    const r = nodeEl.getBoundingClientRect();
    if (side === 'out') {
      return { x: r.right - c.left, y: r.top - c.top + r.height / 2 };
    }
    return { x: r.left - c.left, y: r.top - c.top + r.height / 2 };
  }

  function clearPortHoverHighlight() {
    document.querySelectorAll('.wf-port-in.wf-port-hover').forEach(p => p.classList.remove('wf-port-hover'));
  }

  function highlightPortUnder(clientX, clientY) {
    clearPortHoverHighlight();
    const hit = document.elementFromPoint(clientX, clientY);
    const pin = hit && hit.closest && hit.closest('.wf-port-in');
    if (pin) pin.classList.add('wf-port-hover');
  }

  function scheduleRedrawEdges() {
    requestAnimationFrame(() => {
      drawEdges();
      requestAnimationFrame(() => drawEdges());
    });
  }

  function getSelectedRoundtableAgents() {
    const boxes = document.querySelectorAll('[name="wf-rt-agent"]:checked');
    return Array.from(boxes).map(b => b.value);
  }

  function scrollChatToBottom() {
    const log = el('wf-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function renderChatLog() {
    const log = el('wf-chat-log');
    if (!log) return;
    log.innerHTML = '';
    if (roundtableHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'wf-chat-empty';
      empty.textContent =
        'Ask the team a question. Selected agents reply one after another — orchestrated turns, no cross-talk.';
      log.appendChild(empty);
      return;
    }
    roundtableHistory.forEach(m => {
      const row = document.createElement('div');
      if (m.role === 'user') {
        row.className = 'wf-msg wf-msg-user';
        const body = document.createElement('div');
        body.className = 'wf-msg-body';
        body.textContent = m.content;
        row.appendChild(body);
      } else {
        row.className = 'wf-msg wf-msg-agent';
        if (m.agentType) row.dataset.agent = m.agentType;
        const meta = document.createElement('div');
        meta.className = 'wf-msg-meta';
        meta.textContent = m.label || m.agentType || 'Agent';
        const body = document.createElement('div');
        body.className = 'wf-msg-body';
        body.textContent = m.content;
        row.appendChild(meta);
        row.appendChild(body);
      }
      log.appendChild(row);
    });
    scrollChatToBottom();
  }

  function syncAgentsFromCanvas() {
    const types = [...new Set(nodes.map(n => n.agentType).filter(Boolean))];
    if (!types.length) {
      alert('Add agents to the canvas first.');
      return;
    }
    document.querySelectorAll('[name="wf-rt-agent"]').forEach(cb => {
      cb.checked = types.includes(cb.value);
    });
    if (typeof showNotification === 'function') showNotification('Speaker list matched to canvas', 'success');
  }

  function sendRoundtable() {
    const ta = el('wf-user-message');
    const msg = (ta && ta.value.trim()) || '';
    if (!msg) {
      alert('Type a message for the team');
      return;
    }
    const agents = getSelectedRoundtableAgents();
    if (!agents.length) {
      alert('Select at least one agent');
      return;
    }
    const context =
      (el('wf-meeting-context') && el('wf-meeting-context').value.trim()) ||
      (currentId ? projects.find(p => p.id === currentId)?.name : '') ||
      '';
    const prior = roundtableHistory.slice();
    roundtableHistory.push({ role: 'user', content: msg });
    if (ta) ta.value = '';
    renderChatLog();

    const btn = el('wf-roundtable-send');
    if (btn) btn.disabled = true;

    fetch('/api/meeting/roundtable', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, context, agents, history: prior }),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Roundtable failed');
        const turns = d.turns || [];
        if (!turns.length) throw new Error('No replies');
        turns.forEach((t, i) => {
          setTimeout(() => {
            roundtableHistory.push({
              role: 'agent',
              agentType: t.agentType,
              label: t.label,
              content: t.content,
            });
            renderChatLog();
            if (i === turns.length - 1 && typeof showNotification === 'function') {
              showNotification('Team replied', 'success');
            }
          }, i * 240);
        });
      })
      .catch(err => {
        roundtableHistory.pop();
        renderChatLog();
        if (ta) ta.value = msg;
        alert(err.message || 'Failed');
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  }

  function loadGitlabRepos() {
    return fetch('/api/gitlab/repos', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        gitlabRepos = d.repos || [];
        const sel = el('wf-gitlab-repo-select');
        if (!sel) return;
        const pathVal = (el('wf-gitlab-path') && el('wf-gitlab-path').value) || '';
        sel.innerHTML = '<option value="">— Select a GitLab repo —</option>';
        gitlabRepos.forEach(r => {
          const o = document.createElement('option');
          o.value = r.fullPath;
          o.textContent = r.fullPath + (r.name ? ` · ${r.name}` : '');
          o.dataset.id = r.id;
          sel.appendChild(o);
        });
        if (pathVal && gitlabRepos.some(x => x.fullPath === pathVal)) sel.value = pathVal;
      })
      .catch(() => {
        const sel = el('wf-gitlab-repo-select');
        if (sel) sel.innerHTML = '<option value="">GitLab unavailable (check token)</option>';
      });
  }

  function loadProjects() {
    return fetch('/api/workflow-projects', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        projects = d.projects || [];
        const sel = el('wf-project-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Select project —</option>';
        projects.forEach(p => {
          const o = document.createElement('option');
          o.value = p.id;
          o.textContent = p.name + (p.gitlabPath ? ` (${p.gitlabPath})` : '');
          sel.appendChild(o);
        });
      })
      .catch(() => {});
  }

  function saveCurrent() {
    if (!currentId) return;
    const body = { nodes, edges };
    return fetch('/api/workflow-projects/' + encodeURIComponent(currentId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success && typeof showNotification === 'function') showNotification('Flow saved', 'success');
      });
  }

  function renderPalette() {
    const box = el('wf-palette-items');
    if (!box) return;
    box.innerHTML = AGENTS.map(
      a =>
        `<div class="wf-palette-item" draggable="true" data-agent-type="${a.type}" data-agent-label="${a.label}">${a.label}</div>`
    ).join('');
    box.querySelectorAll('.wf-palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('agent-type', item.getAttribute('data-agent-type'));
        e.dataTransfer.setData('agent-label', item.getAttribute('data-agent-label'));
      });
    });
  }

  function nodeId() {
    return 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function renderNodes() {
    const canvas = el('wf-canvas');
    if (!canvas) return;
    canvas.querySelectorAll('.wf-node').forEach(n => n.remove());
    nodes.forEach(n => {
      const div = document.createElement('div');
      div.className = 'wf-node';
      div.dataset.id = n.id;
      div.dataset.agent = n.agentType || 'backend-dev';
      div.style.left = n.x + 'px';
      div.style.top = n.y + 'px';
      const agent = AGENTS.find(a => a.type === n.agentType) || { label: n.agentType };
      div.innerHTML =
        '<button type="button" class="wf-port wf-port-in" aria-label="Input — drop connection here" title="Input"></button>' +
        '<button type="button" class="wf-port wf-port-out" aria-label="Output — drag to connect" title="Drag to another node"></button>' +
        '<button type="button" class="wf-remove" title="Remove">&times;</button>' +
        '<div class="wf-node-body">' +
        '<div class="wf-node-type">' +
        agent.label +
        '</div>' +
        '<div class="wf-node-label">' +
        (n.note || n.agentType) +
        '</div>' +
        '</div>';
      div.querySelector('.wf-remove').addEventListener('click', ev => {
        ev.stopPropagation();
        nodes = nodes.filter(x => x.id !== n.id);
        edges = edges.filter(e => e.from !== n.id && e.to !== n.id);
        renderNodes();
        drawEdges();
      });
      const portOut = div.querySelector('.wf-port-out');
      if (portOut) {
        portOut.addEventListener('pointerdown', e => startWireFromPort(e, div, n.id));
      }
      div.addEventListener('mousedown', startDrag);
      canvas.appendChild(div);
    });
    normalizeWorkflowEdges();
    applyLiveHighlight();
    syncCanvasExtent();
    scheduleRedrawEdges();
  }

  function startWireFromPort(e, nodeDiv, nodeId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const canvas = el('wf-canvas');
    if (!canvas) return;
    const p = portCenterForNode(canvas, nodeDiv, 'out');
    wireDrag = {
      fromId: String(nodeId),
      x0: p.x,
      y0: p.y,
      curX: p.x,
      curY: p.y,
    };
    canvas.classList.add('wf-wiring');
    nodeDiv.classList.add('wf-node-wiring-source');

    function onMove(ev) {
      if (!wireDrag) return;
      const c = clientToCanvas(canvas, ev.clientX, ev.clientY);
      wireDrag.curX = c.x;
      wireDrag.curY = c.y;
      highlightPortUnder(ev.clientX, ev.clientY);
      drawEdges();
    }

    function endWire(ev) {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', endWire, true);
      document.removeEventListener('pointercancel', endWire, true);
      clearPortHoverHighlight();
      canvas.classList.remove('wf-wiring');
      nodeDiv.classList.remove('wf-node-wiring-source');

      const fromId = wireDrag && wireDrag.fromId;
      wireDrag = null;

      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const portIn = hit && hit.closest && hit.closest('.wf-port-in');
      const targetNode = portIn && portIn.closest('.wf-node');
      const toId = targetNode && targetNode.dataset.id && String(targetNode.dataset.id);

      if (fromId && toId && toId !== fromId) {
        const exists = edges.some(ed => ed.from === fromId && ed.to === toId);
        if (!exists) edges.push({ from: fromId, to: toId });
        normalizeWorkflowEdges();
      }

      drawEdges();
      scheduleRedrawEdges();
    }

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', endWire, true);
    document.addEventListener('pointercancel', endWire, true);
    drawEdges();
  }

  /** Expand canvas so absolute nodes affect scroll size; required for SVG 1:1 with node coords */
  function syncCanvasExtent() {
    const canvas = el('wf-canvas');
    if (!canvas) return;
    const minW = 800;
    const minH = 560;
    if (!nodes.length) {
      canvas.style.minWidth = '';
      canvas.style.minHeight = '';
      return;
    }
    let maxR = minW;
    let maxB = minH;
    nodes.forEach(n => {
      const div = canvas.querySelector('.wf-node[data-id="' + n.id + '"]');
      const w = div ? div.offsetWidth : NODE_W;
      const h = div ? div.offsetHeight : 96;
      maxR = Math.max(maxR, n.x + w + CANVAS_PAD);
      maxB = Math.max(maxB, n.y + h + CANVAS_PAD);
    });
    canvas.style.minWidth = Math.ceil(maxR) + 'px';
    canvas.style.minHeight = Math.ceil(maxB) + 'px';
  }

  function startDrag(e) {
    if (e.target.closest('.wf-remove') || e.target.closest('.wf-port')) return;
    const id = e.currentTarget.dataset.id;
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const canvas = el('wf-canvas');
    const rect = canvas.getBoundingClientRect();
    let moved = false;
    dragState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
    function move(ev) {
      if (!dragState) return;
      if (Math.abs(ev.clientX - dragState.startX) > 6 || Math.abs(ev.clientY - dragState.startY) > 6) {
        moved = true;
      }
      const n = nodes.find(x => x.id === dragState.id);
      if (!n) return;
      n.x = Math.max(0, dragState.origX + (ev.clientX - dragState.startX));
      n.y = Math.max(0, dragState.origY + (ev.clientY - dragState.startY));
      const div = canvas.querySelector('.wf-node[data-id="' + dragState.id + '"]');
      if (div) {
        div.style.left = n.x + 'px';
        div.style.top = n.y + 'px';
      }
      syncCanvasExtent();
      drawEdges();
      repositionPopoverIfOpen();
    }
    function up() {
      const sid = dragState && dragState.id;
      dragState = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      syncCanvasExtent();
      scheduleRedrawEdges();
      repositionPopoverIfOpen();
      if (!moved && sid && canvas) {
        const nodeDiv = canvas.querySelector('.wf-node[data-id="' + sid + '"]');
        if (nodeDiv) {
          maybeOpenWorkflowAgentPanel(nodeDiv);
        }
      }
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  }

  function drawEdges() {
    const svg = el('wf-svg');
    const canvas = el('wf-canvas');
    if (!svg || !canvas) return;
    syncCanvasExtent();
    const w = Math.max(canvas.scrollWidth, canvas.offsetWidth, 400);
    const h = Math.max(canvas.scrollHeight, canvas.offsetHeight, 400);
    /* Critical: map viewBox 1:1 to canvas pixels (default 'meet' scales and misaligns vs position:absolute nodes) */
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('preserveAspectRatio', 'none');

    let pathsHtml = '';
    edges.forEach(e => {
      const a = nodes.find(n => String(n.id) === String(e.from));
      const b = nodes.find(n => String(n.id) === String(e.to));
      if (!a || !b) return;
      const elA = canvas.querySelector('.wf-node[data-id="' + a.id + '"]');
      const elB = canvas.querySelector('.wf-node[data-id="' + b.id + '"]');
      if (!elA || !elB) return;
      const p1 = portCenterForNode(canvas, elA, 'out');
      const p2 = portCenterForNode(canvas, elB, 'in');
      const x1 = p1.x;
      const y1 = p1.y;
      const x2 = p2.x;
      const y2 = p2.y;
      const dist = Math.abs(x2 - x1);
      const dx = Math.min(140, Math.max(56, dist * 0.45));
      const sign = x2 >= x1 ? 1 : -1;
      const d =
        'M ' +
        x1 +
        ' ' +
        y1 +
        ' C ' +
        (x1 + sign * dx) +
        ' ' +
        y1 +
        ', ' +
        (x2 - sign * dx) +
        ' ' +
        y2 +
        ', ' +
        x2 +
        ' ' +
        y2;
      pathsHtml +=
        '<path d="' +
        d +
        '" fill="none" stroke="url(#wf-edge-glow)" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" marker-end="url(#wf-arrow)" />';
    });

    if (wireDrag) {
      const x1 = wireDrag.x0;
      const y1 = wireDrag.y0;
      const x2 = wireDrag.curX;
      const y2 = wireDrag.curY;
      const dist = Math.abs(x2 - x1);
      const dx = Math.min(140, Math.max(56, dist * 0.45));
      const sign = x2 >= x1 ? 1 : -1;
      const wd =
        'M ' +
        x1 +
        ' ' +
        y1 +
        ' C ' +
        (x1 + sign * dx) +
        ' ' +
        y1 +
        ', ' +
        (x2 - sign * dx) +
        ' ' +
        y2 +
        ', ' +
        x2 +
        ' ' +
        y2;
      pathsHtml +=
        '<path d="' +
        wd +
        '" fill="none" stroke="#ff570a" stroke-width="2.5" stroke-dasharray="8 5" stroke-linecap="round" opacity="0.85" />';
    }

    svg.innerHTML =
      '<defs>' +
      '<linearGradient id="wf-edge-glow" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#ff8f4a"/>' +
      '<stop offset="100%" stop-color="#ff570a"/>' +
      '</linearGradient>' +
      '<marker id="wf-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="userSpaceOnUse">' +
      '<path d="M0,0 L10,5 L0,10 z" fill="#ff570a"/>' +
      '</marker>' +
      '</defs>' +
      pathsHtml;
  }

  function onCanvasDrop(e) {
    e.preventDefault();
    const type = e.dataTransfer.getData('agent-type');
    const label = e.dataTransfer.getData('agent-label');
    if (!type) return;
    const canvas = el('wf-canvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - 50;
    const y = e.clientY - rect.top - 20;
    nodes.push({ id: nodeId(), agentType: type, note: label, x: Math.max(0, x), y: Math.max(0, y) });
    renderNodes();
  }

  function selectProject(id) {
    currentId = id || null;
    const p = projects.find(x => x.id === id);
    if (p) {
      nodes = Array.isArray(p.nodes) ? JSON.parse(JSON.stringify(p.nodes)) : [];
      edges = Array.isArray(p.edges) ? JSON.parse(JSON.stringify(p.edges)) : [];
      normalizeWorkflowEdges();
      const gp = el('wf-gitlab-path');
      if (gp) gp.value = p.gitlabPath || '';
      const gr = el('wf-gitlab-repo-select');
      if (gr && p.gitlabPath && gitlabRepos.some(x => x.fullPath === p.gitlabPath)) gr.value = p.gitlabPath;
    } else {
      nodes = [];
      edges = [];
    }
    roundtableHistory = [];
    renderChatLog();
    renderNodes();
    updateLiveMeta();
  }

  function showAiInsights(data) {
    const box = el('wf-ai-insights');
    const sum = el('wf-ai-summary');
    const rat = el('wf-ai-rationale');
    const hints = el('wf-ai-hints');
    if (!box || !sum || !rat) return;
    box.style.display = 'block';
    sum.textContent = data.summary || '';
    rat.textContent = data.rationale ? 'Why this topology: ' + data.rationale : '';
    if (hints) {
      hints.innerHTML = '';
      (data.stackHints || []).forEach(h => {
        const s = document.createElement('span');
        s.className = 'wf-chip';
        s.textContent = h;
        hints.appendChild(s);
      });
    }
  }

  function runDraftFlow() {
    const pathInput = el('wf-gitlab-path');
    const repoSel = el('wf-gitlab-repo-select');
    let gitlabPath = (pathInput && pathInput.value.trim()) || (repoSel && repoSel.value) || '';
    if (!gitlabPath) {
      alert('Choose a GitLab repository or enter group/repo');
      return;
    }
    const btn = el('wf-btn-draft');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
    }
    fetch('/api/workflow-projects/draft-from-repo', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gitlabPath }),
    })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Draft failed');
        nodes = d.nodes || [];
        edges = d.edges || [];
        normalizeWorkflowEdges();
        if (pathInput) pathInput.value = gitlabPath;
        renderNodes();
        showAiInsights(d);
        if (typeof showNotification === 'function') showNotification('AI workflow drafted — review and Save', 'success');
      })
      .catch(err => {
        alert(err.message || 'Draft failed');
      })
      .finally(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '✨ AI draft flow';
        }
      });
  }

  function initWorkflowStudio() {
    renderPalette();
    loadGitlabRepos()
      .then(() => loadProjects())
      .then(() => {
        const sel = el('wf-project-select');
        if (sel && sel.value) selectProject(sel.value);
      });

    if (wfBound) return;
    wfBound = true;

    const canvas = el('wf-canvas');
    if (canvas) {
      canvas.addEventListener('dragover', e => e.preventDefault());
      canvas.addEventListener('drop', onCanvasDrop);
    }

    const sel = el('wf-project-select');
    if (sel) {
      sel.addEventListener('change', () => selectProject(sel.value));
    }

    const btnNew = el('wf-btn-new');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        const name = prompt('Project name?', 'New project');
        if (!name) return;
        fetch('/api/workflow-projects', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), nodes: [], edges: [] }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.success && d.project) {
              loadProjects().then(() => {
                el('wf-project-select').value = d.project.id;
                selectProject(d.project.id);
              });
            }
          });
      });
    }

    const btnSave = el('wf-btn-save');
    if (btnSave) btnSave.addEventListener('click', () => saveCurrent());

    const repoSel = el('wf-gitlab-repo-select');
    if (repoSel) {
      repoSel.addEventListener('change', () => {
        const v = repoSel.value;
        const pathInput = el('wf-gitlab-path');
        if (pathInput && v) pathInput.value = v;
      });
    }

    const btnDraft = el('wf-btn-draft');
    if (btnDraft) btnDraft.addEventListener('click', runDraftFlow);

    const dismiss = el('wf-ai-dismiss');
    if (dismiss) {
      dismiss.addEventListener('click', () => {
        const box = el('wf-ai-insights');
        if (box) box.style.display = 'none';
      });
    }

    const btnGitlab = el('wf-btn-save-gitlab');
    if (btnGitlab) {
      btnGitlab.addEventListener('click', () => {
        if (!currentId) return alert('Select a project first');
        const gitlabPath = (el('wf-gitlab-path') && el('wf-gitlab-path').value) || '';
        fetch('/api/workflow-projects/' + encodeURIComponent(currentId), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gitlabPath, nodes, edges }),
        })
          .then(r => r.json())
          .then(d => {
            if (d.success && typeof showNotification === 'function') showNotification('GitLab path saved', 'success');
          });
      });
    }

    const btnRt = el('wf-roundtable-send');
    if (btnRt) {
      btnRt.addEventListener('click', sendRoundtable);
    }
    const taUser = el('wf-user-message');
    if (taUser) {
      taUser.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          sendRoundtable();
        }
      });
    }
    const btnSyncCanvas = el('wf-sync-canvas-agents');
    if (btnSyncCanvas) btnSyncCanvas.addEventListener('click', syncAgentsFromCanvas);
    const btnClearChat = el('wf-chat-clear');
    if (btnClearChat) {
      btnClearChat.addEventListener('click', () => {
        if (roundtableHistory.length && !confirm('Clear the meeting chat?')) return;
        roundtableHistory = [];
        renderChatLog();
      });
    }

    const btnVoiceLink = el('wf-btn-voice-link');
    if (btnVoiceLink) {
      btnVoiceLink.addEventListener('click', () => {
        fetch('/api/meeting/sessions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
          .then(r => r.json())
          .then(d => {
            if (!d.success) throw new Error(d.error || 'Failed');
            const lines = `Meeting room (AI + voice):\n${d.meetingRoomUrl}\n\nJitsi (humans):\n${d.jitsiUrl}`;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(d.meetingRoomUrl).catch(() => {});
            }
            alert(lines + '\n\n(Meeting URL copied to clipboard if permitted.)');
            if (typeof showNotification === 'function') showNotification('Voice links ready — check alert', 'success');
          })
          .catch(err => alert(err.message || 'Request failed'));
      });
    }

    const btnMeet = el('wf-meeting-submit');
    if (btnMeet) {
      btnMeet.addEventListener('click', () => {
        const text = el('wf-meeting-text') && el('wf-meeting-text').value.trim();
        if (!text) return alert('Paste meeting transcript or notes');
        const context =
          (el('wf-meeting-context') && el('wf-meeting-context').value.trim()) ||
          (currentId ? projects.find(p => p.id === currentId)?.name : '') ||
          '';
        btnMeet.disabled = true;
        fetch('/api/meeting/transcript', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, context }),
        })
          .then(r => r.json())
          .then(d => {
            const out = el('wf-meeting-reply');
            if (out) {
              out.style.display = 'block';
              out.textContent = d.reply || d.error || 'Error';
            }
            if (d.success && typeof showNotification === 'function') showNotification('Agent reply ready', 'success');
          })
          .catch(err => {
            const out = el('wf-meeting-reply');
            if (out) {
              out.style.display = 'block';
              out.textContent = err.message || 'Request failed';
            }
          })
          .finally(() => {
            btnMeet.disabled = false;
          });
      });
    }

    function onWorkflowLayoutChange() {
      scheduleRedrawEdges();
      repositionPopoverIfOpen();
    }
    window.addEventListener('resize', onWorkflowLayoutChange);

    const canvasEl = el('wf-canvas');
    if (canvasEl && typeof ResizeObserver !== 'undefined') {
      wfCanvasResizeObserver = new ResizeObserver(onWorkflowLayoutChange);
      wfCanvasResizeObserver.observe(canvasEl);
    }

    const wfPopoverClose = el('wf-agent-popover-close');
    if (wfPopoverClose) wfPopoverClose.addEventListener('click', () => closeAgentPopover());
    const wfCanvasWrap = el('wf-canvas-wrap');
    if (wfCanvasWrap) {
      wfCanvasWrap.addEventListener('click', e => {
        if (e.target.closest('.wf-node')) return;
        if (e.target.closest('#wf-agent-popover')) return;
        closeAgentPopover();
      });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && livePopoverOpen) {
        e.preventDefault();
        closeAgentPopover();
      }
    });

    renderChatLog();

    const wfLiveFilter = el('wf-live-filter');
    if (wfLiveFilter) wfLiveFilter.addEventListener('change', () => updateLiveMeta());
    const wfLiveClear = el('wf-live-clear');
    if (wfLiveClear) {
      wfLiveClear.addEventListener('click', () => {
        const pre = el('wf-live-stream');
        if (pre) pre.innerHTML = '';
      });
    }
    const wfPathLive = el('wf-gitlab-path');
    if (wfPathLive) wfPathLive.addEventListener('input', () => updateLiveMeta());

    if (typeof window !== 'undefined' && window.__NIGENTS_DASHBOARD_SOCKET) {
      workflowAttachSocket(window.__NIGENTS_DASHBOARD_SOCKET);
    }
  }

  window.workflowAttachSocket = workflowAttachSocket;
  window.initWorkflowStudio = initWorkflowStudio;
})();
