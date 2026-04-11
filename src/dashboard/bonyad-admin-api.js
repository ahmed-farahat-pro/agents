/**
 * Bonyad Admin API — user management + activity feed.
 * All routes require admin role via bonyad-auth.js.
 */

const db = require('../database/connection');
const logger = require('../utils/logger');
const { requireAdmin, generateApiKey } = require('./bonyad-auth');

const VALID_ROLES = ['admin', 'developer', 'designer', 'tester'];

function registerBonyadAdminRoutes(app) {
  // ── List all users ────────────────────────────────────────────────────────
  app.get('/api/bonyad/admin/users', requireAdmin, async (req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, name, role,
                CONCAT(LEFT(api_key, 10), '••••••••') AS key_preview,
                is_active, created_at
         FROM bonyad_users
         ORDER BY created_at DESC`
      );
      res.json({ success: true, users: rows });
    } catch (e) {
      logger.error('[BonyadAdmin] list users:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Create user ───────────────────────────────────────────────────────────
  app.post('/api/bonyad/admin/users', requireAdmin, async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      const role = String(req.body.role || 'developer').trim();

      if (!name) return res.status(400).json({ success: false, error: 'name is required' });
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, error: `role must be one of: ${VALID_ROLES.join(', ')}` });
      }

      const apiKey = generateApiKey();
      const adminUser = req.bonyadUser;

      const result = await db.query(
        `INSERT INTO bonyad_users (name, role, api_key, created_by) VALUES (?, ?, ?, ?)`,
        [name, role, apiKey, adminUser ? adminUser.id : null]
      );

      // Return the full key exactly once
      res.json({
        success: true,
        user: {
          id: result.insertId,
          name,
          role,
          api_key: apiKey,   // Only time the full key is returned
          is_active: 1,
        },
        warning: 'Save this key — it will never be shown again.',
      });
    } catch (e) {
      logger.error('[BonyadAdmin] create user:', e.message);
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: 'A user with that key already exists (collision — retry).' });
      }
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Update user (name / role / is_active) ─────────────────────────────────
  app.patch('/api/bonyad/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, error: 'invalid id' });

      const updates = {};
      if (req.body.name  !== undefined) updates.name      = String(req.body.name).trim();
      if (req.body.role  !== undefined) {
        const r = String(req.body.role).trim();
        if (!VALID_ROLES.includes(r)) return res.status(400).json({ success: false, error: 'invalid role' });
        updates.role = r;
      }
      if (req.body.is_active !== undefined) updates.is_active = req.body.is_active ? 1 : 0;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'Nothing to update' });
      }

      const sets  = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const vals  = [...Object.values(updates), id];
      await db.query(`UPDATE bonyad_users SET ${sets} WHERE id = ?`, vals);
      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadAdmin] update user:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Deactivate (soft-delete) user ─────────────────────────────────────────
  app.delete('/api/bonyad/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
      await db.query(`UPDATE bonyad_users SET is_active = 0 WHERE id = ?`, [id]);
      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadAdmin] deactivate user:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Rotate API key ────────────────────────────────────────────────────────
  app.post('/api/bonyad/admin/users/:id/rotate-key', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return res.status(400).json({ success: false, error: 'invalid id' });
      const newKey = generateApiKey();
      await db.query(`UPDATE bonyad_users SET api_key = ? WHERE id = ?`, [newKey, id]);
      res.json({
        success: true,
        api_key: newKey,
        warning: 'Save this key — it will never be shown again.',
      });
    } catch (e) {
      logger.error('[BonyadAdmin] rotate key:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Activity feed ─────────────────────────────────────────────────────────
  app.get('/api/bonyad/admin/activity', requireAdmin, async (req, res) => {
    try {
      const page      = Math.max(1, parseInt(req.query.page  || '1', 10));
      const limit     = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const offset    = (page - 1) * limit;
      const userId    = req.query.user_id  ? parseInt(req.query.user_id,  10) : null;
      const sheetSlug = req.query.sheet_slug || null;
      const action    = req.query.action     || null;
      const dateFrom  = req.query.date_from  || null;
      const dateTo    = req.query.date_to    || null;

      const conditions = [];
      const params     = [];

      if (userId)    { conditions.push('user_id = ?');    params.push(userId); }
      if (sheetSlug) { conditions.push('sheet_slug = ?'); params.push(sheetSlug); }
      if (action)    { conditions.push('action = ?');     params.push(action); }
      if (dateFrom)  { conditions.push('created_at >= ?');params.push(dateFrom); }
      if (dateTo)    { conditions.push('created_at <= ?');params.push(dateTo + ' 23:59:59'); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [total] = await db.query(`SELECT COUNT(*) AS c FROM bonyad_activity_log ${where}`, params);
      const rows    = await db.query(
        `SELECT id, user_id, user_name, user_role, action, entity_type, entity_id,
                entity_title, sheet_slug, metadata, ip_address, created_at
         FROM bonyad_activity_log ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        total: total.c,
        page,
        limit,
        rows,
      });
    } catch (e) {
      logger.error('[BonyadAdmin] activity feed:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Resolve own user identity (for UI login display) ─────────────────────
  app.get('/api/bonyad/me', async (req, res) => {
    // Use bonyad-auth resolveUser lazily
    const { resolveUser } = require('./bonyad-auth');
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
  });

  // ── Notifications: list ───────────────────────────────────────────────────
  app.get('/api/bonyad/notifications', async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
      const rows  = await db.query(
        `SELECT id, type, title, message, entity_type, entity_id,
                sheet_slug, triggered_by_name, read_by, created_at
         FROM bonyad_notifications
         ORDER BY created_at DESC LIMIT ?`,
        [limit]
      );
      // Build navigateTo for each row
      const { resolveUser } = require('./bonyad-auth');
      const user    = await resolveUser(req);
      const userId  = user ? String(user.id) : null;
      const result  = rows.map(r => {
        const readBy = (typeof r.read_by === 'string') ? JSON.parse(r.read_by || '{}') : (r.read_by || {});
        return {
          ...r,
          read_by:    readBy,
          is_read:    userId ? !!readBy[userId] : false,
          navigateTo: buildNavigateTo(r),
        };
      });
      res.json({ success: true, notifications: result });
    } catch (e) {
      logger.error('[BonyadAdmin] notifications list:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Notifications: mark all read ─────────────────────────────────────────
  app.post('/api/bonyad/notifications/read-all', async (req, res) => {
    try {
      const { resolveUser } = require('./bonyad-auth');
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ success: false, error: 'Unauthenticated' });

      const userId  = String(user.id);
      const nowIso  = new Date().toISOString();
      // Update read_by JSON for all rows not yet read by this user
      await db.query(
        `UPDATE bonyad_notifications
         SET read_by = JSON_SET(COALESCE(read_by, '{}'), ?, ?)
         WHERE JSON_VALUE(read_by, ?) IS NULL`,
        [`$.${userId}`, nowIso, `$.${userId}`]
      );
      res.json({ success: true });
    } catch (e) {
      logger.error('[BonyadAdmin] mark-read:', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

/** Build navigate-to URL from notification row */
function buildNavigateTo(row) {
  const { entity_type, entity_id, sheet_slug } = row;
  if (entity_type === 'issue' && sheet_slug) {
    return `/bonyad/sheet.html?slug=${sheet_slug}#issue-${entity_id}`;
  }
  if (entity_type === 'sheet' && sheet_slug) {
    return `/bonyad/sheet.html?slug=${sheet_slug}`;
  }
  if (entity_type === 'build')  return '/bonyad/builds.html';
  if (entity_type === 'design') return '/bonyad/designs.html';
  return '/bonyad/';
}

module.exports = { registerBonyadAdminRoutes };
