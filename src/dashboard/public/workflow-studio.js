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

  function el(id) {
    return document.getElementById(id);
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
    drawEdges();
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
      drawEdges();
    }
    function up() {
      dragState = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    e.preventDefault();
  }

  function drawEdges() {
    const svg = el('wf-svg');
    const canvas = el('wf-canvas');
    if (!svg || !canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    let path = '';
    edges.forEach(e => {
      const a = nodes.find(n => n.id === e.from);
      const b = nodes.find(n => n.id === e.to);
      if (!a || !b) return;
      const x1 = a.x + 100;
      const y1 = a.y + 24;
      const x2 = b.x + 100;
      const y2 = b.y + 24;
      const cx = (x1 + x2) / 2;
      path += 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2 + ' ';
    });
    svg.innerHTML =
      '<path d="' + path + '" fill="none" stroke="#ff570a" stroke-width="2" opacity="0.85" />';
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
      const gp = el('wf-gitlab-path');
      if (gp) gp.value = p.gitlabPath || '';
    } else {
      nodes = [];
      edges = [];
    }
    connectFrom = null;
    renderNodes();
  }

  function initWorkflowStudio() {
    renderPalette();
    loadProjects().then(() => {
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

    window.addEventListener('resize', drawEdges);
  }

  window.initWorkflowStudio = initWorkflowStudio;
})();
