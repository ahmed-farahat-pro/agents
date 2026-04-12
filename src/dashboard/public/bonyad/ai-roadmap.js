(function () {
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

  function priorityBadgeClass(p) {
    const u = String(p || '').toUpperCase();
    if (u.indexOf('P0') === 0 || u === 'HIGH') return 'ai-priority-p0';
    if (u.indexOf('P1') === 0) return 'ai-priority-p1';
    return 'ai-priority-p2';
  }

  let items = [];

  function render() {
    const root = document.getElementById('roadmap-root');
    if (!root) return;
    const k = getEditKey();
    let html =
      '<p class="ai-features-intro" style="margin-top:0;">Click a row to expand. Priority is a short label (e.g. P0, P1, P2).</p>';

    if (!items.length) {
      html +=
        '<p class="ai-section-body" style="margin-bottom:20px;">No items yet. Save your edit key above to add roadmap entries.</p>';
    }

    items.forEach(function (it) {
      html +=
        '<article class="ai-feature-card roadmap-card" id="rm-card-' +
        it.id +
        '" data-id="' +
        it.id +
        '">' +
        '<div class="roadmap-card-head" data-act="toggle" data-id="' +
        it.id +
        '">' +
        '<span class="ai-priority-badge ' +
        priorityBadgeClass(it.priority) +
        '">' +
        esc(it.priority || 'P2') +
        '</span>' +
        '<h2 style="margin:0;flex:1;font-size:1.05rem;">' +
        esc(it.title) +
        '</h2>' +
        '<svg class="roadmap-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
        '</div>' +
        '<div class="roadmap-card-body">' +
        sectionBlock('Description', it.description) +
        sectionBlock('How to', it.how_to) +
        sectionBlock('What we need', it.what_we_need) +
        sectionBlock('Collaborate with', it.collaborate) +
        (k
          ? '<div class="roadmap-edit-block">' +
            '<p class="ai-section-label" style="margin-top:16px;">Edit entry</p>' +
            '<div class="form-row">' +
            '<div class="form-group"><label>Title</label>' +
            '<input type="text" class="rm-title" data-id="' +
            it.id +
            '" value="' +
            esc(it.title).replace(/"/g, '&quot;') +
            '" /></div>' +
            '<div class="form-group"><label>Priority</label>' +
            '<input type="text" class="rm-priority" data-id="' +
            it.id +
            '" value="' +
            esc(it.priority).replace(/"/g, '&quot;') +
            '" placeholder="P0, P1…" /></div></div>' +
            '<div class="form-group"><label>Description</label>' +
            '<textarea class="rm-desc" data-id="' +
            it.id +
            '" rows="4">' +
            esc(it.description) +
            '</textarea></div>' +
            '<div class="form-group"><label>How to</label>' +
            '<textarea class="rm-how" data-id="' +
            it.id +
            '" rows="4">' +
            esc(it.how_to) +
            '</textarea></div>' +
            '<div class="form-group"><label>What we need</label>' +
            '<textarea class="rm-need" data-id="' +
            it.id +
            '" rows="4">' +
            esc(it.what_we_need) +
            '</textarea></div>' +
            '<div class="form-group"><label>Collaborate with</label>' +
            '<textarea class="rm-collab" data-id="' +
            it.id +
            '" rows="3">' +
            esc(it.collaborate) +
            '</textarea></div>' +
            '<button type="button" class="btn-submit rm-save" data-id="' +
            it.id +
            '">Save</button> ' +
            '<button type="button" class="btn-cancel rm-del" data-id="' +
            it.id +
            '">Delete</button>' +
            '</div>'
          : '') +
        '</div></article>';
    });

    if (k) {
      html +=
        '<div class="bonyad-new-sheet" style="padding-top:8px;">' +
        '<h3>Add roadmap item</h3>' +
        '<div class="bonyad-new-sheet-inner">' +
        '<div class="form-row">' +
        '<div class="form-group"><label>Title</label><input type="text" id="rm-new-title" placeholder="Feature name" /></div>' +
        '<div class="form-group"><label>Priority</label><input type="text" id="rm-new-priority" placeholder="P1" value="P2" /></div></div>' +
        '<div class="form-group"><label>Description</label><textarea id="rm-new-desc" rows="3"></textarea></div>' +
        '<div class="form-group"><label>How to</label><textarea id="rm-new-how" rows="3"></textarea></div>' +
        '<div class="form-group"><label>What we need</label><textarea id="rm-new-need" rows="3"></textarea></div>' +
        '<div class="form-group"><label>Collaborate with</label><textarea id="rm-new-collab" rows="2"></textarea></div>' +
        '<button type="button" class="add-btn" id="rm-add-submit">Add item</button>' +
        '</div></div>' +
        '<div class="bonyad-sheet-danger" style="margin-top:24px;">' +
        '<div class="section-label">Danger zone</div>' +
        '<p class="danger-hint">Deletes every AI roadmap row. Fix-brief issues are not affected.</p>' +
        '<button type="button" class="btn-danger-outline" id="rm-delete-all">Delete all roadmap items</button>' +
        '</div>';
    }

    root.innerHTML = html;

    root.querySelectorAll('.roadmap-card-head[data-act="toggle"]').forEach(function (el) {
      el.addEventListener('click', function () {
        const id = el.getAttribute('data-id');
        const card = document.getElementById('rm-card-' + id);
        if (card) card.classList.toggle('open');
      });
    });

    root.querySelectorAll('.rm-save').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = Number(btn.getAttribute('data-id'));
        patchItem(id);
      });
    });

    root.querySelectorAll('.rm-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = Number(btn.getAttribute('data-id'));
        if (!confirm('Delete this roadmap item?')) return;
        deleteItem(id);
      });
    });

    const addBtn = document.getElementById('rm-add-submit');
    if (addBtn) {
      addBtn.addEventListener('click', createItem);
    }

    const delAll = document.getElementById('rm-delete-all');
    if (delAll) {
      delAll.addEventListener('click', function () {
        if (!confirm('Delete ALL AI roadmap items?')) return;
        if (!confirm('Confirm: clear the entire roadmap table?')) return;
        deleteAllRoadmap();
      });
    }
  }

  function sectionBlock(label, text) {
    if (!text || !String(text).trim()) {
      return '';
    }
    return (
      '<div class="ai-section-label">' +
      esc(label) +
      '</div>' +
      '<p class="ai-section-body" style="white-space:pre-wrap;">' +
      esc(text) +
      '</p>'
    );
  }

  function patchItem(id) {
    const k = getEditKey();
    const title = document.querySelector('.rm-title[data-id="' + id + '"]').value.trim();
    const priority = document.querySelector('.rm-priority[data-id="' + id + '"]').value.trim() || 'P2';
    const description = document.querySelector('.rm-desc[data-id="' + id + '"]').value;
    const how_to = document.querySelector('.rm-how[data-id="' + id + '"]').value;
    const what_we_need = document.querySelector('.rm-need[data-id="' + id + '"]').value;
    const collaborate = document.querySelector('.rm-collab[data-id="' + id + '"]').value;
    if (!title) {
      showToast('Title required');
      return;
    }
    fetch(API + '/api/bonyad/ai-roadmap/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({
        editKey: k,
        title,
        priority,
        description,
        how_to,
        what_we_need,
        collaborate,
      }),
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
        showToast(e.message || 'Save failed');
      });
  }

  function deleteItem(id) {
    const k = getEditKey();
    fetch(API + '/api/bonyad/ai-roadmap/' + id + '?editKey=' + encodeURIComponent(k), {
      method: 'DELETE',
      headers: { 'x-bonyad-edit-key': k },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Deleted');
        return load();
      })
      .catch(function (e) {
        showToast(e.message || 'Delete failed');
      });
  }

  function deleteAllRoadmap() {
    const k = getEditKey();
    fetch(API + '/api/bonyad/ai-roadmap?editKey=' + encodeURIComponent(k), {
      method: 'DELETE',
      headers: { 'x-bonyad-edit-key': k },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Roadmap cleared');
        return load();
      })
      .catch(function (e) {
        showToast(e.message || 'Clear failed');
      });
  }

  function createItem() {
    const k = getEditKey();
    const title = document.getElementById('rm-new-title').value.trim();
    const priority = document.getElementById('rm-new-priority').value.trim() || 'P2';
    if (!title) {
      showToast('Title required');
      return;
    }
    fetch(API + '/api/bonyad/ai-roadmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bonyad-edit-key': k },
      body: JSON.stringify({
        editKey: k,
        title,
        priority,
        description: document.getElementById('rm-new-desc').value,
        how_to: document.getElementById('rm-new-how').value,
        what_we_need: document.getElementById('rm-new-need').value,
        collaborate: document.getElementById('rm-new-collab').value,
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Failed');
        showToast('Added');
        document.getElementById('rm-new-title').value = '';
        document.getElementById('rm-new-desc').value = '';
        document.getElementById('rm-new-how').value = '';
        document.getElementById('rm-new-need').value = '';
        document.getElementById('rm-new-collab').value = '';
        document.getElementById('rm-new-priority').value = 'P2';
        return load();
      })
      .catch(function (e) {
        showToast(e.message || 'Add failed');
      });
  }

  function load() {
    fetch(API + '/api/bonyad/ai-roadmap')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.success) throw new Error(j.error || 'Load failed');
        items = j.items || [];
        render();
      })
      .catch(function (e) {
        const root = document.getElementById('roadmap-root');
        if (root) {
          root.innerHTML = '<p class="load-err">Could not load roadmap: ' + esc(e.message) + '</p>';
        }
      });
  }

  document.getElementById('roadmap-save-key') &&
    document.getElementById('roadmap-save-key').addEventListener('click', function () {
      const v = document.getElementById('roadmap-edit-key').value.trim();
      setEditKey(v);
      showToast(v ? 'Edit key saved' : 'Cleared');
      load();
    });
  document.getElementById('roadmap-edit-key') &&
    (document.getElementById('roadmap-edit-key').value = getEditKey());

  load();
})();
