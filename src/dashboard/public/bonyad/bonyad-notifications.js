/**
 * Bonyad Notification Bell — shared across all Bonyad pages.
 * Include at the bottom of every Bonyad HTML page after socket.io.
 * Clean professional design — no emoji, SVG icons only.
 */
(function () {
  'use strict';

  function getKey() { return localStorage.getItem('bonyad_edit_key') || ''; }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  // Action → { color, label }
  const ACTION_META = {
    'issue.created':           { color: '#ff6b1a', label: 'Created'     },
    'issue.updated':           { color: '#a8a8b3', label: 'Updated'     },
    'issue.deleted':           { color: '#f87171', label: 'Deleted'     },
    'issue.status.done':       { color: '#2ee6b8', label: 'Done'        },
    'issue.status.in_progress':{ color: '#5eb3ff', label: 'In Progress' },
    'issue.status.open':       { color: '#a8a8b3', label: 'Reopened'    },
    'issue.media.added':       { color: '#ff6b1a', label: 'Attachment'  },
    'issue.media.deleted':     { color: '#f87171', label: 'Attachment'  },
    'sheet.created':           { color: '#ff6b1a', label: 'Sheet'       },
    'sheet.deleted':           { color: '#f87171', label: 'Sheet'       },
    'build.uploaded':          { color: '#a78bfa', label: 'Build'       },
    'build.deleted':           { color: '#f87171', label: 'Build'       },
    'design.added':            { color: '#fb923c', label: 'Design'      },
    'design.deleted':          { color: '#f87171', label: 'Design'      },
  };

  const SVG_BELL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const SVG_X    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const SVG_ARR  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

  let notifications = [];
  let unreadCount   = 0;
  let panelOpen     = false;

  /* ── Styles ─────────────────────────────────────────────────── */
  const CSS = `
    #bn-bell-wrap {
      position: fixed; top: 20px; right: 24px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-end;
    }
    #bn-bell-btn {
      width: 40px; height: 40px; border-radius: 10px;
      background: rgba(18, 16, 22, 0.95);
      border: 1px solid #2e2e3a;
      color: #a8a8b3; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      position: relative;
      transition: border-color .18s, color .18s, background .18s;
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      box-shadow: 0 4px 20px rgba(0,0,0,.4);
    }
    #bn-bell-btn:hover { border-color: #ff6b1a; color: #ff6b1a; background: rgba(255,107,26,.08); }
    #bn-badge {
      position: absolute; top: -5px; right: -5px;
      min-width: 17px; height: 17px; background: #f87171;
      border-radius: 9px; font-size: 9px; font-weight: 700;
      color: #fff; display: flex; align-items: center; justify-content: center;
      padding: 0 4px; border: 2px solid #08070b; pointer-events: none;
      font-family: 'IBM Plex Mono', monospace;
    }
    #bn-badge.hidden { display: none; }
    #bn-panel {
      margin-top: 8px;
      width: min(360px, calc(100vw - 40px));
      background: #0f0d14;
      border: 1px solid #2e2e3a;
      border-radius: 14px;
      box-shadow: 0 24px 64px rgba(0,0,0,.7), 0 0 0 1px rgba(255,107,26,.06);
      overflow: hidden; display: none; flex-direction: column;
      max-height: min(500px, 80vh);
      animation: bnIn .16s ease both;
    }
    @keyframes bnIn {
      from { opacity: 0; transform: translateY(-6px) scale(.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    #bn-panel.open { display: flex; }
    .bn-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 13px 16px 11px;
      border-bottom: 1px solid #1e1c26; flex-shrink: 0;
    }
    .bn-head-title {
      font-size: 12px; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; color: #f4f4f8;
      font-family: 'IBM Plex Mono', monospace;
    }
    .bn-mark-all {
      font-size: 11px; color: #ff6b1a; cursor: pointer; background: none;
      border: none; padding: 4px 8px; border-radius: 6px; transition: background .15s;
      font-family: inherit;
    }
    .bn-mark-all:hover { background: rgba(255,107,26,.1); }
    #bn-list { overflow-y: auto; flex: 1; }
    .bn-item {
      display: flex; gap: 10px; padding: 11px 14px;
      cursor: pointer; transition: background .12s;
      text-decoration: none; color: inherit;
      border-left: 2px solid transparent; position: relative;
    }
    .bn-item:hover { background: rgba(255,255,255,.025); }
    .bn-item.unread { border-left-color: #ff6b1a; }
    .bn-dot {
      width: 6px; height: 6px; border-radius: 50%;
      flex-shrink: 0; margin-top: 6px;
    }
    .bn-body { flex: 1; min-width: 0; }
    .bn-title {
      font-size: 12px; font-weight: 600; color: #f4f4f8;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bn-msg {
      font-size: 11px; color: #71717f; margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      font-family: 'IBM Plex Mono', monospace;
    }
    .bn-meta { display: flex; gap: 8px; margin-top: 5px; align-items: center; }
    .bn-type-pill {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .07em; padding: 2px 6px; border-radius: 4px;
      font-family: 'IBM Plex Mono', monospace;
    }
    .bn-sheet { font-size: 10px; color: #71717f; font-family: 'IBM Plex Mono', monospace; }
    .bn-time  { font-size: 10px; color: #4a4a58; margin-left: auto; }
    .bn-arr   { color: #3d3d4c; flex-shrink: 0; align-self: center; }
    .bn-empty { text-align: center; padding: 36px 20px; color: #4a4a58; font-size: 12px; }
    /* Toasts */
    #bn-toasts {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      display: flex; flex-direction: column-reverse; gap: 8px; pointer-events: none;
    }
    .bn-toast {
      min-width: 270px; max-width: min(360px, calc(100vw - 48px));
      background: #0f0d14; border: 1px solid #2e2e3a;
      border-radius: 12px; padding: 12px 14px;
      display: flex; gap: 10px; align-items: flex-start;
      box-shadow: 0 8px 32px rgba(0,0,0,.6);
      pointer-events: all; cursor: pointer;
      animation: bnToastIn .22s ease both; border-left-width: 3px;
      transition: opacity .3s, transform .3s;
      position: relative; overflow: hidden;
    }
    .bn-toast.hiding { opacity: 0; transform: translateX(20px); }
    @keyframes bnToastIn {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .bn-toast-indicator {
      width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .bn-toast-body { flex: 1; min-width: 0; }
    .bn-toast-title { font-size: 12px; font-weight: 700; color: #f4f4f8; }
    .bn-toast-msg { font-size: 11px; color: #71717f; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'IBM Plex Mono', monospace; }
    .bn-toast-bar {
      position: absolute; bottom: 0; left: 0; height: 2px;
      animation: bnBar 5s linear forwards;
    }
    @keyframes bnBar { from { width: 100%; } to { width: 0; } }
    @media (max-width: 480px) {
      #bn-bell-wrap { top: 14px; right: 14px; }
      #bn-panel { width: calc(100vw - 28px); }
    }
  `;

  function injectStyles() {
    if (document.getElementById('bn-styles')) return;
    const s = document.createElement('style');
    s.id = 'bn-styles'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildDOM() {
    if (document.getElementById('bn-bell-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'bn-bell-wrap';
    wrap.innerHTML = `
      <button id="bn-bell-btn" title="Notifications" aria-label="Notifications" aria-haspopup="true">
        ${SVG_BELL}
        <span id="bn-badge" class="hidden">0</span>
      </button>
      <div id="bn-panel" role="dialog" aria-label="Notifications">
        <div class="bn-head">
          <span class="bn-head-title">Notifications</span>
          <button class="bn-mark-all" id="bn-mark-all">Mark all read</button>
        </div>
        <div id="bn-list"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    const toasts = document.createElement('div');
    toasts.id = 'bn-toasts';
    document.body.appendChild(toasts);

    document.getElementById('bn-bell-btn').addEventListener('click', togglePanel);
    document.getElementById('bn-mark-all').addEventListener('click', markAllRead);
    document.addEventListener('click', e => {
      if (panelOpen && !wrap.contains(e.target)) closePanel();
    });
  }

  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  function openPanel() {
    panelOpen = true;
    document.getElementById('bn-panel').classList.add('open');
    document.getElementById('bn-bell-btn').setAttribute('aria-expanded', 'true');
    renderList();
  }

  function closePanel() {
    panelOpen = false;
    document.getElementById('bn-panel').classList.remove('open');
    document.getElementById('bn-bell-btn').setAttribute('aria-expanded', 'false');
  }

  function renderList() {
    const list = document.getElementById('bn-list');
    if (!notifications.length) {
      list.innerHTML = '<div class="bn-empty">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifications.map(n => {
      const meta    = ACTION_META[n.type] || { color: '#a8a8b3', label: n.type || 'Update' };
      const sheet   = n.sheetSlug || n.sheet_slug || '';
      const unread  = !n.is_read;
      const url     = n.navigateTo || '/bonyad/';
      return `
        <a class="bn-item${unread ? ' unread' : ''}" href="${url}" data-id="${n.id}">
          <span class="bn-dot" style="background:${meta.color}"></span>
          <div class="bn-body">
            <div class="bn-title">${esc(n.title || '')}</div>
            ${n.message ? `<div class="bn-msg">${esc(n.message)}</div>` : ''}
            <div class="bn-meta">
              <span class="bn-type-pill" style="background:${meta.color}1a;color:${meta.color}">${meta.label}</span>
              ${sheet ? `<span class="bn-sheet">${esc(sheet)}</span>` : ''}
              <span class="bn-time">${timeAgo(n.createdAt || n.created_at)}</span>
            </div>
          </div>
          <span class="bn-arr">${SVG_ARR}</span>
        </a>`;
    }).join('');
  }

  function updateBadge() {
    const badge = document.getElementById('bn-badge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  async function markAllRead() {
    const key = getKey();
    try {
      await fetch('/api/bonyad/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': key },
        body: JSON.stringify({ editKey: key }),
      });
      notifications.forEach(n => { n.is_read = true; });
      unreadCount = 0;
      updateBadge();
      renderList();
    } catch {}
  }

  function showToast(n) {
    const container = document.getElementById('bn-toasts');
    if (!container) return;
    const meta  = ACTION_META[n.type] || { color: '#a8a8b3', label: 'Update' };
    const el    = document.createElement('div');
    el.className = 'bn-toast';
    el.style.borderLeftColor = meta.color;
    el.innerHTML = `
      <div class="bn-toast-indicator" style="background:${meta.color}1a;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${meta.color}" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/></svg>
      </div>
      <div class="bn-toast-body">
        <div class="bn-toast-title">${esc(n.title || '')}</div>
        ${n.message ? `<div class="bn-toast-msg">${esc(n.message)}</div>` : ''}
      </div>
      <div class="bn-toast-bar" style="background:${meta.color}"></div>
    `;
    el.addEventListener('click', () => { if (n.navigateTo) window.location.href = n.navigateTo; });
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 350);
    }, 5000);
  }

  async function loadHistory() {
    try {
      const res  = await fetch('/api/bonyad/notifications?limit=30');
      const data = await res.json();
      if (data.success) {
        notifications = data.notifications || [];
        unreadCount   = notifications.filter(n => !n.is_read).length;
        updateBadge();
        if (panelOpen) renderList();
      }
    } catch {}
  }

  function connectSocket() {
    if (typeof io === 'undefined') return;
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect', () => socket.emit('bonyad:join'));
    socket.on('bonyad:notification', n => {
      notifications.unshift({ ...n, is_read: false });
      if (notifications.length > 50) notifications.pop();
      unreadCount++;
      updateBadge();
      if (panelOpen) renderList();
      showToast(n);
    });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function boot() {
    injectStyles(); buildDOM(); loadHistory(); connectSocket();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
