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
  let connectFrom = null;
  let dragState = null;
  let wfBound = false;
  const NODE_W = 168;
  const CANVAS_PAD = 48;
  let gitlabRepos = [];
  let wfCanvasResizeObserver = null;

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

  /** Port positions in the same coordinate space as the SVG (canvas-local px) */
  function portCoords(canvas, nodeEl, side) {
    const c = canvas.getBoundingClientRect();
    const r = nodeEl.getBoundingClientRect();
    if (side === 'out') {
      return {
        x: r.right - c.left,
        y: r.top - c.top + r.height / 2,
      };
    }
    return {
      x: r.left - c.left,
      y: r.top - c.top + r.height / 2,
    };
  }

  function scheduleRedrawEdges() {
    requestAnimationFrame(() => {
      drawEdges();
      requestAnimationFrame(() => drawEdges());
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
      div.className = 'wf-node' + (connectFrom === n.id ? ' selected' : '');
      div.dataset.id = n.id;
      div.dataset.agent = n.agentType || 'backend-dev';
      div.style.left = n.x + 'px';
      div.style.top = n.y + 'px';
      const agent = AGENTS.find(a => a.type === n.agentType) || { label: n.agentType };
      div.innerHTML =
        '<button type="button" class="wf-remove" title="Remove">&times;</button>' +
        '<div class="wf-node-type">' +
        agent.label +
        '</div>' +
        '<div class="wf-node-label">' +
        (n.note || n.agentType) +
        '</div>';
      div.querySelector('.wf-remove').addEventListener('click', ev => {
        ev.stopPropagation();
        nodes = nodes.filter(x => x.id !== n.id);
        edges = edges.filter(e => e.from !== n.id && e.to !== n.id);
        renderNodes();
        drawEdges();
      });
      div.addEventListener('mousedown', startDrag);
      div.addEventListener('click', ev => {
        ev.stopPropagation();
        if (!el('wf-connect-mode') || !el('wf-connect-mode').checked) return;
        if (!connectFrom) {
          connectFrom = n.id;
          renderNodes();
        } else if (connectFrom !== n.id) {
          const exists = edges.some(e => e.from === connectFrom && e.to === n.id);
          if (!exists) edges.push({ from: connectFrom, to: n.id });
          connectFrom = null;
          el('wf-connect-mode').checked = false;
          renderNodes();
          drawEdges();
        }
      });
      canvas.appendChild(div);
    });
    normalizeWorkflowEdges();
    syncCanvasExtent();
    scheduleRedrawEdges();
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
    if (e.target.closest('.wf-remove')) return;
    const id = e.currentTarget.dataset.id;
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const canvas = el('wf-canvas');
    const rect = canvas.getBoundingClientRect();
    dragState = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
    function move(ev) {
      if (!dragState) return;
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
    }
    function up() {
      dragState = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      syncCanvasExtent();
      scheduleRedrawEdges();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('pointerup', up);
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
      const p1 = portCoords(canvas, elA, 'out');
      const p2 = portCoords(canvas, elB, 'in');
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
    connectFrom = null;
    renderNodes();
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
        connectFrom = null;
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

    window.addEventListener('resize', () => scheduleRedrawEdges());

    const canvasEl = el('wf-canvas');
    if (canvasEl && typeof ResizeObserver !== 'undefined') {
      wfCanvasResizeObserver = new ResizeObserver(() => scheduleRedrawEdges());
      wfCanvasResizeObserver.observe(canvasEl);
    }
  }

  window.initWorkflowStudio = initWorkflowStudio;
})();
