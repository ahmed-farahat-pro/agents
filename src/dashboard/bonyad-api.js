/**
 * Bonyad fix-brief API — sheets + issues in MySQL (Nigents).
 * GET is public. Mutations require BONYAD_EDIT_SECRET when set (header x-bonyad-edit-key, query editKey, or body.editKey).
 */

const db = require('../database/connection');
const logger = require('../utils/logger');
const androidSeed = require('./bonyad-android-seed');

const BONYAD_EDIT_SECRET = (process.env.BONYAD_EDIT_SECRET || '').trim();

function requireBonyadEdit(req, res, next) {
  if (!BONYAD_EDIT_SECRET) {
    return next();
  }
  const k =
    (req.body && req.body.editKey) ||
    req.headers['x-bonyad-edit-key'] ||
    (req.query && req.query.editKey);
  if (k === BONYAD_EDIT_SECRET) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Invalid or missing edit key (set BONYAD_EDIT_SECRET on server).' });
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

async function ensureBonyadTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bonyad_sheets (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(64) NOT NULL UNIQUE,
      label VARCHAR(255) NOT NULL,
      platform_line VARCHAR(255) NULL,
      brief_title VARCHAR(500) NOT NULL,
      brief_subtitle TEXT,
      meta_date VARCHAR(128) NULL,
      meta_to VARCHAR(255) NULL,
      meta_from VARCHAR(255) NULL,
      status_label VARCHAR(128) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS bonyad_issues (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sheet_slug VARCHAR(64) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      module VARCHAR(255) NULL,
      issue_type VARCHAR(128) NULL,
      sheet_status VARCHAR(128) NULL,
      attachments TEXT NULL,
      title VARCHAR(512) NOT NULL,
      priority ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
      tags JSON,
      prompt_text MEDIUMTEXT NOT NULL,
      criteria JSON,
      is_done TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bonyad_sheet_sort (sheet_slug, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS bonyad_ai_roadmap (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sort_order INT NOT NULL DEFAULT 0,
      priority VARCHAR(32) NOT NULL DEFAULT 'P2',
      title VARCHAR(512) NOT NULL,
      description MEDIUMTEXT,
      how_to MEDIUMTEXT,
      what_we_need MEDIUMTEXT,
      collaborate MEDIUMTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ai_roadmap_sort (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  logger.info('[Bonyad] Tables ensured');
}

/** Add Excel / bug-tracker columns on existing deployments (CREATE IF NOT EXISTS skips new columns). */
async function ensureBonyadIssueExtraColumns() {
  const table = 'bonyad_issues';
  const cols = [
    ['module', 'VARCHAR(255) NULL'],
    ['issue_type', 'VARCHAR(128) NULL'],
    ['sheet_status', 'VARCHAR(128) NULL'],
    ['attachments', 'TEXT NULL'],
  ];
  for (const [name, def] of cols) {
    const chk = await db.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, name]
    );
    if (Number(chk[0].c) === 0) {
      await db.query(`ALTER TABLE bonyad_issues ADD COLUMN ${name} ${def}`);
      logger.info('[Bonyad] Added column bonyad_issues.%s', name);
    }
  }
}

const DEFAULT_SHEETS = [
  {
    slug: 'android',
    label: 'Bonyad',
    platform_line: 'Android Application',
    brief_title: 'Android App — Developer Fix Brief',
    brief_subtitle:
      'A structured list of required fixes. Each issue contains a developer prompt with requirements and acceptance criteria.',
    meta_date: 'April 4, 2026',
    meta_to: 'Android Developer',
    meta_from: 'Project Manager',
    status_label: 'Requires Action',
    sort_order: 1,
  },
  {
    slug: 'ios',
    label: 'Bonyad',
    platform_line: 'iOS Application',
    brief_title: 'iOS App — Developer Fix Brief',
    brief_subtitle: 'Add iOS issues below. Use the same prompt + criteria pattern as Android.',
    meta_date: null,
    meta_to: 'iOS Developer',
    meta_from: 'Project Manager',
    status_label: 'Draft',
    sort_order: 2,
  },
  {
    slug: 'web',
    label: 'Bonyad',
    platform_line: 'Web Application',
    brief_title: 'Web App — Developer Fix Brief',
    brief_subtitle: 'Track web front-end and client issues here.',
    meta_date: null,
    meta_to: 'Web Developer',
    meta_from: 'Project Manager',
    status_label: 'Draft',
    sort_order: 3,
  },
  {
    slug: 'backend',
    label: 'Bonyad',
    platform_line: 'Backend / API',
    brief_title: 'Backend — Developer Fix Brief',
    brief_subtitle: 'API, services, and server-side fixes.',
    meta_date: null,
    meta_to: 'Backend Developer',
    meta_from: 'Project Manager',
    status_label: 'Draft',
    sort_order: 4,
  },
];

async function seedSheetsIfEmpty() {
  const rows = await db.query('SELECT COUNT(*) AS c FROM bonyad_sheets');
  const c = rows[0] && rows[0].c;
  if (c > 0) return;
  for (const s of DEFAULT_SHEETS) {
    await db.query(
      `INSERT INTO bonyad_sheets (slug, label, platform_line, brief_title, brief_subtitle, meta_date, meta_to, meta_from, status_label, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        s.slug,
        s.label,
        s.platform_line,
        s.brief_title,
        s.brief_subtitle,
        s.meta_date,
        s.meta_to,
        s.meta_from,
        s.status_label,
        s.sort_order,
      ]
    );
  }
  logger.info('[Bonyad] Seeded default sheets');
}

async function seedAndroidIssuesIfEmpty() {
  const rows = await db.query(
    'SELECT COUNT(*) AS c FROM bonyad_issues WHERE sheet_slug = ?',
    ['android']
  );
  if (rows[0].c > 0) return;
  for (const row of androidSeed) {
    await db.query(
      `INSERT INTO bonyad_issues (sheet_slug, sort_order, title, priority, tags, prompt_text, criteria, is_done)
       VALUES (?,?,?,?,?,?,?,0)`,
      [
        'android',
        row.sort_order,
        row.title,
        row.priority,
        JSON.stringify(row.tags || []),
        row.prompt,
        JSON.stringify(row.criteria || []),
      ]
    );
  }
  logger.info('[Bonyad] Seeded Android issues (%d)', androidSeed.length);
}

async function migrateLegacySheetLabels() {
  try {
    await db.query(
      `UPDATE bonyad_sheets SET label = 'Bonyad' WHERE label IN ('Vbonayd', 'vbonayd')`
    );
  } catch (e) {
    logger.warn('[Bonyad] Label migration skipped:', e.message);
  }
}

async function initBonyadData() {
  try {
    await ensureBonyadTables();
    await ensureBonyadIssueExtraColumns();
    await seedSheetsIfEmpty();
    await migrateLegacySheetLabels();
    await seedAndroidIssuesIfEmpty();
  } catch (e) {
    logger.error('[Bonyad] Init failed:', e.message);
  }
}

function rowToIssue(r) {
  return {
    id: r.id,
    sort_order: r.sort_order,
    module: r.module != null ? r.module : null,
    issue_type: r.issue_type != null ? r.issue_type : null,
    sheet_status: r.sheet_status != null ? r.sheet_status : null,
    attachments: r.attachments != null ? r.attachments : null,
    title: r.title,
    priority: r.priority,
    tags: parseJsonField(r.tags, []),
    prompt_text: r.prompt_text,
    criteria: parseJsonField(r.criteria, []),
    is_done: !!r.is_done,
  };
}

function rowToRoadmap(r) {
  return {
    id: r.id,
    sort_order: r.sort_order,
    priority: r.priority,
    title: r.title,
    description: r.description || '',
    how_to: r.how_to || '',
    what_we_need: r.what_we_need || '',
    collaborate: r.collaborate || '',
  };
}

function registerBonyadRoutes(app) {
  app.get('/api/bonyad/sheets', async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT slug, label, platform_line, brief_title, brief_subtitle, sort_order FROM bonyad_sheets ORDER BY sort_order ASC, slug ASC'
      );
      res.json({ success: true, sheets: rows });
    } catch (e) {
      logger.error('[Bonyad] list sheets:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/bonyad/sheets', requireBonyadEdit, async (req, res) => {
    try {
      const {
        slug,
        label,
        platform_line,
        brief_title,
        brief_subtitle,
        meta_date,
        meta_to,
        meta_from,
        status_label,
        sort_order,
      } = req.body || {};
      if (!slug || !label || !brief_title) {
        return res.status(400).json({ success: false, error: 'slug, label, and brief_title are required' });
      }
      const clean = String(slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');
      await db.query(
        `INSERT INTO bonyad_sheets (slug, label, platform_line, brief_title, brief_subtitle, meta_date, meta_to, meta_from, status_label, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
         label=VALUES(label), platform_line=VALUES(platform_line), brief_title=VALUES(brief_title),
         brief_subtitle=VALUES(brief_subtitle), meta_date=VALUES(meta_date), meta_to=VALUES(meta_to),
         meta_from=VALUES(meta_from), status_label=VALUES(status_label), sort_order=VALUES(sort_order)`,
        [
          clean,
          label,
          platform_line || null,
          brief_title,
          brief_subtitle || null,
          meta_date || null,
          meta_to || null,
          meta_from || null,
          status_label || 'Draft',
          Number(sort_order) || 99,
        ]
      );
      res.json({ success: true, slug: clean });
    } catch (e) {
      logger.error('[Bonyad] create sheet:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/bonyad/sheets/:slug', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      const sheets = await db.query('SELECT * FROM bonyad_sheets WHERE slug = ? LIMIT 1', [slug]);
      if (!sheets.length) {
        return res.status(404).json({ success: false, error: 'Sheet not found' });
      }
      const sheet = sheets[0];
      const issues = await db.query(
        'SELECT * FROM bonyad_issues WHERE sheet_slug = ? ORDER BY sort_order ASC, id ASC',
        [slug]
      );
      res.json({
        success: true,
        sheet: {
          slug: sheet.slug,
          label: sheet.label,
          platform_line: sheet.platform_line,
          brief_title: sheet.brief_title,
          brief_subtitle: sheet.brief_subtitle,
          meta_date: sheet.meta_date,
          meta_to: sheet.meta_to,
          meta_from: sheet.meta_from,
          status_label: sheet.status_label,
        },
        issues: issues.map(rowToIssue),
      });
    } catch (e) {
      logger.error('[Bonyad] get sheet:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/bonyad/sheets/:slug/issues', requireBonyadEdit, async (req, res) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      const sh = await db.query('SELECT slug FROM bonyad_sheets WHERE slug=?', [slug]);
      if (!sh.length) {
        return res.status(404).json({ success: false, error: 'Sheet not found' });
      }
      const {
        title,
        priority,
        tags,
        prompt_text,
        criteria,
        sort_order,
        module,
        issue_type,
        sheet_status,
        attachments,
      } = req.body || {};
      if (!title || !prompt_text) {
        return res.status(400).json({ success: false, error: 'title and prompt_text required' });
      }
      const pri = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
      const maxRows = await db.query(
        'SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM bonyad_issues WHERE sheet_slug=?',
        [slug]
      );
      const ord = Number(sort_order) || maxRows[0].n;
      const r = await db.query(
        `INSERT INTO bonyad_issues (sheet_slug, sort_order, module, issue_type, sheet_status, attachments, title, priority, tags, prompt_text, criteria, is_done)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [
          slug,
          ord,
          module != null ? String(module).slice(0, 255) : null,
          issue_type != null ? String(issue_type).slice(0, 128) : null,
          sheet_status != null ? String(sheet_status).slice(0, 128) : null,
          attachments != null ? String(attachments) : null,
          title,
          pri,
          JSON.stringify(Array.isArray(tags) ? tags : []),
          prompt_text,
          JSON.stringify(Array.isArray(criteria) ? criteria : []),
        ]
      );
      res.json({ success: true, id: r.insertId });
    } catch (e) {
      logger.error('[Bonyad] add issue:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.patch('/api/bonyad/issues/:id', requireBonyadEdit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = req.body || {};
      const cur = await db.query('SELECT * FROM bonyad_issues WHERE id=?', [id]);
      if (!cur.length) {
        return res.status(404).json({ success: false, error: 'Issue not found' });
      }
      const row = cur[0];
      const title = body.title != null ? body.title : row.title;
      const priority = ['high', 'medium', 'low'].includes(body.priority) ? body.priority : row.priority;
      const prompt_text = body.prompt_text != null ? body.prompt_text : row.prompt_text;
      const tags = body.tags != null ? JSON.stringify(body.tags) : row.tags;
      const criteria = body.criteria != null ? JSON.stringify(body.criteria) : row.criteria;
      const sort_order = body.sort_order != null ? Number(body.sort_order) : row.sort_order;
      const is_done = body.is_done != null ? (body.is_done ? 1 : 0) : row.is_done;
      const module =
        body.module !== undefined ? (body.module ? String(body.module).slice(0, 255) : null) : row.module;
      const issue_type =
        body.issue_type !== undefined
          ? body.issue_type
            ? String(body.issue_type).slice(0, 128)
            : null
          : row.issue_type;
      const sheet_status =
        body.sheet_status !== undefined
          ? body.sheet_status
            ? String(body.sheet_status).slice(0, 128)
            : null
          : row.sheet_status;
      const attachments =
        body.attachments !== undefined
          ? body.attachments
            ? String(body.attachments)
            : null
          : row.attachments;
      await db.query(
        `UPDATE bonyad_issues SET title=?, priority=?, prompt_text=?, tags=?, criteria=?, sort_order=?, is_done=?,
         module=?, issue_type=?, sheet_status=?, attachments=? WHERE id=?`,
        [
          title,
          priority,
          prompt_text,
          tags,
          criteria,
          sort_order,
          is_done,
          module,
          issue_type,
          sheet_status,
          attachments,
          id,
        ]
      );
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] patch issue:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/bonyad/issues/:id', requireBonyadEdit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.query('DELETE FROM bonyad_issues WHERE id=?', [id]);
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] delete issue:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/bonyad/sheets/:slug/issues', requireBonyadEdit, async (req, res) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      const sh = await db.query('SELECT slug FROM bonyad_sheets WHERE slug=?', [slug]);
      if (!sh.length) {
        return res.status(404).json({ success: false, error: 'Sheet not found' });
      }
      const result = await db.query('DELETE FROM bonyad_issues WHERE sheet_slug=?', [slug]);
      const deleted = result.affectedRows != null ? result.affectedRows : 0;
      res.json({ success: true, deleted });
    } catch (e) {
      logger.error('[Bonyad] delete all issues:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/bonyad/ai-roadmap', async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT * FROM bonyad_ai_roadmap ORDER BY sort_order ASC, id ASC'
      );
      res.json({ success: true, items: rows.map(rowToRoadmap) });
    } catch (e) {
      logger.error('[Bonyad] ai-roadmap list:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/bonyad/ai-roadmap', requireBonyadEdit, async (req, res) => {
    try {
      const { title, priority, description, how_to, what_we_need, collaborate, sort_order } = req.body || {};
      if (!title || !String(title).trim()) {
        return res.status(400).json({ success: false, error: 'title required' });
      }
      const pri = String(priority || 'P2').slice(0, 32);
      const maxRows = await db.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM bonyad_ai_roadmap');
      const ord = Number(sort_order) || maxRows[0].n;
      const r = await db.query(
        `INSERT INTO bonyad_ai_roadmap (sort_order, priority, title, description, how_to, what_we_need, collaborate)
         VALUES (?,?,?,?,?,?,?)`,
        [
          ord,
          pri,
          String(title).slice(0, 512),
          description != null ? String(description) : null,
          how_to != null ? String(how_to) : null,
          what_we_need != null ? String(what_we_need) : null,
          collaborate != null ? String(collaborate) : null,
        ]
      );
      res.json({ success: true, id: r.insertId });
    } catch (e) {
      logger.error('[Bonyad] ai-roadmap create:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.patch('/api/bonyad/ai-roadmap/:id', requireBonyadEdit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = req.body || {};
      const cur = await db.query('SELECT * FROM bonyad_ai_roadmap WHERE id=?', [id]);
      if (!cur.length) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }
      const row = cur[0];
      const title = body.title != null ? String(body.title).slice(0, 512) : row.title;
      const priority = body.priority != null ? String(body.priority).slice(0, 32) : row.priority;
      const description = body.description !== undefined ? body.description : row.description;
      const how_to = body.how_to !== undefined ? body.how_to : row.how_to;
      const what_we_need = body.what_we_need !== undefined ? body.what_we_need : row.what_we_need;
      const collaborate = body.collaborate !== undefined ? body.collaborate : row.collaborate;
      const sort_order = body.sort_order != null ? Number(body.sort_order) : row.sort_order;
      await db.query(
        `UPDATE bonyad_ai_roadmap SET title=?, priority=?, description=?, how_to=?, what_we_need=?, collaborate=?, sort_order=? WHERE id=?`,
        [title, priority, description, how_to, what_we_need, collaborate, sort_order, id]
      );
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] ai-roadmap patch:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/bonyad/ai-roadmap/:id', requireBonyadEdit, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await db.query('DELETE FROM bonyad_ai_roadmap WHERE id=?', [id]);
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] ai-roadmap delete:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/bonyad/ai-roadmap', requireBonyadEdit, async (req, res) => {
    try {
      await db.query('DELETE FROM bonyad_ai_roadmap');
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] ai-roadmap clear:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/api/bonyad/sheets/:slug', requireBonyadEdit, async (req, res) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      await db.query('DELETE FROM bonyad_issues WHERE sheet_slug=?', [slug]);
      await db.query('DELETE FROM bonyad_sheets WHERE slug=?', [slug]);
      res.json({ success: true });
    } catch (e) {
      logger.error('[Bonyad] delete sheet:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = {
  registerBonyadRoutes,
  ensureBonyadTables,
  initBonyadData,
};
