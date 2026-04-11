/**
 * Standalone meeting room: Jitsi + shared Socket.IO roundtable + Web Speech (STT + TTS).
 * Same ?token= = same AI thread for all participants (multi-user / multi-tab).
 */
(function () {
  const AGENTS = [
    { type: 'orchestrator', label: 'Orch' },
    { type: 'architect', label: 'Arch' },
    { type: 'planner', label: 'Plan' },
    { type: 'backend-dev', label: 'Back' },
    { type: 'frontend-dev', label: 'Front' },
    { type: 'devops', label: 'DevOps' },
    { type: 'security', label: 'Sec' },
    { type: 'qa-tester', label: 'QA' },
    { type: 'code-reviewer', label: 'Review' },
    { type: 'reporter', label: 'Report' },
  ];

  const NAME_KEY = 'mr-display-name';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const errEl = document.getElementById('mr-error');
  const rootEl = document.getElementById('mr-root');

  let history = [];
  let processing = false;
  let socket = null;

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

  function getDisplayName() {
    const n = el('mr-name');
    const v = (n && n.value.trim()) || localStorage.getItem(NAME_KEY) || '';
    if (n && v) localStorage.setItem(NAME_KEY, v);
    return v || 'Guest';
  }

  function updateBusy() {
    const sendBtn = el('mr-send');
    const text = el('mr-text');
    const busy = el('mr-busy');
    if (sendBtn) sendBtn.disabled = processing;
    if (text) text.disabled = processing;
    if (busy) busy.style.display = processing ? 'block' : 'none';
  }

  function renderChat() {
    const box = el('mr-chat');
    if (!box) return;
    box.innerHTML = '';
    if (!history.length) {
      box.innerHTML =
        '<div class="mr-hint">Messages appear here for <strong>everyone</strong> with this link. Type, hold mic, or use Always listen.</div>';
      return;
    }
    history.forEach(m => {
      const d = document.createElement('div');
      d.className = 'mr-msg ' + (m.role === 'user' ? 'mr-msg-user' : 'mr-msg-agent');
      if (m.role === 'user' && m.from) {
        const from = document.createElement('div');
        from.className = 'mr-msg-from';
        from.textContent = m.from;
        d.appendChild(from);
      }
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

  function sendToTeam(text) {
    if (errEl) {
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    const msg = (text || '').trim();
    if (!msg) return;
    if (!socket || !socket.connected) {
      showErr('Not connected — wait a moment or refresh.');
      return;
    }
    const agents = selectedAgents();
    if (!agents.length) {
      showErr('Select at least one agent.');
      return;
    }
    const context = (el('mr-context') && el('mr-context').value.trim()) || '';
    el('mr-text').value = '';

    socket.emit('meeting-roundtable', {
      token,
      message: msg,
      context,
      agents,
      displayName: getDisplayName(),
    });
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

  function bindSocket() {
    if (typeof io !== 'function') {
      showErr('Socket.IO not loaded. Ensure the dashboard serves /socket.io/socket.io.js');
      return;
    }

    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join-meeting', { token });
    });

    socket.on('meeting-sync', payload => {
      const h = payload && payload.history;
      const p = payload && payload.processing;
      if (Array.isArray(h)) history = h;
      if (typeof p === 'boolean') processing = p;
      renderChat();
      updateBusy();
    });

    socket.on('meeting-roundtable-done', ({ requesterSocketId, history: h, turns }) => {
      if (Array.isArray(h)) history = h;
      processing = false;
      renderChat();
      updateBusy();
      if (socket.id === requesterSocketId && turns && turns.length && 'speechSynthesis' in window) {
        const lines = turns.map(t => (t.label || t.agentType) + ' says: ' + t.content);
        speakSequential(lines);
      }
    });

    socket.on('meeting-error', ({ error: err }) => {
      showErr(err || 'Meeting error');
      processing = false;
      updateBusy();
    });

    socket.on('disconnect', () => {
      processing = false;
      updateBusy();
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

    const nameInput = el('mr-name');
    if (nameInput) {
      nameInput.value = localStorage.getItem(NAME_KEY) || '';
      nameInput.addEventListener('change', () => {
        const v = nameInput.value.trim().slice(0, 48);
        if (v) localStorage.setItem(NAME_KEY, v);
      });
    }

    initAgents();
    renderChat();
    updateBusy();

    bindSocket();

    el('mr-send').addEventListener('click', () => sendToTeam(el('mr-text').value));
    el('mr-text').addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        sendToTeam(el('mr-text').value);
      }
    });
    el('mr-clear').addEventListener('click', () => {
      if (history.length && !confirm('Clear AI chat for everyone in this room?')) return;
      if (socket && socket.connected) socket.emit('meeting-clear', { token });
    });

    window.addEventListener('beforeunload', () => {
      try {
        if (socket && socket.connected) socket.emit('leave-meeting', { token });
      } catch (_) {}
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = el('mr-mic');
    const alwaysBtn = el('mr-always');
    let debounceTimer = null;
    let recAlways = null;
    let alwaysOn = false;

    function setMicEnabled(on) {
      if (mic) {
        mic.disabled = !on;
        mic.style.opacity = on ? '1' : '0.45';
      }
    }

    function stopAlwaysListen() {
      alwaysOn = false;
      if (alwaysBtn) {
        alwaysBtn.classList.remove('on');
        alwaysBtn.textContent = '🎧 Always listen';
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      if (recAlways) {
        try {
          recAlways.stop();
        } catch (_) {}
      }
      setMicEnabled(!!SpeechRecognition);
    }

    function startAlwaysListen() {
      if (!SpeechRecognition) return;
      alwaysOn = true;
      if (alwaysBtn) {
        alwaysBtn.classList.add('on');
        alwaysBtn.textContent = '🎧 Listening…';
      }
      setMicEnabled(false);
      recAlways = new SpeechRecognition();
      recAlways.lang = navigator.language || 'en-US';
      recAlways.continuous = true;
      recAlways.interimResults = true;
      recAlways.onresult = ev => {
        let chunk = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) chunk += ev.results[i][0].transcript;
        }
        const t = chunk.trim();
        if (!t) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          sendToTeam(t);
        }, 1400);
      };
      recAlways.onerror = () => {
        if (alwaysOn) {
          try {
            recAlways.start();
          } catch (_) {}
        }
      };
      try {
        recAlways.start();
      } catch (_) {}
    }

    if (!SpeechRecognition) {
      mic.disabled = true;
      mic.title = 'Speech recognition not supported in this browser';
      if (alwaysBtn) alwaysBtn.disabled = true;
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = false;

    mic.addEventListener('mousedown', e => {
      if (alwaysOn) return;
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
      if (alwaysOn) return;
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

    if (alwaysBtn) {
      alwaysBtn.addEventListener('click', () => {
        if (alwaysOn) {
          stopAlwaysListen();
        } else {
          startAlwaysListen();
        }
      });
    }
  }

  boot();
})();
