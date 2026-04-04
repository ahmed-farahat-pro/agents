/**
 * Public Excel (.xls / .xlsx) → Bonyad issues import (first worksheet).
 * No edit key required; capped file size and row count.
 */

const multer = require('multer');
const XLSX = require('xlsx');
const db = require('../database/connection');
const logger = require('../utils/logger');

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 200;

const TITLE_KEYS = ['title', 'issue', 'bug', 'summary', 'name', 'task title', 'subject'];
const PRIORITY_KEYS = ['priority', 'prio', 'severity', 'impact'];
const PROMPT_KEYS = [
  'prompt',
  'prompt text',
  'description',
  'details',
  'developer prompt',
  'task',
  'notes',
  'fix',
  'what to fix',
];
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

function normPriority(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (['high', 'h', 'p0', 'p1', 'critical', 'urgent', '1'].includes(s)) return 'high';
  if (['low', 'l', 'p3', 'nice', 'minor', '3'].includes(s)) return 'low';
  if (['medium', 'med', 'm', 'p2', 'normal', '2'].includes(s)) return 'medium';
  return 'medium';
}

function parseTags(s) {
  if (s == null || s === '') return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim()).filter(Boolean);
  return String(s)
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCriteria(s) {
  if (s == null || s === '') return [];
  if (Array.isArray(s)) return s.map((x) => String(x).trim()).filter(Boolean);
  const str = String(s).trim();
  try {
    const j = JSON.parse(str);
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* use text split */
  }
  return str
    .split(/\r?\n|\||•/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], sheetName: null };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return { rows, sheetName };
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
          return res.status(400).json({ success: false, error: 'No data rows in the first worksheet' });
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
          let promptText = pick(m, PROMPT_KEYS);
          if (!title && !promptText) {
            skipped.push({ row: i + 2, reason: 'No title or description column' });
            continue;
          }
          if (!title) title = promptText.slice(0, 512);
          if (!promptText) promptText = title;
          if (title.length > 512) title = title.slice(0, 512);
          const priority = normPriority(pick(m, PRIORITY_KEYS));
          const tags = parseTags(pick(m, TAGS_KEYS));
          const criteria = parseCriteria(pick(m, CRITERIA_KEYS));
          await db.query(
            `INSERT INTO bonyad_issues (sheet_slug, sort_order, title, priority, tags, prompt_text, criteria, is_done)
             VALUES (?,?,?,?,?,?,?,0)`,
            [slug, nextOrder, title, priority, JSON.stringify(tags), promptText, JSON.stringify(criteria)]
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
