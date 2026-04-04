/**
 * Public Excel (.xls / .xlsx) → Bonyad issues import.
 * Picks the first worksheet whose header row includes a Title-like column (e.g. Bonyad_BUGS.xlsx).
 * Maps Module, Type, Priority, Title, Description, Steps, Expected/Actual, Notes, Attachments, Status.
 * No edit key required; capped file size and row count.
 */

const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../database/connection');
const logger = require('../utils/logger');
const { normalizeMediaArray } = require('./bonyad-issue-media');

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_ROWS = 2000;

const TITLE_KEYS = ['title', 'issue', 'bug', 'summary', 'name', 'task title', 'subject', 'bug title'];
const PRIORITY_KEYS = ['priority', 'prio', 'severity', 'impact'];
const DESC_KEYS = ['description', 'details', 'developer prompt', 'task', 'notes summary'];
const STEPS_KEYS = ['steps to reproduce', 'steps', 'repro', 'reproduction'];
const EXPECTED_KEYS = ['expected behavior', 'expected'];
const ACTUAL_KEYS = ['actual behavior', 'actual'];
const NOTES_KEYS = ['notes', 'note', 'comments'];
const MODULE_KEYS = ['module', 'area', 'component', 'feature', 'epic'];
const TYPE_KEYS = ['type', 'kind', 'category', 'bug type'];
const STATUS_KEYS = ['status', 'state'];
const ATTACH_KEYS = ['attachements', 'attachments', 'attachment', 'screenshot', 'screenshots'];
const TAGS_KEYS = ['tags', 'labels', 'label'];
const CRITERIA_KEYS = ['criteria', 'acceptance', 'acceptance criteria', 'ac', 'definition of done'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const n = (file.originalname || '').toLowerCase();
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xls or .xlsx files are allowed'));
    }
  },
});

function normKey(k) {
  return String(k == null ? '' : k)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function rowMap(row) {
  const m = {};
  for (const [k, v] of Object.entries(row)) {
    m[normKey(k)] = v;
  }
  return m;
}

function pick(m, keys) {
  for (const k of keys) {
    const v = m[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function pickAttachments(m) {
  let a = pick(m, ATTACH_KEYS);
  if (!a) {
    const extras = [];
    for (const k of Object.keys(m)) {
      const nk = normKey(k);
      if (nk.startsWith('__empty') || nk === 'empty') {
        const v = m[k];
        if (v != null && String(v).trim() !== '') extras.push(String(v).trim());
      }
    }
    a = extras.join('; ');
  }
  return a || null;
}

function normPriority(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (['high', 'h', 'p0', 'p1', 'critical', 'urgent', '1'].includes(s)) return 'high';
  if (['low', 'l', 'p3', 'nice', 'minor', '3'].includes(s)) return 'low';
  if (['medium', 'med', 'm', 'p2', 'normal', '2'].includes(s)) return 'medium';
  return 'medium';
}

function statusToDone(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return /^(solved|done|closed|fixed|complete|completed|resolved|verified|wontfix|won't fix|wont fix)/.test(t);
}

function parseTags(s) {
  if (s == null || s === '') return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim()).filter(Boolean);
  return String(s)
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCriteriaFromExcel(m, structured) {
  const fromCol = pick(m, CRITERIA_KEYS);
  if (fromCol) {
    const str = String(fromCol).trim();
    try {
      const j = JSON.parse(str);
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
    return str
      .split(/\r?\n|\||•/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return structured.filter(Boolean);
}

function buildPromptAndCriteria(m) {
  const description = pick(m, DESC_KEYS);
  const steps = pick(m, STEPS_KEYS);
  const expected = pick(m, EXPECTED_KEYS);
  const actual = pick(m, ACTUAL_KEYS);
  const notes = pick(m, NOTES_KEYS);

  const parts = [];
  if (description) parts.push(description);
  if (steps) parts.push(`Steps to reproduce:\n${steps}`);
  if (expected) parts.push(`Expected behavior:\n${expected}`);
  if (actual) parts.push(`Actual behavior:\n${actual}`);
  if (notes && notes.toUpperCase() !== 'N/A') parts.push(`Notes:\n${notes}`);

  const promptText = parts.join('\n\n').trim() || description || pick(m, TITLE_KEYS) || '—';

  const structured = [];
  if (steps) structured.push(`Steps to reproduce: ${steps.replace(/\s+/g, ' ').trim()}`);
  if (expected) structured.push(`Expected: ${expected.replace(/\s+/g, ' ').trim()}`);
  if (actual) structured.push(`Actual: ${actual.replace(/\s+/g, ' ').trim()}`);
  if (notes && notes.toUpperCase() !== 'N/A') structured.push(`Notes: ${notes}`);

  const criteria = parseCriteriaFromExcel(m, structured);

  return { promptText, criteria };
}

function sheetHasTitleColumn(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  if (rows.length < 1) return false;
  const hdr = (rows[0] || []).map((x) => normKey(x));
  const titleHints = ['title', 'bug', 'issue', 'summary', 'subject'];
  return hdr.some((h) => titleHints.includes(h) || h.includes('title'));
}

function pickWorkbookSheet(wb) {
  for (let i = 0; i < wb.SheetNames.length; i += 1) {
    const name = wb.SheetNames[i];
    const sheet = wb.Sheets[name];
    if (sheetHasTitleColumn(sheet)) {
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      return { sheetName: name, rows };
    }
  }
  const name = wb.SheetNames[0];
  if (!name) return { sheetName: null, rows: [] };
  return {
    sheetName: name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }),
  };
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return pickWorkbookSheet(wb);
}

/** Turn attachment cell text + filenames into issue_media URL entries (http/https only). */
function issueMediaFromAttachments(attachmentsText) {
  if (!attachmentsText || !String(attachmentsText).trim()) {
    return JSON.stringify([]);
  }
  const parts = String(attachmentsText)
    .split(/[,;|\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const raw = [];
  for (const p of parts) {
    if (/^https?:\/\//i.test(p)) {
      raw.push({ id: crypto.randomUUID(), kind: 'url', url: p.slice(0, 2048) });
    }
  }
  return JSON.stringify(normalizeMediaArray(raw));
}

function registerBonyadExcelRoutes(app) {
  app.post(
    '/api/bonyad/sheets/:slug/issues/import-excel',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          const msg = err.message || 'Upload failed';
          return res.status(400).json({ success: false, error: msg });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const slug = String(req.params.slug || '').toLowerCase();
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ success: false, error: 'Missing file field "file" (.xls or .xlsx)' });
        }
        const sh = await db.query('SELECT slug FROM bonyad_sheets WHERE slug=?', [slug]);
        if (!sh.length) {
          return res.status(404).json({ success: false, error: 'Sheet not found' });
        }
        const { rows, sheetName } = parseWorkbook(req.file.buffer);
        if (!rows.length) {
          return res.status(400).json({
            success: false,
            error: 'No data rows found. Use a worksheet whose first row includes a Title (or Issue) column.',
          });
        }
        const slice = rows.slice(0, MAX_ROWS);
        const maxOrd = await db.query(
          'SELECT COALESCE(MAX(sort_order),0) AS n FROM bonyad_issues WHERE sheet_slug=?',
          [slug]
        );
        let nextOrder = Number(maxOrd[0].n) + 1;
        let imported = 0;
        const skipped = [];
        for (let i = 0; i < slice.length; i += 1) {
          const m = rowMap(slice[i]);
          let title = pick(m, TITLE_KEYS);
          const { promptText, criteria } = buildPromptAndCriteria(m);
          if (!title && !promptText) {
            skipped.push({ row: i + 2, reason: 'No title or description' });
            continue;
          }
          if (!title) title = String(promptText).slice(0, 512);
          if (title.length > 512) title = title.slice(0, 512);
          const priority = normPriority(pick(m, PRIORITY_KEYS));
          const module = pick(m, MODULE_KEYS) || null;
          const issueType = pick(m, TYPE_KEYS) || null;
          const sheetStatus = pick(m, STATUS_KEYS) || null;
          const attachments = pickAttachments(m);
          const tagsFromCol = parseTags(pick(m, TAGS_KEYS));
          const tags =
            tagsFromCol.length > 0
              ? tagsFromCol
              : [module, issueType].filter((x) => x && String(x).trim());

          const isDone = statusToDone(sheetStatus) ? 1 : 0;
          const issueMediaJson = issueMediaFromAttachments(attachments);

          await db.query(
            `INSERT INTO bonyad_issues (sheet_slug, sort_order, module, issue_type, sheet_status, attachments, title, priority, tags, prompt_text, criteria, issue_media, is_done)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              slug,
              nextOrder,
              module ? module.slice(0, 255) : null,
              issueType ? issueType.slice(0, 128) : null,
              sheetStatus ? sheetStatus.slice(0, 128) : null,
              attachments,
              title,
              priority,
              JSON.stringify(tags.filter(Boolean)),
              promptText,
              JSON.stringify(criteria),
              issueMediaJson,
              isDone,
            ]
          );
          nextOrder += 1;
          imported += 1;
        }
        logger.info('[Bonyad] Excel import slug=%s sheet=%s imported=%d', slug, sheetName, imported);
        res.json({
          success: true,
          imported,
          skipped: skipped.length ? skipped : undefined,
          worksheet: sheetName,
          capped: rows.length > MAX_ROWS,
        });
      } catch (e) {
        logger.error('[Bonyad] Excel import:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    }
  );
}

module.exports = { registerBonyadExcelRoutes, MAX_FILE_BYTES, MAX_ROWS };
