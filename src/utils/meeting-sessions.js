/**
 * Short-lived meeting sessions (Telegram → browser voice room + Jitsi link).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'meeting-sessions.json');
const TTL_MS = (parseInt(process.env.MEETING_SESSION_TTL_HOURS || '24', 10) || 24) * 60 * 60 * 1000;

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function loadMap() {
  ensureDir();
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (_) {
    return {};
  }
}

function saveMap(map) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(map, null, 2), 'utf8');
}

function prune(map) {
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(map)) {
    if (!map[k].expiresAt || map[k].expiresAt < now) {
      delete map[k];
      changed = true;
    }
  }
  if (changed) saveMap(map);
}

/**
 * Public base URL for links (Telegram, emails). No trailing slash.
 */
function getPublicDashboardUrl() {
  const u = (process.env.PUBLIC_DASHBOARD_URL || process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  if (u) return u;
  const port = process.env.DASHBOARD_PORT || '4000';
  return `http://localhost:${port}`;
}

function createSession(meta = {}) {
  const map = loadMap();
  prune(map);
  const token = crypto.randomBytes(24).toString('hex');
  const roomSlug = `nigents-${crypto.randomBytes(8).toString('hex')}`;
  let domain = (process.env.JITSI_DOMAIN || 'meet.jit.si').trim();
  domain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const jitsiUrl = `https://${domain}/${encodeURIComponent(roomSlug)}`;
  const session = {
    token,
    roomSlug,
    jitsiUrl,
    jitsiDomain: domain,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    telegramUserId: meta.telegramUserId != null ? String(meta.telegramUserId) : null,
  };
  map[token] = session;
  saveMap(map);
  return session;
}

function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const map = loadMap();
  prune(map);
  const s = map[token];
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}

module.exports = {
  createSession,
  getSession,
  getPublicDashboardUrl,
};
