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
const { normalizeMediaArray, deleteUploadedFilesForIssueRow } = require('./bonyad-issue-media');

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
      return { sheetName: name, rows, sheet };
    }
  }
  const name = wb.SheetNames[0];
  if (!name) return { sheetName: null, rows: [], sheet: null };
  const sheet = wb.Sheets[name];
  return {
    sheetName: name,
    rows: XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }),
    sheet,
  };
}

function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  return pickWorkbookSheet(wb);
}

/** Excel cell hyperlink target (screenshot cells often link to URL while showing a filename). */
function hyperlinkFromCell(cell) {
  if (!cell) return null;
  if (cell.l) {
    const l = cell.l;
    if (typeof l === 'string') return l.trim();
    if (l.Target) return String(l.Target).trim();
    if (l.target) return String(l.target).trim();
  }
  if (cell.f && /HYPERLINK/i.test(cell.f)) {
    const m = cell.f.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (m) return m[1].trim();
    const m2 = cell.f.match(/HYPERLINK\s*\(\s*'([^']+)'/i);
    if (m2) return m2[1].trim();
    const m3 = cell.f.match(/HYPERLINK\s*\(\s*([^,);]+)/i);
    if (m3) {
      const raw = String(m3[1]).replace(/^["']|["']$/g, '').trim();
      if (/^https?:\/\//i.test(raw)) return raw;
    }
  }
  return null;
}

/** All http(s) hyperlink targets on one sheet row (0-based row index). */
function extractHyperlinkUrlsForRow(sheet, row0) {
  const urls = [];
  if (!sheet || sheet['!ref'] == null) return urls;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (row0 < range.s.r || row0 > range.e.r) return urls;
  const seen = new Set();
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: row0, c });
    const cell = sheet[addr];
    const t = hyperlinkFromCell(cell);
    if (t && /^https?:\/\//i.test(t)) {
      const u = t.slice(0, 2048);
      const k = u.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        urls.push(u);
      }
    }
  }
  return urls;
}

function extractUrlsFromFreeText(text) {
  if (text == null || text === '') return [];
  const re = /https?:\/\/[^\s<>"',;|]+/gi;
  const m = String(text).match(re);
  return m || [];
}

/**
 * Build issue_media JSON: Excel hyperlinks (real screenshot URLs) + URLs in attachment cell text.
 */
function issueMediaFromExcelRow(attachmentsText, rowHyperlinkUrls) {
  const raw = [];
  const seen = new Set();
  function addUrl(u) {
    const t = String(u).trim().slice(0, 2048);
    if (!/^https?:\/\//i.test(t)) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    raw.push({ id: crypto.randomUUID(), kind: 'url', url: t });
  }
  for (const h of rowHyperlinkUrls || []) addUrl(h);
  const parts = String(attachmentsText || '')
    .split(/[,;|\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const p of parts) addUrl(p);
  for (const u of extractUrlsFromFreeText(attachmentsText)) addUrl(u);
  return JSON.stringify(normalizeMediaArray(raw));
}

/** Prefer storing real URLs in attachments field when hyperlinks exist (clickable in UI). */
function attachmentsDisplayText(attachmentsText, rowHyperlinkUrls) {
  if (rowHyperlinkUrls && rowHyperlinkUrls.length) {
    return rowHyperlinkUrls.join('; ');
  }
  return attachmentsText || null;
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
        const { rows, sheetName, sheet } = parseWorkbook(req.file.buffer);
        if (!rows.length) {
          return res.status(400).json({
            success: false,
            error: 'No data rows found. Use a worksheet whose first row includes a Title (or Issue) column.',
          });
        }
        const slice = rows.slice(0, MAX_ROWS);
        const headerOffset = 1;
        const maxOrd = await db.query(
          'SELECT COALESCE(MAX(sort_order),0) AS n FROM bonyad_issues WHERE sheet_slug=?',
          [slug]
        );
        let nextOrder = Number(maxOrd[0].n) + 1;
        let imported = 0;
        const skipped = [];
        const createdIssueIds = [];
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
          const attachmentsRaw = pickAttachments(m);
          const excelRow0 = headerOffset + i;
          const rowHyperUrls = sheet ? extractHyperlinkUrlsForRow(sheet, excelRow0) : [];
          const attachments = attachmentsDisplayText(attachmentsRaw, rowHyperUrls);
          const tagsFromCol = parseTags(pick(m, TAGS_KEYS));
          const tags =
            tagsFromCol.length > 0
              ? tagsFromCol
              : [module, issueType].filter((x) => x && String(x).trim());

          const isDone = statusToDone(sheetStatus) ? 1 : 0;
          const issueMediaJson = issueMediaFromExcelRow(attachmentsRaw, rowHyperUrls);

          const ins = await db.query(
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
          const newId = ins && ins.insertId != null ? Number(ins.insertId) : null;
          if (newId) createdIssueIds.push(newId);
          nextOrder += 1;
          imported += 1;
        }
        let revertBatchId = null;
        if (createdIssueIds.length) {
          revertBatchId = crypto.randomUUID();
          await db.query(
            `INSERT INTO bonyad_excel_import_batches (id, sheet_slug, issue_ids, issue_count) VALUES (?,?,?,?)`,
            [revertBatchId, slug, JSON.stringify(createdIssueIds), createdIssueIds.length]
          );
        }
        logger.info('[Bonyad] Excel import slug=%s sheet=%s imported=%d', slug, sheetName, imported);
        res.json({
          success: true,
          imported,
          skipped: skipped.length ? skipped : undefined,
          worksheet: sheetName,
          capped: rows.length > MAX_ROWS,
          revert_batch_id: revertBatchId,
        });
      } catch (e) {
        logger.error('[Bonyad] Excel import:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.post('/api/bonyad/sheets/:slug/issues/revert-excel-import', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').toLowerCase();
      const batchId = String((req.body && req.body.batch_id) || (req.body && req.body.batchId) || '').trim();
      if (!batchId || batchId.length > 40) {
        return res.status(400).json({ success: false, error: 'body.batch_id required (from last import response)' });
      }
      const sh = await db.query('SELECT slug FROM bonyad_sheets WHERE slug=?', [slug]);
      if (!sh.length) {
        return res.status(404).json({ success: false, error: 'Sheet not found' });
      }
      const batchRows = await db.query(
        'SELECT issue_ids FROM bonyad_excel_import_batches WHERE id=? AND sheet_slug=?',
        [batchId, slug]
      );
      if (!batchRows.length) {
        return res.status(404).json({
          success: false,
          error: 'Import batch not found or already reverted (wrong sheet or old session).',
        });
      }
      let rawIds = batchRows[0].issue_ids;
      if (typeof rawIds === 'string') {
        try {
          rawIds = JSON.parse(rawIds);
        } catch {
          rawIds = [];
        }
      }
      if (!Array.isArray(rawIds) || !rawIds.length) {
        await db.query('DELETE FROM bonyad_excel_import_batches WHERE id=?', [batchId]);
        return res.json({ success: true, deleted: 0 });
      }
      const ids = [...new Set(rawIds.map((x) => Number(x)).filter((n) => n > 0))];
      if (!ids.length) {
        await db.query('DELETE FROM bonyad_excel_import_batches WHERE id=?', [batchId]);
        return res.json({ success: true, deleted: 0 });
      }
      const ph = ids.map(() => '?').join(',');
      const found = await db.query(
        `SELECT * FROM bonyad_issues WHERE sheet_slug=? AND id IN (${ph})`,
        [slug, ...ids]
      );
      for (const row of found) {
        deleteUploadedFilesForIssueRow(row);
      }
      await db.query(`DELETE FROM bonyad_issues WHERE sheet_slug=? AND id IN (${ph})`, [slug, ...ids]);
      await db.query('DELETE FROM bonyad_excel_import_batches WHERE id=?', [batchId]);
      logger.info('[Bonyad] Excel import reverted slug=%s batch=%s deleted=%d', slug, batchId, found.length);
      res.json({ success: true, deleted: found.length });
    } catch (e) {
      logger.error('[Bonyad] revert Excel import:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { registerBonyadExcelRoutes, MAX_FILE_BYTES, MAX_ROWS };
