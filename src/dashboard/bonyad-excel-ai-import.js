/**
 * AI-routed Excel import: assigns each row to a platform sheet via OpenAI.
 * Set OPENAI_API_KEY on the server (never commit keys). Optional: BONYAD_IMPORT_AI_MODEL (default gpt-4o-mini).
 */

const crypto = require('crypto');
const multer = require('multer');
const OpenAI = require('openai');
const db = require('../database/connection');
const logger = require('../utils/logger');
const { deleteUploadedFilesForIssueRow } = require('./bonyad-issue-media');
const { extractPreparedIssuesFromBuffer, MAX_FILE_BYTES } = require('./bonyad-excel-import');

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
  return res.status(403).json({ success: false, error: 'Invalid or missing edit key (BONYAD_EDIT_SECRET).' });
}

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

function cleanSlug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

async function routeRowsWithOpenAI(rowsForAi, existingSheets) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set on the server');
  }
  const model = (process.env.BONYAD_IMPORT_AI_MODEL || 'gpt-4o-mini').trim();
  const client = new OpenAI({ apiKey: key });

  const sheetJson = JSON.stringify(
    existingSheets.map((s) => ({
      slug: s.slug,
      label: s.label,
      platform_line: s.platform_line,
    }))
  );

  const system = `You route bug tracker rows to the correct Bonyad "sheet" (platform brief).
Return ONLY valid JSON (no markdown fences).

Existing sheets — prefer these when they fit:
${sheetJson}

User messages contain bugs with fields prepIndex (0-based, global), title, module, issue_type, snippet.

Your JSON shape:
{
  "assignments": [{"prepIndex": number, "sheet_slug": "slug"}],
  "new_sheets": [{"slug":"lowercase-hyphens","label":"Name","platform_line":"optional","brief_title":"Brief title"}]
}

Rules:
- In each response, include every prepIndex from that message exactly once in assignments.
- sheet_slug must use only a-z, 0-9, hyphens.
- If no existing sheet fits, add to new_sheets and use that slug in assignments.
- Prefer slugs like android, ios, web, backend when semantics match.`;

  const batchSize = 40;
  const allAssignments = [];
  const newSheetsMap = new Map();

  for (let start = 0; start < rowsForAi.length; start += batchSize) {
    const chunk = rowsForAi.slice(start, start + batchSize);
    const offset = start;
    const userPayload = chunk.map((r, j) => ({
      prepIndex: offset + j,
      title: r.title,
      module: r.module || '',
      issue_type: r.issue_type || '',
      snippet: (r.promptSnippet || '').slice(0, 450),
    }));

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Classify these ${chunk.length} bugs. Each prepIndex below must appear exactly once in assignments:\n${JSON.stringify(userPayload)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('AI returned invalid JSON');
    }
    const assigns = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    const news = Array.isArray(parsed.new_sheets) ? parsed.new_sheets : [];
    for (const ns of news) {
      const sl = cleanSlug(ns.slug);
      if (!sl) continue;
      newSheetsMap.set(sl, {
        slug: sl,
        label: String(ns.label || sl).slice(0, 255),
        platform_line: ns.platform_line ? String(ns.platform_line).slice(0, 255) : null,
        brief_title: String(ns.brief_title || `${ns.label || sl} — Developer fix brief`).slice(0, 500),
        brief_subtitle: null,
      });
    }
    for (const a of assigns) {
      if (a && typeof a.prepIndex === 'number' && a.sheet_slug) {
        allAssignments.push({ prepIndex: a.prepIndex, sheet_slug: cleanSlug(a.sheet_slug) });
      }
    }
  }

  return { assignments: allAssignments, newSheets: [...newSheetsMap.values()] };
}

function registerBonyadExcelAiRoutes(app) {
  app.post(
    '/api/bonyad/issues/import-excel-ai',
    requireBonyadEdit,
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ success: false, error: 'Missing file field "file"' });
        }
        const parsed = extractPreparedIssuesFromBuffer(req.file.buffer);
        if (parsed.parseError) {
          return res.status(400).json({ success: false, error: parsed.parseError });
        }
        const importable = parsed.prepared.filter((p) => !p.skipReason && p.data);
        const skipped = parsed.prepared
          .filter((p) => p.skipReason)
          .map((p) => ({ row: p.excelRow, reason: p.skipReason }));

        if (!importable.length) {
          return res.status(400).json({
            success: false,
            error: 'No importable rows (all skipped).',
            skipped,
          });
        }

        let existingSheets = await db.query(
          'SELECT slug, label, platform_line, sort_order FROM bonyad_sheets ORDER BY sort_order ASC, slug ASC'
        );
        if (!existingSheets.length) {
          return res.status(400).json({
            success: false,
            error: 'Create at least one Bonyad sheet before AI import.',
          });
        }

        const rowsForAi = importable.map((p) => ({
          title: p.data.title,
          module: p.data.module,
          issue_type: p.data.issue_type,
          promptSnippet: p.data.promptText,
        }));

        let ai;
        try {
          ai = await routeRowsWithOpenAI(rowsForAi, existingSheets);
        } catch (e) {
          logger.error('[Bonyad AI import] OpenAI:', e.message);
          return res.status(502).json({ success: false, error: e.message || 'AI routing failed' });
        }

        const existingSlugs = new Set(existingSheets.map((s) => s.slug));
        const maxSortRows = await db.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM bonyad_sheets');
        let nextSheetOrder = Number(maxSortRows[0].n) || 1;
        const newSheetsCreated = [];

        for (const ns of ai.newSheets) {
          if (!ns.slug || existingSlugs.has(ns.slug)) continue;
          await db.query(
            `INSERT INTO bonyad_sheets (slug, label, platform_line, brief_title, brief_subtitle, status_label, sort_order)
             VALUES (?,?,?,?,?,?,?)`,
            [
              ns.slug,
              ns.label,
              ns.platform_line,
              ns.brief_title,
              ns.brief_subtitle,
              'Draft',
              nextSheetOrder,
            ]
          );
          nextSheetOrder += 1;
          existingSlugs.add(ns.slug);
          newSheetsCreated.push({ slug: ns.slug, label: ns.label });
          logger.info('[Bonyad AI import] created sheet %s', ns.slug);
        }

        const sheetsAfter = await db.query(
          'SELECT slug, label, platform_line FROM bonyad_sheets ORDER BY sort_order ASC, slug ASC'
        );
        const slugSet = new Set(sheetsAfter.map((s) => s.slug));
        const fallbackSlug = sheetsAfter[0].slug;

        const byPrep = new Map();
        for (const a of ai.assignments) {
          if (a.sheet_slug) {
            byPrep.set(a.prepIndex, a.sheet_slug);
          }
        }

        const nextOrderBySlug = {};
        async function allocOrder(sheetSlug) {
          if (nextOrderBySlug[sheetSlug] == null) {
            const r = await db.query(
              'SELECT COALESCE(MAX(sort_order),0) AS n FROM bonyad_issues WHERE sheet_slug=?',
              [sheetSlug]
            );
            nextOrderBySlug[sheetSlug] = Number(r[0].n) + 1;
          }
          const o = nextOrderBySlug[sheetSlug];
          nextOrderBySlug[sheetSlug] += 1;
          return o;
        }

        const createdIssueIds = [];
        const breakdown = {};

        for (let prepIndex = 0; prepIndex < importable.length; prepIndex += 1) {
          let targetSlug = byPrep.get(prepIndex) || fallbackSlug;
          if (!slugSet.has(targetSlug)) {
            targetSlug = fallbackSlug;
          }
          const d = importable[prepIndex].data;
          const ord = await allocOrder(targetSlug);
          const ins = await db.query(
            `INSERT INTO bonyad_issues (sheet_slug, sort_order, module, issue_type, sheet_status, attachments, title, priority, tags, prompt_text, criteria, issue_media, is_done)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              targetSlug,
              ord,
              d.module ? d.module.slice(0, 255) : null,
              d.issue_type ? d.issue_type.slice(0, 128) : null,
              d.sheet_status ? d.sheet_status.slice(0, 128) : null,
              d.attachments,
              d.title,
              d.priority,
              JSON.stringify(d.tags.filter(Boolean)),
              d.promptText,
              JSON.stringify(d.criteria),
              d.issueMediaJson,
              d.isDone,
            ]
          );
          const newId = ins && ins.insertId != null ? Number(ins.insertId) : null;
          if (newId) {
            createdIssueIds.push(newId);
            breakdown[targetSlug] = (breakdown[targetSlug] || 0) + 1;
          }
        }

        let revertBatchId = null;
        if (createdIssueIds.length) {
          revertBatchId = crypto.randomUUID();
          await db.query(
            `INSERT INTO bonyad_smart_import_batches (id, issue_ids, breakdown) VALUES (?,?,?)`,
            [revertBatchId, JSON.stringify(createdIssueIds), JSON.stringify(breakdown)]
          );
        }

        const breakdownList = Object.entries(breakdown).map(([sl, count]) => {
          const sh = sheetsAfter.find((s) => s.slug === sl);
          return {
            slug: sl,
            count,
            label: sh ? sh.label : sl,
            platform_line: sh ? sh.platform_line : null,
          };
        });

        logger.info('[Bonyad AI import] imported=%d sheets_touched=%d', createdIssueIds.length, breakdownList.length);
        res.json({
          success: true,
          imported: createdIssueIds.length,
          skipped: skipped.length ? skipped : undefined,
          worksheet: parsed.sheetName,
          capped: parsed.capped,
          breakdown: breakdownList,
          new_sheets_created: newSheetsCreated,
          revert_batch_id: revertBatchId,
        });
      } catch (e) {
        logger.error('[Bonyad AI import]:', e.message);
        res.status(500).json({ success: false, error: e.message });
      }
    }
  );

  app.post('/api/bonyad/issues/revert-smart-import', requireBonyadEdit, async (req, res) => {
    try {
      const batchId = String((req.body && req.body.batch_id) || (req.body && req.body.batchId) || '').trim();
      if (!batchId || batchId.length > 40) {
        return res.status(400).json({ success: false, error: 'batch_id required' });
      }
      const batchRows = await db.query('SELECT issue_ids FROM bonyad_smart_import_batches WHERE id=?', [batchId]);
      if (!batchRows.length) {
        return res.status(404).json({ success: false, error: 'Batch not found or already reverted.' });
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
        await db.query('DELETE FROM bonyad_smart_import_batches WHERE id=?', [batchId]);
        return res.json({ success: true, deleted: 0 });
      }
      const ids = [...new Set(rawIds.map((x) => Number(x)).filter((n) => n > 0))];
      if (!ids.length) {
        await db.query('DELETE FROM bonyad_smart_import_batches WHERE id=?', [batchId]);
        return res.json({ success: true, deleted: 0 });
      }
      const ph = ids.map(() => '?').join(',');
      const found = await db.query(`SELECT * FROM bonyad_issues WHERE id IN (${ph})`, ids);
      for (const row of found) {
        deleteUploadedFilesForIssueRow(row);
      }
      await db.query(`DELETE FROM bonyad_issues WHERE id IN (${ph})`, ids);
      await db.query('DELETE FROM bonyad_smart_import_batches WHERE id=?', [batchId]);
      logger.info('[Bonyad AI import] reverted batch=%s deleted=%d', batchId, found.length);
      res.json({ success: true, deleted: found.length });
    } catch (e) {
      logger.error('[Bonyad revert smart import]:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { registerBonyadExcelAiRoutes };
