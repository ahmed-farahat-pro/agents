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

/**
 * OpenAI key for smart import: env first, then Nigents shared-config.json (dashboard API keys).
 * Reloads from disk so keys saved in the UI work without restarting (next request picks them up).
 */
function resolveOpenAiApiKey() {
  const env =
    (process.env.OPENAI_API_KEY || process.env.BONYAD_OPENAI_API_KEY || '').trim();
  if (env) return env;
  try {
    const sharedConfig = require('../utils/shared-config');
    const fromFile = (sharedConfig.getApiKeys().OPENAI_API_KEY || '').trim();
    if (fromFile) return fromFile;
  } catch (e) {
    logger.warn('[Bonyad AI import] Could not read shared-config for OpenAI key:', e.message);
  }
  return '';
}

/** Normalize model output when it wraps JSON in markdown fences (rare with json_object mode). */
function parseOpenAiJsonContent(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  return JSON.parse(s);
}

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
    const okName = n.endsWith('.xlsx') || n.endsWith('.xls');
    const mt = String(file.mimetype || '').toLowerCase();
    const okMime =
      mt.includes('spreadsheet') ||
      mt.includes('excel') ||
      mt === 'application/vnd.ms-excel' ||
      mt === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (okName || okMime) {
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

/**
 * Excel "Module" is usually a product area (Technician Onboarding, Projects), NOT iOS/Android/Web.
 * Infer platform sheet from Type + title + description so rows are not all dumped into backend.
 * Override default client with BONYAD_IMPORT_DEFAULT_CLIENT_SLUG (default ios).
 */
function inferSheetSlugFromRow(row, allowedSlugs) {
  const set = new Set(allowedSlugs.map((s) => cleanSlug(s)).filter(Boolean));
  const title = String(row.title || '');
  const mod = String(row.module || '');
  const typ = String(row.issue_type || '');
  const snip = String(row.promptSnippet || '');
  const blob = `${title} ${mod} ${typ} ${snip}`.toLowerCase();
  const typL = typ.toLowerCase();

  const defClient = cleanSlug(process.env.BONYAD_IMPORT_DEFAULT_CLIENT_SLUG || 'ios') || 'ios';

  if (set.has('backend')) {
    if (/\bbackend\s*error\b/i.test(typL)) return 'backend';
    if (/\b(api|backend|server)\s*error\b/i.test(typL)) return 'backend';
    if (/\b(from backend|backend side|server-side|server side|only backend)\b/i.test(blob)) return 'backend';
    if (/\b(rest api|graphql|microservice|database migration|endpoint returns|502|500 error)\b/i.test(blob)) {
      if (!/\b(swift|swiftui|android|kotlin|webview|browser)\b/i.test(blob)) return 'backend';
    }
  }

  if (/\b(swift|swiftui|uikit|xcode|iphone|ipad|\bios\b|testflight|cocoapods)\b/i.test(blob) && set.has('ios')) {
    return 'ios';
  }
  if (/\b(android|kotlin|jetpack|play store|gradle|material you)\b/i.test(blob) && set.has('android')) {
    return 'android';
  }
  if (/\b(\bweb\b|website|browser|react\.?js|vue\.?js|angular|webpack|sass|responsive layout)\b/i.test(blob) && set.has('web')) {
    return 'web';
  }

  const backendOnlyPhrase =
    /\b(api\b|sql query|stored proc|lambda|ec2|kubernetes|nginx config)\b/i.test(blob) &&
    !/\b(screen|navigation|form|button|modal|view controller|fragment|activity)\b/i.test(blob);
  if (backendOnlyPhrase && set.has('backend')) return 'backend';

  // Spreadsheet "Type" column: explicit UI/UX work goes to default client sheet (Module is not a platform).
  if (
    /\b(ui\/ux|uiux|user experience|user expierence|user interface)\b/i.test(typL) &&
    set.has(defClient) &&
    !/\b(api returns|endpoint|database|sql|server returns|graphql|microservice)\b/i.test(blob)
  ) {
    return defClient;
  }

  // Generic bugs that usually describe API/sync/admin/data issues (not labeled "Backend Error" in Type).
  if (set.has('backend')) {
    if (
      /\b(sync failure|request sync|admin request|manage regions)\b/i.test(blob) ||
      /\bduplicate\b.*\b(creation|request|appointment)\b/i.test(blob) ||
      /\b(appointment request).*\b(duplicate|twice|double)\b/i.test(blob)
    ) {
      return 'backend';
    }
  }

  const uxClient =
    /\b(screen|navigation|form|button|modal|onboarding|profile|portfolio|upload|preview|picker|scroll|validation|misleading error|user experience|user expierence|phase|images|thumbnail|date picker|tab bar|gesture)\b/i.test(
      blob
    );
  const clientStackMention = /\b(swift|android|kotlin|web|ios|html|react)\b/i.test(blob);
  if (uxClient && !clientStackMention && set.has(defClient)) {
    return defClient;
  }

  // In-app workflow / subscription flows (no stack keywords in export).
  if (set.has(defClient)) {
    if (/\b(blocked edit|after rejection)\b/i.test(blob)) return defClient;
    if (/\bresubscribe\b/i.test(blob)) return defClient;
  }

  return null;
}

async function routeRowsWithOpenAI(rowsForAi, existingSheets) {
  const key = resolveOpenAiApiKey();
  if (!key) {
    throw new Error(
      'OpenAI API key is not configured. Set OPENAI_API_KEY (or BONYAD_OPENAI_API_KEY) in the server environment, ' +
        'or add the OpenAI key in the Nigents dashboard under API keys (saved to shared-config). Restart the process if you only use environment variables.'
    );
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

  const allowedSlugs = existingSheets.map((s) => cleanSlug(s.slug)).filter(Boolean);
  const preAssigned = new Map();
  for (let i = 0; i < rowsForAi.length; i += 1) {
    const inferred = inferSheetSlugFromRow(rowsForAi[i], allowedSlugs);
    if (inferred) {
      const sl = cleanSlug(inferred);
      if (allowedSlugs.includes(sl)) preAssigned.set(i, sl);
    }
  }

  const needAiIndices = [];
  for (let i = 0; i < rowsForAi.length; i += 1) {
    if (!preAssigned.has(i)) needAiIndices.push(i);
  }

  logger.info(
    '[Bonyad AI import] Routing: %d pre-classified (rules), %d sent to OpenAI',
    preAssigned.size,
    needAiIndices.length
  );

  const system = `You route bug tracker rows to the correct Bonyad "sheet" (platform / layer brief).
Return ONLY valid JSON (no markdown fences).

Existing sheets (use slug exactly as shown — match platform_line to the bug):
${sheetJson}

CRITICAL: The Excel field "module" is usually a PRODUCT FEATURE AREA (e.g. "Technician Onboarding", "Projects", "Payments"), NOT the tech platform. Do NOT send everything to "backend" just because the module sounds generic.

Assign to:
- **backend** — only when the bug is clearly server/API/database/infrastructure with no primary mobile or web UI work.
- **ios** — Swift, SwiftUI, UIKit, iPhone/iPad app UX, TestFlight, native iOS flows (even if module says "Projects").
- **android** — Kotlin, Android UI, Play Store, Jetpack.
- **web** — browser, React/Vue/Angular, website, web dashboard.

If the bug describes screens, forms, navigation, validation, onboarding UI, portfolios, uploads, and does NOT say backend/API-only, prefer **ios** or **android** or **web** over backend. Spread work across client sheets when text hints at different stacks.

User payload fields: prepIndex (global row index), title, module, issue_type, snippet.

Your JSON shape:
{
  "assignments": [{"prepIndex": number, "sheet_slug": "slug"}],
  "new_sheets": [{"slug":"lowercase-hyphens","label":"Name","platform_line":"optional","brief_title":"Brief title"}]
}

Rules:
- Include every prepIndex from the user message exactly once in assignments.
- sheet_slug: a-z, 0-9, hyphens only; must match an existing slug unless you add new_sheets first.
- Do not assign more than half of the batch to backend unless descriptions are genuinely server-only.`;

  const batchSize = 40;
  const allAssignments = [];
  for (const [prep, slug] of preAssigned) {
    allAssignments.push({ prepIndex: prep, sheet_slug: slug });
  }
  const newSheetsMap = new Map();

  const SNIP_LEN = 950;

  for (let b = 0; b < needAiIndices.length; b += batchSize) {
    const idxChunk = needAiIndices.slice(b, b + batchSize);
    const userPayload = idxChunk.map((prepIndex) => {
      const r = rowsForAi[prepIndex];
      return {
        prepIndex,
        title: r.title,
        module: r.module || '',
        issue_type: r.issue_type || '',
        snippet: (r.promptSnippet || '').slice(0, SNIP_LEN),
      };
    });

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Classify these ${userPayload.length} bugs. Each prepIndex below must appear exactly once in assignments:\n${JSON.stringify(userPayload)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = parseOpenAiJsonContent(raw);
    } catch (parseErr) {
      logger.error('[Bonyad AI import] JSON parse failed:', parseErr.message, raw.slice(0, 200));
      throw new Error('AI returned invalid JSON. Try again or switch BONYAD_IMPORT_AI_MODEL to gpt-4o-mini.');
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

function parseMultipartThenRequireEdit(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
    }
    requireBonyadEdit(req, res, next);
  });
}

function registerBonyadExcelAiRoutes(app) {
  const model = (process.env.BONYAD_IMPORT_AI_MODEL || 'gpt-4o-mini').trim();
  logger.info(
    '[Bonyad AI import] Smart import ready (model=%s). OpenAI key: env, BONYAD_OPENAI_API_KEY, or dashboard → shared-config (resolved per request).',
    model
  );

  app.post(
    '/api/bonyad/issues/import-excel-ai',
    parseMultipartThenRequireEdit,
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
          const msg = e.message || String(e);
          logger.error('[Bonyad AI import] OpenAI:', msg);
          const status =
            /not configured|OPENAI_API_KEY|API key/i.test(msg) || msg.includes('401')
              ? 503
              : 502;
          return res.status(status).json({ success: false, error: msg || 'AI routing failed' });
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
