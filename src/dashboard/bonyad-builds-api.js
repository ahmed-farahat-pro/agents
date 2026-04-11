/**
 * Bonyad Build Distribution API — upload/download APK, IPA, ZIP builds per platform.
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db   = require('../database/connection');
const logger = require('../utils/logger');
const { requireUser, requireAdmin, resolveUser } = require('./bonyad-auth');
const { logAction } = require('./bonyad-logger');

const BUILDS_DIR  = path.join(__dirname, 'public', 'bonyad', 'builds');
const MAX_BUILD_SIZE = 200 * 1024 * 1024; // 200 MB

const VALID_PLATFORMS    = ['android', 'ios', 'web', 'backend'];
const VALID_ENVIRONMENTS = ['dev', 'staging', 'production'];
const ALLOWED_EXTS       = ['.apk', '.ipa', '.zip', '.aab', '.tar', '.gz', '.dmg'];

// Ensure base builds directory exists
if (!fs.existsSync(BUILDS_DIR)) {
  fs.mkdirSync(BUILDS_DIR, { recursive: true });
}

const buildStorage = multer.diskStorage({
  destination(req, file, cb) {
    const platform = String(req.body.platform || 'android').toLowerCase();
    const dir = path.join(BUILDS_DIR, platform);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, base);
  },
});

const buildUpload = multer({
  storage: buildStorage,
  limits:  { fileSize: MAX_BUILD_SIZE },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.includes(ext)) return cb(null, true);
    cb(new Error(`Only ${ALLOWED_EXTS.join(', ')} files are allowed`));
  },
});

function registerBonyadBuildsRoutes(app) {
  // ── List builds ────────────────────────────────────────────────────────────
  app.get('/api/bonyad/builds', async (req, res) => {
    try {
      const platform = req.query.platform || null;
      const where  = platform ? 'WHERE platform = ?' : '';
      const params = platform ? [platform] : [];
      const rows   = await db.query(
        `SELECT id, platform, environment, version, build_number, file_name,
                file_size, changelog, uploaded_by_name, download_count, created_at
         FROM bonyad_builds ${where}
         ORDER BY created_at DESC LIMIT 200`,
        params
      );
      res.json({ success: true, builds: rows });
    } catch (e) {
      logger.error('[BonyadBuilds] list:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Upload build ───────────────────────────────────────────────────────────
  app.post('/api/bonyad/builds', requireUser, buildUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const platform    = String(req.body.platform    || 'android').toLowerCase();
      const environment = String(req.body.environment || 'dev').toLowerCase();
      const version     = String(req.body.version     || '').trim() || null;
      const buildNumber = req.body.build_number ? parseInt(req.body.build_number, 10) : null;
      const changelog   = String(req.body.changelog   || '').trim() || null;

      if (!VALID_PLATFORMS.includes(platform)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: `Invalid platform. Use: ${VALID_PLATFORMS.join(', ')}` });
      }
      if (!VALID_ENVIRONMENTS.includes(environment)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: `Invalid environment. Use: ${VALID_ENVIRONMENTS.join(', ')}` });
      }

      const user = req.bonyadUser;
      // Relative web path  e.g. /bonyad/builds/android/...
      const relPath = `/bonyad/builds/${platform}/${req.file.filename}`;

      const result = await db.query(
        `INSERT INTO bonyad_builds
           (platform, environment, version, build_number, file_path, file_name,
            file_size, changelog, uploaded_by_id, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          platform, environment, version, buildNumber || null,
          relPath, req.file.originalname, req.file.size,
          changelog,
          user ? user.id   : null,
          user ? user.name : 'Unknown',
        ]
      );

      const user2 = await resolveUser(req);
      req.bonyadUser = req.bonyadUser || user2;
      await logAction(req, {
        action:      'build.uploaded',
        entityType:  'build',
        entityId:    String(result.insertId),
        entityTitle: `${platform} ${version || ''}`.trim(),
        sheetSlug:   null,
        metadata:    { platform, environment, version },
      });

      res.json({
        success: true,
        build: {
          id:           result.insertId,
          platform,
          environment,
          version,
          build_number: buildNumber,
          file_name:    req.file.originalname,
          file_size:    req.file.size,
          file_path:    relPath,
          changelog,
          uploaded_by_name: user ? user.name : 'Unknown',
          download_count: 0,
        },
      });
    } catch (e) {
      logger.error('[BonyadBuilds] upload:', e.message);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Download build (increments counter) ───────────────────────────────────
  app.get('/api/bonyad/builds/:id/download', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [row] = await db.query('SELECT * FROM bonyad_builds WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ success: false, error: 'Build not found' });

      const fullPath = path.join(__dirname, 'public', row.file_path.replace(/^\/bonyad\/builds\//, 'bonyad/builds/'));
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, error: 'File missing from disk' });
      }

      // Increment download counter async
      db.query('UPDATE bonyad_builds SET download_count = download_count + 1 WHERE id = ?', [id])
        .catch(e => logger.warn('[BonyadBuilds] download count:', e.message));

      res.download(fullPath, row.file_name || path.basename(row.file_path));
    } catch (e) {
      logger.error('[BonyadBuilds] download:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Delete build ───────────────────────────────────────────────────────────
  app.delete('/api/bonyad/builds/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [row] = await db.query('SELECT * FROM bonyad_builds WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ success: false, error: 'Build not found' });

      // Delete file
      try {
        const fullPath = path.join(__dirname, 'public', row.file_path.replace(/^\/bonyad\/builds\//, 'bonyad/builds/'));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (fe) {
        logger.warn('[BonyadBuilds] file delete:', fe.message);
      }

      await db.query('DELETE FROM bonyad_builds WHERE id = ?', [id]);

      await logAction(req, {
        action:     'build.deleted',
        entityType: 'build',
        entityId:   String(id),
        entityTitle: `${row.platform} ${row.version || ''}`.trim(),
      });

      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadBuilds] delete:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Designs: list ─────────────────────────────────────────────────────────
  app.get('/api/bonyad/designs', async (req, res) => {
    try {
      const platform = req.query.platform || null;
      const where    = platform ? 'WHERE platform = ?' : '';
      const params   = platform ? [platform] : [];
      const rows     = await db.query(
        `SELECT id, title, platform, figma_url, description, version,
                uploaded_by_id, sort_order, created_at, updated_at
         FROM bonyad_designs ${where}
         ORDER BY sort_order ASC, created_at DESC`,
        params
      );
      res.json({ success: true, designs: rows });
    } catch (e) {
      logger.error('[BonyadDesigns] list:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Designs: create ───────────────────────────────────────────────────────
  app.post('/api/bonyad/designs', requireUser, async (req, res) => {
    try {
      const title     = String(req.body.title     || '').trim();
      const platform  = String(req.body.platform  || '').trim() || null;
      const figmaUrl  = String(req.body.figma_url || '').trim() || null;
      const desc      = String(req.body.description || '').trim() || null;
      const version   = String(req.body.version   || '').trim() || null;
      const sortOrder = parseInt(req.body.sort_order || '0', 10);

      if (!title)    return res.status(400).json({ success: false, error: 'title is required' });
      if (!figmaUrl) return res.status(400).json({ success: false, error: 'figma_url is required' });

      const user = req.bonyadUser;
      const result = await db.query(
        `INSERT INTO bonyad_designs (title, platform, figma_url, description, version, uploaded_by_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, platform, figmaUrl, desc, version, user ? user.id : null, sortOrder]
      );

      await logAction(req, {
        action:     'design.added',
        entityType: 'design',
        entityId:   String(result.insertId),
        entityTitle: title,
        metadata:   { platform, version },
      });

      res.json({ success: true, id: result.insertId });
    } catch (e) {
      logger.error('[BonyadDesigns] create:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Designs: update ───────────────────────────────────────────────────────
  app.patch('/api/bonyad/designs/:id', requireUser, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const allowed = ['title', 'platform', 'figma_url', 'description', 'version', 'sort_order'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (!Object.keys(updates).length) return res.status(400).json({ success: false, error: 'Nothing to update' });
      const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await db.query(`UPDATE bonyad_designs SET ${sets} WHERE id = ?`, [...Object.values(updates), id]);
      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadDesigns] update:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Designs: delete ───────────────────────────────────────────────────────
  app.delete('/api/bonyad/designs/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const [row] = await db.query('SELECT title FROM bonyad_designs WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ success: false, error: 'Design not found' });
      await db.query('DELETE FROM bonyad_designs WHERE id = ?', [id]);
      await logAction(req, {
        action: 'design.deleted', entityType: 'design',
        entityId: String(id), entityTitle: row.title,
      });
      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadDesigns] delete:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { registerBonyadBuildsRoutes };
