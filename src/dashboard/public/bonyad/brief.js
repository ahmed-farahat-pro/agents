(function () {
  const params = new URLSearchParams(location.search);
  const slug =
    params.get('slug') ||
    (typeof window.BONYAD_PRESET_SLUG === 'string' ? window.BONYAD_PRESET_SLUG : null);
  const API = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var BONYAD_IMG_SEQ = 0;
  window._bonyadImgStore = window._bonyadImgStore || {};
  window._bonyadImgFail = function (sid, img) {
    var store = window._bonyadImgStore;
    if (!store || !store[sid]) return;
    var arr = store[sid];
    var i = parseInt(img.getAttribute('data-cand-idx') || '0', 10) + 1;
    img.setAttribute('data-cand-idx', String(i));
    if (i < arr.length) {
      img.src = arr[i];
    } else {
      var w = img.closest('.issue-media-img-wrap');
      if (w) w.classList.add('issue-media-broken');
      img.removeAttribute('src');
      img.alt = '';
    }
  };

  function extractGoogleDriveFileId(u) {
    try {
      var s = String(u);
      var m1 = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(s);
      if (m1) return m1[1];
      var m2 = /\/open\?[^#]*\bid=([a-zA-Z0-9_-]+)/.exec(s);
      if (m2 && /google\.com/i.test(s)) return m2[1];
      var m3 = /[?&]id=([a-zA-Z0-9_-]+)/.exec(s);
      if (m3 && /google\.com/i.test(s)) return m3[1];
    } catch (e) {}
    return null;
  }

  function imageDisplayCandidates(originalUrl) {
    var u = String(originalUrl || '').trim();
    if (!u) return [];
    var list = [];
    var gid = extractGoogleDriveFileId(u);
    if (gid) {
      list.push('https://drive.google.com/thumbnail?id=' + gid + '&sz=w1200');
      list.push('https://drive.google.com/uc?export=view&id=' + gid);
      list.push(u);
    } else if (/dropbox\.com/i.test(u) && /[?&]dl=0(?:&|$)/.test(u)) {
      list.push(u.replace(/dl=0/, 'raw=1'));
      list.push(u);
    } else {
      list.push(u);
    }
    var seen = {};
    return list.filter(function (x) {
      if (seen[x]) return false;
      seen[x] = true;
      return true;
    });
  }

  function registerImageCandidates(cands) {
    var sid = 'm' + ++BONYAD_IMG_SEQ;
    window._bonyadImgStore[sid] = cands;
    return sid;
  }

  function buildIssueMediaImgTag(hrefOriginal) {
    var cands = imageDisplayCandidates(hrefOriginal);
    if (!cands.length) return '';
    var sid = registerImageCandidates(cands);
    return (
      '<img src="' +
      esc(cands[0]) +
      '" alt="" loading="lazy" referrerpolicy="no-referrer" data-cand-idx="0" onerror="window._bonyadImgFail(\'' +
      sid +
      "',this)\" />"
    );
  }

  var SELECT_PILL_CHECK =
    '<span class="issue-select-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="issue-select-check-path" d="M5.5 12.5l4 4 9-10"/></svg></span>';

  function getEditKey() {
    return localStorage.getItem('bonyad_edit_key') || '';
  }

  function setEditKey(k) {
    if (k) localStorage.setItem('bonyad_edit_key', k);
    else localStorage.removeItem('bonyad_edit_key');
  }

  function fetchJson(url, init) {
    return fetch(url, init || {}).then(function (r) {
      return r.text().then(function (text) {
        let j = {};
        try {
          j = text ? JSON.parse(text) : {};
        } catch (e) {
          j = {};
        }
        if (!r.ok) {
          const err =
            (j && j.error) ||
            (text && text.length < 500 ? text : '') ||
            'Request failed (HTTP ' + r.status + ')';
          throw new Error(typeof err === 'string' ? err : 'Request failed');
        }
        return j;
      });
    });
  }

  let bonyadFlashTimer = null;
  function showBonyadFlash(message, kind) {
    kind = kind || 'info';
    const el = document.getElementById('bonyad-flash');
    if (!el) return;
    const t = el.querySelector('.bonyad-flash-text');
    if (t) t.textContent = message;
    el.setAttribute('data-kind', kind);
    el.classList.add('is-visible');
    if (bonyadFlashTimer) clearTimeout(bonyadFlashTimer);
    bonyadFlashTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, 3000);
  }

  function closeBonyadModal() {
    const root = document.getElementById('bonyad-modal');
    if (!root) return;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function showBonyadAlert(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const root = document.getElementById('bonyad-modal');
      if (!root) {
        window.alert(message);
        resolve();
        return;
      }
      const titleEl = document.getElementById('bonyad-modal-title');
      const bodyEl = document.getElementById('bonyad-modal-body');
      const cancelBtn = document.getElementById('bonyad-modal-btn-cancel');
      const primaryBtn = document.getElementById('bonyad-modal-btn-primary');
      const scrim = root.querySelector('.bonyad-modal-scrim');
      if (titleEl) titleEl.textContent = opts.title || 'Bonyad';
      if (bodyEl) bodyEl.textContent = message;
      root.setAttribute('data-variant', opts.variant || 'info');
      cancelBtn.style.display = 'none';
      primaryBtn.textContent = opts.okText || 'OK';
      function cleanup() {
        document.removeEventListener('keydown', onKey);
        if (scrim) scrim.removeEventListener('click', onBackdrop);
        primaryBtn.removeEventListener('click', onPrimary);
        closeBonyadModal();
        resolve();
      }
      function onKey(e) {
        if (e.key === 'Escape') cleanup();
      }
      function onBackdrop(e) {
        if (e.target === scrim) cleanup();
      }
      function onPrimary() {
        cleanup();
      }
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      if (scrim) scrim.addEventListener('click', onBackdrop);
      primaryBtn.addEventListener('click', onPrimary);
      primaryBtn.focus();
    });
  }

  function showBonyadConfirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const root = document.getElementById('bonyad-modal');
      if (!root) {
        resolve(window.confirm(message));
        return;
      }
      const titleEl = document.getElementById('bonyad-modal-title');
      const bodyEl = document.getElementById('bonyad-modal-body');
      const cancelBtn = document.getElementById('bonyad-modal-btn-cancel');
      const primaryBtn = document.getElementById('bonyad-modal-btn-primary');
      const scrim = root.querySelector('.bonyad-modal-scrim');
      if (titleEl) titleEl.textContent = opts.title || 'Confirm';
      if (bodyEl) bodyEl.textContent = message;
      root.setAttribute('data-variant', opts.danger ? 'danger' : 'neutral');
      cancelBtn.style.display = '';
      cancelBtn.textContent = opts.cancelText || 'Cancel';
      primaryBtn.textContent = opts.confirmText || 'Confirm';
      let settled = false;
      function finish(val) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        if (scrim) scrim.removeEventListener('click', onBackdrop);
        cancelBtn.removeEventListener('click', onCancel);
        primaryBtn.removeEventListener('click', onConfirm);
        closeBonyadModal();
        resolve(val);
      }
      function onKey(e) {
        if (e.key === 'Escape') finish(false);
      }
      function onBackdrop(e) {
        if (e.target === scrim) finish(false);
      }
      function onCancel() {
        finish(false);
      }
      function onConfirm() {
        finish(true);
      }
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
      if (scrim) scrim.addEventListener('click', onBackdrop);
      cancelBtn.addEventListener('click', onCancel);
      primaryBtn.addEventListener('click', onConfirm);
      primaryBtn.focus();
    });
  }

  function priorityClass(p) {
    if (p === 'high') return 'priority-high';
    if (p === 'low') return 'priority-low';
    return 'priority-medium';
  }

  function tagClass(p) {
    if (p === 'high') return 't-red';
    if (p === 'low') return 't-blue';
    return 't-orange';
  }

  function priorityLabel(p) {
    if (p === 'high') return 'High Priority';
    if (p === 'low') return 'Low Priority';
    return 'Medium Priority';
  }

  function linkifyPlainUrls(text) {
    if (text == null || String(text).trim() === '') return '';
    const str = String(text);
    const re = /https?:\/\/[^\s<>"',;]+/gi;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(str)) !== null) {
      out += esc(str.slice(last, m.index));
      let url = m[0];
      const trail = url.match(/[.,;]+$/);
      if (trail) {
        url = url.slice(0, -trail[0].length);
      }
      const short = url.length > 52 ? url.slice(0, 50) + '…' : url;
      out +=
        '<a href="' +
        esc(url) +
        '" target="_blank" rel="noopener noreferrer" class="issue-attachment-link">' +
        esc(short) +
        '</a>';
      last = m.index + m[0].length;
    }
    out += esc(str.slice(last));
    return out;
  }

  function mediaAbsoluteUrl(href) {
    var s = String(href || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (typeof window === 'undefined' || !window.location) return s;
    if (s.startsWith('//')) return window.location.protocol + s;
    if (s.startsWith('/')) return window.location.origin + s;
    return s;
  }

  function issueExcelMetaHtml(iss) {
    const bits = [];
    if (iss.module) bits.push('<span class="tag t-gray">Module: ' + esc(iss.module) + '</span>');
    if (iss.issue_type) bits.push('<span class="tag t-gray">Type: ' + esc(iss.issue_type) + '</span>');
    if (iss.sheet_status) bits.push('<span class="tag t-gray">Sheet status: ' + esc(iss.sheet_status) + '</span>');
    if (iss.attachments) {
      bits.push(
        '<span class="tag t-gray issue-attach-tag">Attachments: <span class="issue-attach-links">' +
          linkifyPlainUrls(iss.attachments) +
          '</span></span>'
      );
    }
    if (!bits.length) return '';
    return '<div class="issue-excel-meta">' + bits.join('') + '</div>';
  }

  function issueMediaHtml(iss) {
    const items = iss.issue_media || [];
    const k = getEditKey();
    const has = items.length > 0;
    if (!has && !k) {
      return '';
    }
    let h = '<div class="issue-media">';
    h += '<p class="issue-media-label">Screenshots &amp; images</p>';
    if (has) {
      h += '<div class="issue-media-grid">';
      items.forEach(function (m) {
        const src = m.kind === 'url' ? m.url : m.path;
        const hrefOpen = mediaAbsoluteUrl(src);
        const cap =
          m.kind === 'url'
            ? '<a href="' +
              esc(src) +
              '" target="_blank" rel="noopener noreferrer" class="issue-media-url-cap">' +
              esc(src.length > 44 ? src.slice(0, 42) + '…' : src) +
              '</a>'
            : '<a href="' +
              esc(hrefOpen) +
              '" target="_blank" rel="noopener noreferrer" class="issue-media-url-cap">' +
              esc(hrefOpen.length > 52 ? hrefOpen.slice(0, 50) + '…' : hrefOpen) +
              '</a>' +
              (m.name
                ? ' <span class="issue-media-upload-name" style="color:var(--text-muted);font-size:12px;">(' +
                  esc(m.name) +
                  ')</span>'
                : '');
        h +=
          '<figure class="issue-media-item">' +
          (k
            ? '<button type="button" class="issue-media-remove" data-act="rm-media" data-issue="' +
              iss.id +
              '" data-media="' +
              esc(m.id) +
              '" title="Remove">×</button>'
            : '') +
          '<a href="' +
          esc(hrefOpen) +
          '" target="_blank" rel="noopener noreferrer" class="issue-media-img-wrap">' +
          buildIssueMediaImgTag(src) +
          '</a>' +
          '<figcaption>' +
          cap +
          '</figcaption></figure>';
      });
      h += '</div>';
    }
    if (k) {
      h += '<div class="issue-media-add">';
      h +=
        '<p class="issue-media-add-hint">Add more screenshots anytime — paste a link (Google Drive sharing links work; preview may fall back to “open link”) or upload additional files.</p>';
      h +=
        '<div class="form-group"><label>Image URL</label><div class="media-inline">' +
        '<input type="url" class="media-url-in" data-issue="' +
        iss.id +
        '" placeholder="https://drive.google.com/… or direct image URL" />' +
        '<button type="button" class="btn-submit" data-act="add-media-url" data-issue="' +
        iss.id +
        '">Add URL</button></div></div>';
      h +=
        '<div class="form-group"><label>Upload more images</label><div class="media-inline">' +
        '<input type="file" class="media-files" data-issue="' +
        iss.id +
        '" accept="image/jpeg,image/png,image/gif,image/webp" multiple />' +
        '<button type="button" class="btn-submit" data-act="upload-media" data-issue="' +
        iss.id +
        '">Choose files</button></div></div>';
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  let state = { sheet: null, issues: [] };

  var ADD_SECTION_HTML =
    '<div class="add-section" id="addSection">' +
    '<h3>Add a New Issue</h3>' +
    '<p>Requires edit key (set above). Stored in the Nigents MySQL database.</p>' +
    '<button type="button" class="add-btn" data-act="show-form">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Add Issue</button>' +
    '<div class="add-form" id="addForm">' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Issue Title</label><input type="text" id="newTitle" placeholder="Short title" /></div>' +
    '<div class="form-group"><label>Priority</label><select id="newPriority"><option value="high">High</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div></div>' +
    '<div class="form-group" style="margin-bottom:14px;"><label>Tags (comma-separated)</label><input type="text" id="newTags" placeholder="Navigation, UX" /></div>' +
    '<div class="form-group" style="margin-bottom:14px;"><label>Developer Prompt</label><textarea id="newPrompt" placeholder="TASK, requirements, acceptance…"></textarea></div>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn-cancel" data-act="hide-form">Cancel</button>' +
    '<button type="button" class="btn-submit" data-act="submit-issue">Add Issue</button></div></div></div>';

  function render() {
    const root = document.getElementById('brief-root');
    if (!root) return;
    if (!state.sheet) {
      root.innerHTML = '<p class="load-err">No sheet data.</p>';
      return;
    }
    const sh = state.sheet;
    const issues = state.issues;
    const total = issues.length;
    const done = issues.filter(function (i) {
      return i.is_done;
    }).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    const high = issues.filter(function (i) {
      return i.priority === 'high';
    }).length;
    const med = issues.filter(function (i) {
      return i.priority === 'medium';
    }).length;

    let cardsHtml = '';
    issues.forEach(function (iss, idx) {
      const n = idx + 1;
      const pri = iss.priority || 'medium';
      const openClass = iss.is_done ? '' : '';
      const doneClass = iss.is_done ? ' done-card' : '';
      const toggleClass = iss.is_done ? 'is-done' : 'not-done';
      const toggleLabel = iss.is_done ? 'Done' : 'Mark Done';
      const tags =
        '<span class="tag ' +
        tagClass(pri) +
        '">' +
        esc(priorityLabel(pri)) +
        '</span>' +
        (iss.tags || [])
          .map(function (t) {
            return '<span class="tag t-gray">' + esc(t) + '</span>';
          })
          .join('');
      const crit = (iss.criteria || [])
        .map(function (c) {
          return '<li>' + esc(c) + '</li>';
        })
        .join('');
      cardsHtml +=
        '<div class="issue-card ' +
        priorityClass(pri) +
        doneClass +
        '" id="card-' +
        iss.id +
        '" data-id="' +
        iss.id +
        '">' +
        '<div class="issue-header" data-act="toggle" data-id="' +
        iss.id +
        '">' +
        (getEditKey()
          ? '<div class="issue-select-wrap" title="Select for bulk delete">' +
            '<label class="issue-select-pill">' +
            '<input type="checkbox" class="issue-select-cb bonyad-sr-only" data-issue-id="' +
            iss.id +
            '" aria-label="Select issue #' +
            n +
            ' for bulk delete" />' +
            '<span class="issue-select-ring" aria-hidden="true"></span>' +
            SELECT_PILL_CHECK +
            '</label></div>'
          : '') +
        '<div class="issue-number">#' +
        n +
        '</div>' +
        '<div class="issue-title-block">' +
        '<div class="issue-title">' +
        esc(iss.title) +
        '</div>' +
        '<div class="issue-tags">' +
        tags +
        '</div>' +
        issueExcelMetaHtml(iss) +
        '</div>' +
        '<div class="issue-header-right">' +
        '<div class="status-toggle ' +
        toggleClass +
        '" data-act="done" data-id="' +
        iss.id +
        '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg> ' +
        esc(toggleLabel) +
        '</div>' +
        '<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
        '</div></div>' +
        '<div class="issue-body"><div class="issue-body-inner">' +
        '<div class="prompt-label"><span>Developer Prompt</span>' +
        '<button type="button" class="copy-btn" data-act="copy" data-id="' +
        iss.id +
        '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy Prompt</button></div>' +
        '<div class="prompt-box" id="prompt-' +
        iss.id +
        '">' +
        esc(iss.prompt_text) +
        '</div>' +
        (crit ? '<ul class="criteria-list">' + crit + '</ul>' : '') +
        issueMediaHtml(iss) +
        (getEditKey()
          ? '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-light);">' +
            '<p style="font-size:11px;font-weight:700;color:var(--gray-mid);margin-bottom:8px;">EDIT ISSUE</p>' +
            '<div class="form-row">' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Title</label>' +
            '<input type="text" class="edit-title" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.title).replace(/"/g, '&quot;') +
            '" /></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Priority</label>' +
            '<select class="edit-priority" data-id="' +
            iss.id +
            '">' +
            '<option value="high"' +
            (iss.priority === 'high' ? ' selected' : '') +
            '>High</option>' +
            '<option value="medium"' +
            (iss.priority === 'medium' ? ' selected' : '') +
            '>Medium</option>' +
            '<option value="low"' +
            (iss.priority === 'low' ? ' selected' : '') +
            '>Low</option></select></div></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Module</label>' +
            '<input type="text" class="edit-module" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.module || '').replace(/"/g, '&quot;') +
            '" placeholder="e.g. Technician Onboarding" /></div>' +
            '<div class="form-row">' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Type</label>' +
            '<input type="text" class="edit-issue-type" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.issue_type || '').replace(/"/g, '&quot;') +
            '" placeholder="Bug, Validation…" /></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Sheet status</label>' +
            '<input type="text" class="edit-sheet-status" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.sheet_status || '').replace(/"/g, '&quot;') +
            '" placeholder="open, solved…" /></div></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Attachments (text)</label>' +
            '<input type="text" class="edit-attachments" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.attachments || '').replace(/"/g, '&quot;') +
            '" /></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Tags (comma-separated)</label>' +
            '<input type="text" class="edit-tags" data-id="' +
            iss.id +
            '" value="' +
            esc((iss.tags || []).join(', ')).replace(/"/g, '&quot;') +
            '" /></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Developer prompt</label>' +
            '<textarea class="edit-prompt" data-id="' +
            iss.id +
            '" rows="8">' +
            esc(iss.prompt_text) +
            '</textarea></div>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Criteria (one per line)</label>' +
            '<textarea class="edit-criteria" data-id="' +
            iss.id +
            '" rows="4">' +
            esc((iss.criteria || []).join('\n')) +
            '</textarea></div>' +
            '<button type="button" class="btn-submit" data-act="save-edit" data-id="' +
            iss.id +
            '">Save changes</button> ' +
            '<button type="button" class="btn-cancel" data-act="del" data-id="' +
            iss.id +
            '">Delete issue</button></div>'
          : '') +
        '</div></div></div>';
    });

    root.innerHTML =
      '<div class="progress-section">' +
      '<div class="progress-header"><span>Overall Completion</span>' +
      '<span class="progress-count" id="progressLabel">' +
      done +
      ' of ' +
      total +
      ' done</span></div>' +
      '<div class="progress-track"><div class="progress-fill" id="progressFill" style="width:' +
      pct +
      '%"></div></div></div>' +
      '<div class="summary-row">' +
      '<div class="summary-card all"><div class="num" id="sumTotal">' +
      total +
      '</div><div class="lbl">Total Issues</div></div>' +
      '<div class="summary-card high"><div class="num">' +
      high +
      '</div><div class="lbl">High Priority</div></div>' +
      '<div class="summary-card med"><div class="num">' +
      med +
      '</div><div class="lbl">Medium Priority</div></div>' +
      '<div class="summary-card done"><div class="num" id="sumDone">' +
      done +
      '</div><div class="lbl">Completed</div></div></div>' +
      (getEditKey()
        ? '<div class="bonyad-bulk-bar" id="bonyadBulkBar">' +
          '<label class="bulk-select-all-lbl">' +
          '<span class="issue-select-pill" aria-hidden="true">' +
          '<input type="checkbox" id="bulk-select-all" class="bonyad-sr-only" aria-label="Select all issues" />' +
          '<span class="issue-select-ring"></span>' +
          '<span class="issue-select-dash" aria-hidden="true"></span>' +
          SELECT_PILL_CHECK +
          '</span>' +
          '<span class="bulk-select-text">Select all</span>' +
          '</label>' +
          '<button type="button" class="btn-danger-outline" id="bulk-delete-selected" disabled>Delete selected</button>' +
          '<span class="bulk-selected-count" id="bulk-selected-count"></span>' +
          '</div>'
        : '') +
      '<div class="section-label">Issues &amp; Developer Prompts</div>' +
      cardsHtml +
      ADD_SECTION_HTML +
      (getEditKey()
        ? '<div class="bonyad-sheet-danger">' +
          '<div class="section-label" style="margin-top:8px;">Danger zone</div>' +
          '<p class="danger-hint">Remove every issue on this brief. The sheet itself stays; this cannot be undone.</p>' +
          '<button type="button" class="btn-danger-outline" data-act="delete-all-issues">Delete all issues on this sheet</button>' +
          '</div>'
        : '');

    root.querySelectorAll('.issue-header[data-act="toggle"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-act="done"]')) return;
        if (e.target.closest('.issue-select-wrap') || e.target.closest('.issue-select-pill')) return;
        const id = el.getAttribute('data-id');
        const card = document.getElementById('card-' + id);
        if (card) card.classList.toggle('open');
      });
    });

    function updateBulkBar() {
      const checked = root.querySelectorAll('.issue-select-cb[data-issue-id]:checked');
      const n = checked.length;
      const btn = root.querySelector('#bulk-delete-selected');
      const cnt = root.querySelector('#bulk-selected-count');
      if (btn) btn.disabled = n === 0;
      if (cnt) cnt.textContent = n ? n + ' selected' : '';
    }
    function syncBulkSelectAll() {
      const all = root.querySelectorAll('.issue-select-cb[data-issue-id]');
      const on = root.querySelectorAll('.issue-select-cb[data-issue-id]:checked');
      const master = root.querySelector('#bulk-select-all');
      const lbl = root.querySelector('.bulk-select-all-lbl');
      if (!master || !all.length) return;
      master.checked = on.length === all.length && all.length > 0;
      master.indeterminate = on.length > 0 && on.length < all.length;
      if (lbl) lbl.classList.toggle('bulk-partial', !!master.indeterminate);
    }
    const bulkMaster = root.querySelector('#bulk-select-all');
    if (bulkMaster) {
      bulkMaster.addEventListener('change', function () {
        root.querySelectorAll('.issue-select-cb[data-issue-id]').forEach(function (cb) {
          cb.checked = bulkMaster.checked;
        });
        updateBulkBar();
        syncBulkSelectAll();
      });
    }
    root.querySelectorAll('.issue-select-cb[data-issue-id]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        updateBulkBar();
        syncBulkSelectAll();
      });
    });
    const bulkDelBtn = root.querySelector('#bulk-delete-selected');
    if (bulkDelBtn) {
      bulkDelBtn.addEventListener('click', function () {
        const ids = Array.prototype.map
          .call(root.querySelectorAll('.issue-select-cb[data-issue-id]:checked'), function (c) {
            return Number(c.getAttribute('data-issue-id'));
          })
          .filter(function (id) {
            return !Number.isNaN(id);
          });
        if (!ids.length) return;
        showBonyadConfirm('Delete ' + ids.length + ' selected issue(s)? This cannot be undone.', {
          title: 'Delete selected',
          danger: true,
          confirmText: 'Delete',
        }).then(function (ok) {
          if (ok) batchDeleteIssues(ids);
        });
      });
    }
    root.querySelectorAll('[data-act="done"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = Number(el.getAttribute('data-id'));
        const iss = issues.find(function (x) {
          return x.id === id;
        });
        if (!iss) return;
        patchIssue(id, { is_done: !iss.is_done });
      });
    });
    root.querySelectorAll('[data-act="copy"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = el.getAttribute('data-id');
        const box = document.getElementById('prompt-' + id);
        const text = box ? box.textContent : '';
        navigator.clipboard.writeText(text).then(
          function () {
            showBonyadFlash('Prompt copied', 'success');
          },
          function () {
            showBonyadFlash('Copy failed', 'error');
          }
        );
      });
    });
    root.querySelectorAll('[data-act="del"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = Number(el.getAttribute('data-id'));
        showBonyadConfirm('Delete this issue? This cannot be undone.', {
          title: 'Delete issue',
          danger: true,
          confirmText: 'Delete',
        }).then(function (ok) {
          if (ok) deleteIssue(id);
        });
      });
    });
    root.querySelectorAll('[data-act="save-edit"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = Number(el.getAttribute('data-id'));
        const title = root.querySelector('.edit-title[data-id="' + id + '"]').value.trim();
        const priority = root.querySelector('.edit-priority[data-id="' + id + '"]').value;
        const prompt = root.querySelector('.edit-prompt[data-id="' + id + '"]').value.trim();
        const tagsRaw = root.querySelector('.edit-tags[data-id="' + id + '"]').value.trim();
        const critRaw = root.querySelector('.edit-criteria[data-id="' + id + '"]').value;
        const moduleVal = root.querySelector('.edit-module[data-id="' + id + '"]').value.trim();
        const issueTypeVal = root.querySelector('.edit-issue-type[data-id="' + id + '"]').value.trim();
        const sheetStatusVal = root.querySelector('.edit-sheet-status[data-id="' + id + '"]').value.trim();
        const attachmentsVal = root.querySelector('.edit-attachments[data-id="' + id + '"]').value.trim();
        if (!title || !prompt) {
          showBonyadFlash('Title and prompt required', 'warn');
          return;
        }
        const tags = tagsRaw
          ? tagsRaw.split(',').map(function (t) {
              return t.trim();
            }).filter(Boolean)
          : [];
        const criteria = critRaw
          ? critRaw.split('\n').map(function (l) {
              return l.trim();
            }).filter(Boolean)
          : [];
        patchIssue(id, {
          title: title,
          priority: priority,
          prompt_text: prompt,
          tags: tags,
          criteria: criteria,
          module: moduleVal || null,
          issue_type: issueTypeVal || null,
          sheet_status: sheetStatusVal || null,
          attachments: attachmentsVal || null,
        });
      });
    });

    const delAll = root.querySelector('[data-act="delete-all-issues"]');
    if (delAll) {
      delAll.addEventListener('click', function () {
        if (!getEditKey()) {
          showBonyadAlert('Save your edit key above before deleting issues.', {
            title: 'Edit key required',
            variant: 'error',
          });
          return;
        }
        showBonyadConfirm('Delete ALL issues on this sheet? This cannot be undone.', {
          title: 'Delete all issues',
          danger: true,
          confirmText: 'Continue',
        }).then(function (ok1) {
          if (!ok1) return;
          showBonyadConfirm('Remove every issue from this brief? This is your last confirmation.', {
            title: 'Final confirmation',
            danger: true,
            confirmText: 'Delete all',
          }).then(function (ok2) {
            if (ok2) deleteAllIssuesOnSheet();
          });
        });
      });
    }

    root.querySelectorAll('[data-act="rm-media"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const issueId = Number(el.getAttribute('data-issue'));
        const mid = el.getAttribute('data-media');
        showBonyadConfirm('Remove this image from the issue?', {
          title: 'Remove image',
          danger: true,
          confirmText: 'Remove',
        }).then(function (ok) {
          if (ok) removeIssueMedia(issueId, mid);
        });
      });
    });
    root.querySelectorAll('[data-act="add-media-url"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        const issueId = Number(el.getAttribute('data-issue'));
        const inp = root.querySelector('.media-url-in[data-issue="' + issueId + '"]');
        const u = inp && inp.value.trim();
        if (!u) {
          showBonyadFlash('Enter a URL', 'warn');
          return;
        }
        addIssueMediaUrl(issueId, u);
      });
    });
    root.querySelectorAll('[data-act="upload-media"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        const issueId = Number(el.getAttribute('data-issue'));
        const inp = root.querySelector('.media-files[data-issue="' + issueId + '"]');
        if (!inp || !inp.files || !inp.files.length) {
          showBonyadFlash('Choose one or more images', 'warn');
          return;
        }
        uploadIssueMedia(issueId, inp.files);
      });
    });

    const addBtn = root.querySelector('[data-act="show-form"]');
    const addForm = root.querySelector('#addForm');
    if (addBtn && addForm) {
      addBtn.addEventListener('click', function () {
        if (!getEditKey()) {
          showBonyadAlert('Save your edit key above before adding issues.', {
            title: 'Edit key required',
            variant: 'error',
          });
          return;
        }
        addForm.classList.add('visible');
        addBtn.style.display = 'none';
      });
    }
    const cancelBtn = root.querySelector('[data-act="hide-form"]');
    if (cancelBtn && addForm && addBtn) {
      cancelBtn.addEventListener('click', function () {
        addForm.classList.remove('visible');
        addBtn.style.display = 'inline-flex';
      });
    }
    const submitBtn = root.querySelector('[data-act="submit-issue"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', submitNewIssue);
    }
  }

  function patchIssue(id, body) {
    const k = getEditKey();
    fetchJson(API + '/api/bonyad/issues/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify(Object.assign({ editKey: k }, body)),
    })
      .then(function () {
        showBonyadFlash('Saved', 'success');
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Update failed', { title: 'Could not save', variant: 'error' });
      });
  }

  function deleteIssue(id) {
    const k = getEditKey();
    fetchJson(API + '/api/bonyad/issues/' + id + '?editKey=' + encodeURIComponent(k), {
      method: 'DELETE',
      headers: { 'x-bonyad-edit-key': k },
    })
      .then(function () {
        showBonyadFlash('Issue deleted', 'success');
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Delete failed', { title: 'Delete failed', variant: 'error' });
      });
  }

  function deleteAllIssuesOnSheet() {
    const k = getEditKey();
    fetchJson(API + '/api/bonyad/sheets/' + encodeURIComponent(slug) + '/issues?editKey=' + encodeURIComponent(k), {
      method: 'DELETE',
      headers: { 'x-bonyad-edit-key': k },
    })
      .then(function (j) {
        showBonyadFlash('Deleted ' + (j.deleted != null ? j.deleted : '') + ' issue(s)', 'success');
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Delete all failed', { title: 'Delete all failed', variant: 'error' });
      });
  }

  function batchDeleteIssues(ids) {
    const k = getEditKey();
    fetchJson(API + '/api/bonyad/sheets/' + encodeURIComponent(slug) + '/issues/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({ ids: ids, editKey: k }),
    })
      .then(function (j) {
        showBonyadFlash('Deleted ' + (j.deleted != null ? j.deleted : ids.length) + ' issue(s)', 'success');
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Bulk delete failed', { title: 'Bulk delete failed', variant: 'error' });
      });
  }

  function removeIssueMedia(issueId, mediaId) {
    const k = getEditKey();
    fetchJson(
      API +
        '/api/bonyad/issues/' +
        issueId +
        '/media/' +
        encodeURIComponent(mediaId) +
        '?editKey=' +
        encodeURIComponent(k),
      { method: 'DELETE', headers: { 'x-bonyad-edit-key': k } }
    )
      .then(function () {
        showBonyadFlash('Image removed', 'success');
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Remove failed', { title: 'Remove failed', variant: 'error' });
      });
  }

  function addIssueMediaUrl(issueId, url) {
    const k = getEditKey();
    fetchJson(API + '/api/bonyad/issues/' + issueId + '/media/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({ url: url, editKey: k }),
    })
      .then(function () {
        showBonyadFlash('Link added: ' + url, 'success');
        const inp = document.querySelector('.media-url-in[data-issue="' + issueId + '"]');
        if (inp) inp.value = '';
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Add URL failed', { title: 'Add URL failed', variant: 'error' });
      });
  }

  function uploadIssueMedia(issueId, fileList) {
    const k = getEditKey();
    const fd = new FormData();
    for (let i = 0; i < fileList.length; i += 1) {
      fd.append('files', fileList[i]);
    }
    fetchJson(API + '/api/bonyad/issues/' + issueId + '/media/upload?editKey=' + encodeURIComponent(k), {
      method: 'POST',
      headers: { 'x-bonyad-edit-key': k },
      body: fd,
    })
      .then(function (j) {
        let msg = 'Uploaded';
        const media = j && j.issue_media;
        if (Array.isArray(media) && media.length) {
          const last = media[media.length - 1];
          if (last && last.kind === 'upload' && last.path) {
            msg = 'Uploaded: ' + mediaAbsoluteUrl(last.path);
          }
        }
        showBonyadFlash(msg, 'success');
        const inp = document.querySelector('.media-files[data-issue="' + issueId + '"]');
        if (inp) inp.value = '';
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Upload failed', { title: 'Upload failed', variant: 'error' });
      });
  }

  function submitNewIssue() {
    const title = document.getElementById('newTitle').value.trim();
    const priority = document.getElementById('newPriority').value;
    const tagsRaw = document.getElementById('newTags').value.trim();
    const prompt = document.getElementById('newPrompt').value.trim();
    if (!title || !prompt) {
      showBonyadFlash('Title and prompt required', 'warn');
      return;
    }
    const tags = tagsRaw
      ? tagsRaw.split(',').map(function (t) {
          return t.trim();
        }).filter(Boolean)
      : [];
    const k = getEditKey();
    if (!k) {
      showBonyadAlert('Save your edit key above before adding an issue.', {
        title: 'Edit key required',
        variant: 'error',
      });
      return;
    }
    fetchJson(API + '/api/bonyad/sheets/' + encodeURIComponent(slug) + '/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({ title, priority, tags, prompt_text: prompt, criteria: [], editKey: k }),
    })
      .then(function () {
        showBonyadFlash('Issue added', 'success');
        document.getElementById('newTitle').value = '';
        document.getElementById('newTags').value = '';
        document.getElementById('newPrompt').value = '';
        const addForm = document.getElementById('addForm');
        const addBtn = document.querySelector('[data-act="show-form"]');
        if (addForm) addForm.classList.remove('visible');
        if (addBtn) addBtn.style.display = 'inline-flex';
        return load();
      })
      .catch(function (e) {
        showBonyadAlert(e.message || 'Add failed', { title: 'Could not add issue', variant: 'error' });
      });
  }

  function load() {
    if (!slug) {
      document.getElementById('brief-root').innerHTML =
        '<p class="load-err">Missing sheet slug. Open from <a href="./">Bonyad hub</a>.</p>';
      return;
    }
    fetchJson(API + '/api/bonyad/sheets/' + encodeURIComponent(slug))
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Load failed');
        state.sheet = j.sheet;
        state.issues = j.issues || [];
        document.getElementById('brief-title').textContent = j.sheet.brief_title || '';
        document.getElementById('brief-subtitle').textContent = j.sheet.brief_subtitle || '';
        const vb = document.querySelector('.logo-block.bonyad-mark .vb-name');
        const vbSub = document.querySelector('.logo-block.bonyad-mark .vb-sub');
        if (vb) vb.textContent = j.sheet.label || 'Bonyad';
        if (vbSub) vbSub.textContent = j.sheet.platform_line || '';
        const meta = document.getElementById('header-meta');
        if (meta) {
          meta.innerHTML = '';
          function chip(svgPath, text) {
            return (
              '<div class="meta-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              svgPath +
              '</svg> ' +
              esc(text) +
              '</div>'
            );
          }
          if (j.sheet.meta_date) {
            meta.innerHTML += chip(
              '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
              j.sheet.meta_date
            );
          }
          if (j.sheet.meta_to) {
            meta.innerHTML += chip(
              '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
              'To: ' + j.sheet.meta_to
            );
          }
          if (j.sheet.meta_from) {
            meta.innerHTML += chip(
              '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
              'From: ' + j.sheet.meta_from
            );
          }
          if (j.sheet.status_label) {
            meta.innerHTML +=
              '<div class="status-chip"><span class="status-dot"></span>' + esc(j.sheet.status_label) + '</div>';
          }
        }
        render();
      })
      .catch(function (e) {
        document.getElementById('brief-root').innerHTML =
          '<p class="load-err">Could not load brief: ' + esc(e.message) + '</p>';
      });
  }

  document.getElementById('save-edit-key') &&
    document.getElementById('save-edit-key').addEventListener('click', function () {
      const v = document.getElementById('edit-key-input').value.trim();
      setEditKey(v);
      showBonyadFlash(v ? 'Edit key saved in this browser' : 'Edit key cleared', v ? 'success' : 'info');
      load();
    });
  document.getElementById('edit-key-input') &&
    (document.getElementById('edit-key-input').value = getEditKey());

  load();
})();
