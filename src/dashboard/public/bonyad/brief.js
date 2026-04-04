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

  function getEditKey() {
    return localStorage.getItem('bonyad_edit_key') || '';
  }

  function setEditKey(k) {
    if (k) localStorage.setItem('bonyad_edit_key', k);
    else localStorage.removeItem('bonyad_edit_key');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
    }, 2200);
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

  let state = { sheet: null, issues: [] };

  var ADD_SECTION_HTML =
    '<div class="add-section" id="addSection">' +
    '<h3>Add a New Issue</h3>' +
    '<p>Requires edit key (set above). Data is stored in the Nigents database.</p>' +
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
        '<div class="issue-number">#' +
        n +
        '</div>' +
        '<div class="issue-title-block">' +
        '<div class="issue-title">' +
        esc(iss.title) +
        '</div>' +
        '<div class="issue-tags">' +
        tags +
        '</div></div>' +
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
        (getEditKey()
          ? '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--gray-light);">' +
            '<p style="font-size:11px;font-weight:700;color:var(--gray-mid);margin-bottom:8px;">EDIT ISSUE</p>' +
            '<div class="form-group" style="margin-bottom:10px;"><label>Title</label>' +
            '<input type="text" class="edit-title" data-id="' +
            iss.id +
            '" value="' +
            esc(iss.title).replace(/"/g, '&quot;') +
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
      '<div class="section-label">Issues &amp; Developer Prompts</div>' +
      cardsHtml +
      ADD_SECTION_HTML;

    root.querySelectorAll('.issue-header[data-act="toggle"]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-act="done"]')) return;
        const id = el.getAttribute('data-id');
        const card = document.getElementById('card-' + id);
        if (card) card.classList.toggle('open');
      });
    });
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
            showToast('Prompt copied');
          },
          function () {
            showToast('Copy failed');
          }
        );
      });
    });
    root.querySelectorAll('[data-act="del"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = Number(el.getAttribute('data-id'));
        if (!confirm('Delete this issue?')) return;
        deleteIssue(id);
      });
    });
    root.querySelectorAll('[data-act="save-edit"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = Number(el.getAttribute('data-id'));
        const title = root.querySelector('.edit-title[data-id="' + id + '"]').value.trim();
        const prompt = root.querySelector('.edit-prompt[data-id="' + id + '"]').value.trim();
        const tagsRaw = root.querySelector('.edit-tags[data-id="' + id + '"]').value.trim();
        const critRaw = root.querySelector('.edit-criteria[data-id="' + id + '"]').value;
        if (!title || !prompt) {
          showToast('Title and prompt required');
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
        patchIssue(id, { title: title, prompt_text: prompt, tags: tags, criteria: criteria });
      });
    });

    const addBtn = root.querySelector('[data-act="show-form"]');
    const addForm = root.querySelector('#addForm');
    if (addBtn && addForm) {
      addBtn.addEventListener('click', function () {
        if (!getEditKey()) {
          showToast('Save an edit key first');
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
    fetch(API + '/api/bonyad/issues/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify(Object.assign({ editKey: k }, body)),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Saved');
        return load();
      })
      .catch(function (e) {
        showToast(e.message || 'Update failed');
      });
  }

  function deleteIssue(id) {
    const k = getEditKey();
    fetch(API + '/api/bonyad/issues/' + id + '?editKey=' + encodeURIComponent(k), {
      method: 'DELETE',
      headers: { 'x-bonyad-edit-key': k },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Issue deleted');
        return load();
      })
      .catch(function (e) {
        showToast(e.message || 'Delete failed');
      });
  }

  function submitNewIssue() {
    const title = document.getElementById('newTitle').value.trim();
    const priority = document.getElementById('newPriority').value;
    const tagsRaw = document.getElementById('newTags').value.trim();
    const prompt = document.getElementById('newPrompt').value.trim();
    if (!title || !prompt) {
      showToast('Title and prompt required');
      return;
    }
    const tags = tagsRaw
      ? tagsRaw.split(',').map(function (t) {
          return t.trim();
        }).filter(Boolean)
      : [];
    const k = getEditKey();
    fetch(API + '/api/bonyad/sheets/' + encodeURIComponent(slug) + '/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({ title, priority, tags, prompt_text: prompt, criteria: [], editKey: k }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Issue added');
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
        showToast(e.message || 'Add failed');
      });
  }

  function load() {
    if (!slug) {
      document.getElementById('brief-root').innerHTML =
        '<p class="load-err">Missing sheet slug. Open from <a href="./">Bonyad hub</a>.</p>';
      return;
    }
    fetch(API + '/api/bonyad/sheets/' + encodeURIComponent(slug))
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Load failed');
        state.sheet = j.sheet;
        state.issues = j.issues || [];
        document.getElementById('brief-title').textContent = j.sheet.brief_title || '';
        document.getElementById('brief-subtitle').textContent = j.sheet.brief_subtitle || '';
        const vb = document.querySelector('.logo-block.vbonayd .vb-name');
        const vbSub = document.querySelector('.logo-block.vbonayd .vb-sub');
        if (vb) vb.textContent = j.sheet.label || 'Vbonayd';
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
      showToast(v ? 'Edit key saved in this browser' : 'Edit key cleared');
      load();
    });
  document.getElementById('edit-key-input') &&
    (document.getElementById('edit-key-input').value = getEditKey());

  load();
})();
