/**
 * Bonyad per-user key authentication middleware.
 *
 * Keys are resolved in this order:
 *  1. BONYAD_ADMIN_KEY env var  →  superadmin (role='admin'), works even before DB is seeded
 *  2. bonyad_users.api_key      →  named user with stored role
 *
 * Backwards-compat: the legacy BONYAD_EDIT_SECRET still passes as a generic 'developer'
 * so existing integrations keep working until migrated.
 */

const crypto = require('crypto');
const db = require('../database/connection');
const logger = require('../utils/logger');

const ADMIN_KEY   = (process.env.BONYAD_ADMIN_KEY   || '').trim();
const LEGACY_KEY  = (process.env.BONYAD_EDIT_SECRET || '').trim();

/** Extract the raw key string from header / query / body */
function extractKey(req) {
  return (
    (req.headers && req.headers['x-bonyad-edit-key']) ||
    (req.query   && req.query.editKey) ||
    (req.body    && req.body.editKey) ||
    ''
  );
}

/**
 * Resolve a key to a user object { id, name, role } or null.
 * Result is cached on req.bonyadUser after first call.
 */
async function resolveUser(req) {
  if (req.bonyadUser !== undefined) return req.bonyadUser;

  const key = String(extractKey(req) || '').trim();
  if (!key) {
    req.bonyadUser = null;
    return null;
  }

  // 1. Env-var admin key (works even with empty DB)
  if (ADMIN_KEY && key === ADMIN_KEY) {
    req.bonyadUser = { id: 0, name: 'Admin', role: 'admin', api_key: '[env]' };
    return req.bonyadUser;
  }

  // 2. Legacy single secret — treat as generic developer for backwards compat
  if (LEGACY_KEY && key === LEGACY_KEY) {
    req.bonyadUser = { id: -1, name: 'Developer', role: 'developer', api_key: '[legacy]' };
    return req.bonyadUser;
  }

  // 3. DB lookup
  try {
    const rows = await db.query(
      'SELECT id, name, role, api_key FROM bonyad_users WHERE api_key = ? AND is_active = 1 LIMIT 1',
      [key]
    );
    if (rows && rows.length > 0) {
      req.bonyadUser = rows[0];
      return req.bonyadUser;
    }
  } catch (e) {
    logger.warn('[BonyadAuth] DB lookup failed: %s', e.message);
  }

  req.bonyadUser = null;
  return null;
}

/** Express middleware — requires any valid user */
async function requireUser(req, res, next) {
  const user = await resolveUser(req);
  if (!user) {
    // If no auth system is configured at all, allow (open mode)
    if (!ADMIN_KEY && !LEGACY_KEY) return next();
    return res.status(403).json({ success: false, error: 'Invalid or missing Bonyad key.' });
  }
  next();
}

/** Express middleware — requires admin role */
async function requireAdmin(req, res, next) {
  const user = await resolveUser(req);
  if (!user) {
    if (!ADMIN_KEY && !LEGACY_KEY) return next(); // open mode
    return res.status(403).json({ success: false, error: 'Invalid or missing Bonyad key.' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
}

/** Generate a cryptographically random API key */
function generateApiKey() {
  return 'bk_' + crypto.randomBytes(24).toString('hex');
}

module.exports = { resolveUser, requireUser, requireAdmin, extractKey, generateApiKey };
