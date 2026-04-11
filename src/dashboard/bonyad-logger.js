/**
 * Bonyad activity logger + notification fan-out.
 *
 * Usage (inside any Bonyad API handler, after DB success):
 *   await logAction(req, {
 *     action:       'issue.created',
 *     entityType:   'issue',
 *     entityId:     String(newId),
 *     entityTitle:  title,
 *     sheetSlug:    slug,
 *     metadata:     { priority }       // optional extra data
 *   });
 *
 * The io instance (Socket.io) must be injected once via setIo(io).
 */

const db = require('../database/connection');
const logger = require('../utils/logger');

let _io = null;

function setIo(io) {
  _io = io;
}

// Human-readable verbs for each action key
const ACTION_LABELS = {
  'issue.created':         ['created issue',         'issue'],
  'issue.updated':         ['updated issue',         'issue'],
  'issue.deleted':         ['deleted issue',         'issue'],
  'issue.status.done':     ['marked issue done',     'issue'],
  'issue.status.in_progress': ['started working on', 'issue'],
  'issue.status.open':     ['reopened issue',        'issue'],
  'issue.media.added':     ['added attachment to',   'issue'],
  'issue.media.deleted':   ['removed attachment from','issue'],
  'sheet.created':         ['created sheet',         'sheet'],
  'sheet.deleted':         ['deleted sheet',         'sheet'],
  'build.uploaded':        ['uploaded a build for',  'build'],
  'build.deleted':         ['deleted build',         'build'],
  'design.added':          ['added design',          'design'],
  'design.deleted':        ['deleted design',        'design'],
};

/** Build the navigate-to URL for a notification */
function buildNavigateTo({ entityType, entityId, sheetSlug }) {
  if (entityType === 'issue' && sheetSlug) {
    return `/bonyad/sheet.html?slug=${sheetSlug}#issue-${entityId}`;
  }
  if (entityType === 'sheet' && sheetSlug) {
    return `/bonyad/sheet.html?slug=${sheetSlug}`;
  }
  if (entityType === 'build') {
    return '/bonyad/builds.html';
  }
  if (entityType === 'design') {
    return '/bonyad/designs.html';
  }
  return '/bonyad/';
}

/**
 * Log an action to bonyad_activity_log, write a notification row, and emit via Socket.io.
 *
 * @param {import('express').Request} req
 * @param {{ action: string, entityType: string, entityId?: string,
 *           entityTitle?: string, sheetSlug?: string, metadata?: object }} opts
 */
async function logAction(req, { action, entityType, entityId, entityTitle, sheetSlug, metadata }) {
  const user = req.bonyadUser || null;
  const userId   = user ? user.id   : null;
  const userName = user ? user.name : 'Unknown';
  const userRole = user ? user.role : null;

  const ip = (
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    null
  );

  // 1. Write activity log (fire and forget, non-blocking)
  db.query(
    `INSERT INTO bonyad_activity_log
       (user_id, user_name, user_role, action, entity_type, entity_id, entity_title, sheet_slug, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      userName,
      userRole,
      action,
      entityType || null,
      entityId   ? String(entityId) : null,
      entityTitle ? String(entityTitle).substring(0, 512) : null,
      sheetSlug  || null,
      metadata   ? JSON.stringify(metadata) : null,
      ip,
    ]
  ).catch(e => logger.warn('[BonyadLogger] activity log write failed: %s', e.message));

  // 2. Build notification
  const [verb] = ACTION_LABELS[action] || ['performed action on', entityType || 'item'];
  const notifTitle   = `${userName} ${verb}`;
  const notifMessage = entityTitle ? `"${entityTitle.substring(0, 200)}"` : '';
  const navigateTo   = buildNavigateTo({ entityType, entityId, sheetSlug });

  let notifId = null;
  try {
    const result = await db.query(
      `INSERT INTO bonyad_notifications
         (type, title, message, entity_type, entity_id, sheet_slug, triggered_by_id, triggered_by_name, read_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
      [
        action,
        notifTitle,
        notifMessage,
        entityType || null,
        entityId   ? String(entityId) : null,
        sheetSlug  || null,
        userId,
        userName,
      ]
    );
    notifId = result.insertId;
  } catch (e) {
    logger.warn('[BonyadLogger] notification write failed: %s', e.message);
  }

  // 3. Emit via Socket.io (broadcast to everyone in the 'bonyad' room)
  if (_io && notifId) {
    const payload = {
      id:                notifId,
      type:              action,
      title:             notifTitle,
      message:           notifMessage,
      entityType:        entityType  || null,
      entityId:          entityId    ? String(entityId) : null,
      sheetSlug:         sheetSlug   || null,
      triggeredByName:   userName,
      navigateTo,
      createdAt:         new Date().toISOString(),
    };
    _io.to('bonyad').emit('bonyad:notification', payload);
  }
}

module.exports = { setIo, logAction };
