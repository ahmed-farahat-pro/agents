/**
 * Standalone meeting room: Jitsi + roundtable + Web Speech (STT + TTS).
 * Requires ?token= from Telegram or dashboard "voice link".
 */
(function () {
  const AGENTS = [
    { type: 'orchestrator', label: 'Orch' },
    { type: 'planner', label: 'Plan' },
    { type: 'backend-dev', label: 'Back' },
    { type: 'frontend-dev', label: 'Front' },
    { type: 'qa-tester', label: 'QA' },
    { type: 'code-reviewer', label: 'Review' },
    { type: 'reporter', label: 'Report' },
  ];

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const errEl = document.getElementById('mr-error');
  const rootEl = document.getElementById('mr-root');

  let history = [];

  function showErr(msg) {
    errEl.style.display = 'block';
    errEl.textContent = msg;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function defaultAgents() {
    return ['orchestrator', 'planner', 'backend-dev'];
  }

  function selectedAgents() {
    const boxes = document.querySelectorAll('#mr-agents input[type="checkbox"]:checked');
    return Array.from(boxes).map(b => b.value);
  }

  function renderChat() {
    const box = el('mr-chat');
    if (!box) return;
    box.innerHTML = '';
    if (!history.length) {
      box.innerHTML = '<div class="mr-hint">Messages appear here. Use Send or the microphone.</div>';
      return;
    }
    history.forEach(m => {
      const d = document.createElement('div');
      d.className = 'mr-msg ' + (m.role === 'user' ? 'mr-msg-user' : 'mr-msg-agent');
      if (m.role === 'agent') {
        const meta = document.createElement('div');
        meta.className = 'mr-msg-meta';
        meta.textContent = m.label || m.agentType || 'Agent';
        d.appendChild(meta);
      }
      const body = document.createElement('div');
      body.textContent = m.content;
      d.appendChild(body);
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  }

  function speakSequential(texts) {
    return new Promise(resolve => {
      let i = 0;
      function next() {
        if (i >= texts.length) {
          resolve();
          return;
        }
        const u = new SpeechSynthesisUtterance(texts[i]);
        u.rate = 1;
        u.onend = () => {
          i += 1;
          next();
        };
        u.onerror = () => {
          i += 1;
          next();
        };
        window.speechSynthesis.speak(u);
      }
      window.speechSynthesis.cancel();
      next();
    });
  }

  async function sendToTeam(text) {
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    const msg = (text || '').trim();
    if (!msg) return;
    const agents = selectedAgents();
    if (!agents.length) {
      showErr('Select at least one agent.');
      return;
    }
    const context = (el('mr-context') && el('mr-context').value.trim()) || '';
    const prior = history.slice();
    history.push({ role: 'user', content: msg });
    renderChat();
    el('mr-text').value = '';

    const res = await fetch('/api/meeting/session/' + encodeURIComponent(token) + '/roundtable', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        context,
        agents,
        history: prior,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      history.pop();
      renderChat();
      el('mr-text').value = msg;
      showErr(data.error || res.statusText || 'Request failed');
      return;
    }
    const turns = data.turns || [];
    const lines = [];
    turns.forEach(t => {
      history.push({
        role: 'agent',
        agentType: t.agentType,
        label: t.label,
        content: t.content,
      });
      lines.push((t.label || t.agentType) + ' says: ' + t.content);
      renderChat();
    });
    if (lines.length && 'speechSynthesis' in window) {
      await speakSequential(lines);
    }
  }

  function initAgents() {
    const wrap = el('mr-agents');
    if (!wrap) return;
    const defaults = defaultAgents();
    AGENTS.forEach(a => {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = a.type;
      cb.checked = defaults.includes(a.type);
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + a.label));
      wrap.appendChild(lab);
    });
  }

  async function boot() {
    if (!token) {
      showErr(
        'Missing token. Open this page from the link sent by the bot (/meeting) or use “Shareable voice room” in Workflow Studio.'
      );
      return;
    }
    const res = await fetch('/api/meeting/session/' + encodeURIComponent(token));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showErr(data.error || 'Invalid or expired meeting link. Ask the bot for /meeting again.');
      return;
    }
    rootEl.style.display = 'grid';
    const iframe = el('mr-jitsi-frame');
    const url = data.jitsiUrl + '#config.prejoinPageEnabled=false';
    iframe.src = url;

    initAgents();
    renderChat();

    el('mr-send').addEventListener('click', () => sendToTeam(el('mr-text').value));
    el('mr-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendToTeam(el('mr-text').value);
      }
    });
    el('mr-clear').addEventListener('click', () => {
      if (history.length && !confirm('Clear AI chat?')) return;
      history = [];
      renderChat();
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = el('mr-mic');
    if (!SpeechRecognition) {
      mic.disabled = true;
      mic.title = 'Speech recognition not supported in this browser';
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;

    mic.addEventListener('mousedown', e => {
      e.preventDefault();
      try {
        mic.classList.add('recording');
        rec.start();
      } catch (_) {}
    });
    mic.addEventListener('mouseup', () => {
      mic.classList.remove('recording');
      try {
        rec.stop();
      } catch (_) {}
    });
    mic.addEventListener('mouseleave', () => {
      mic.classList.remove('recording');
      try {
        rec.stop();
      } catch (_) {}
    });
    mic.addEventListener('touchstart', e => {
      e.preventDefault();
      try {
        mic.classList.add('recording');
        rec.start();
      } catch (_) {}
    });
    mic.addEventListener('touchend', e => {
      e.preventDefault();
      mic.classList.remove('recording');
      try {
        rec.stop();
      } catch (_) {}
    });

    rec.onresult = ev => {
      const said = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      if (said.trim()) sendToTeam(said);
    };
    rec.onerror = () => {
      mic.classList.remove('recording');
    };
  }

  boot();
})();
