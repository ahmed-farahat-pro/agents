/**
 * Dashboard web login accounts + org API key approval workflow.
 * Links each account to a Telegram user id for per-user user_config (bot + dashboard).
 */

const crypto = require('crypto');
const db = require('./connection');
const logger = require('../utils/logger');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, 64, SCRYPT_OPTS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const hash = crypto.scryptSync(String(plain), salt, 64, SCRYPT_OPTS);
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

const PROVIDER_ALIASES = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

function normalizeProviderKey(p) {
  const s = String(p || '').trim();
  if (!s) return null;
  if (/^[A-Z][A-Z0-9_]*$/.test(s)) return s;
  const k = PROVIDER_ALIASES[s.toLowerCase()];
  return k || null;
}

async function ensureTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS dashboard_accounts (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL,
      password_hash VARCHAR(512) NOT NULL,
      display_name VARCHAR(200) NULL,
      role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
      telegram_user_id VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_dashboard_username (username),
      UNIQUE KEY uk_dashboard_telegram (telegram_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS dashboard_key_requests (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      dashboard_account_id INT UNSIGNED NOT NULL,
      provider VARCHAR(128) NOT NULL,
      notes TEXT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      admin_note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL,
      INDEX idx_dkr_status (status),
      INDEX idx_dkr_account (dashboard_account_id),
      CONSTRAINT fk_dkr_account FOREIGN KEY (dashboard_account_id) REFERENCES dashboard_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of statements) {
    await db.query(sql);
  }
  logger.info('[DashboardAccounts] Tables ensured');
}

/**
 * @returns {Promise<null | { id, username, role, onboarding_completed, telegram_user_id }>}
 */
async function verifyLogin(username, password) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return null;
  const rows = await db.query(
    'SELECT id, username, password_hash, role, onboarding_completed, telegram_user_id FROM dashboard_accounts WHERE LOWER(username) = ? LIMIT 1',
    [u]
  );
  const row = rows && rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    onboarding_completed: !!row.onboarding_completed,
    telegram_user_id: row.telegram_user_id || null,
  };
}

async function createAccount({ username, password, role = 'user', displayName }) {
  const un = String(username || '').trim().toLowerCase();
  if (un.length < 3 || un.length > 100) {
    throw new Error('Username must be 3–100 characters');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(un)) {
    throw new Error('Username may only contain letters, numbers, . _ -');
  }
  if (!password || String(password).length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const r = role === 'admin' ? 'admin' : 'user';
  const hash = hashPassword(password);
  const dn = displayName ? String(displayName).trim().slice(0, 200) : null;
  try {
    const result = await db.query(
      `INSERT INTO dashboard_accounts (username, password_hash, display_name, role, onboarding_completed)
       VALUES (?, ?, ?, ?, 0)`,
      [un, hash, dn, r]
    );
    const id = result.insertId;
    return { id, username: un, role: r };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new Error('Username already exists');
    throw e;
  }
}

async function listAccounts() {
  const rows = await db.query(
    `SELECT id, username, display_name, role, onboarding_completed, telegram_user_id, created_at
     FROM dashboard_accounts ORDER BY created_at DESC`
  );
  return (rows || []).map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    onboardingCompleted: !!row.onboarding_completed,
    telegramUserId: row.telegram_user_id || null,
    createdAt: row.created_at,
  }));
}

async function getAccountById(id) {
  const rows = await db.query(
    'SELECT id, username, role, onboarding_completed, telegram_user_id FROM dashboard_accounts WHERE id = ? LIMIT 1',
    [id]
  );
  return rows && rows[0] ? rows[0] : null;
}

/**
 * Link Telegram user id, mark onboarding done, seed users + user_config.
 */
async function completeOnboarding(accountId, telegramUserId, { gitlab = {}, apiKeys = {} }, userConfigModule) {
  const tg = String(telegramUserId || '').trim();
  if (!/^\d+$/.test(tg)) {
    throw new Error('Telegram user ID must be numeric (from @userinfobot or Telegram profile)');
  }

  const taken = await db.query(
    'SELECT id FROM dashboard_accounts WHERE telegram_user_id = ? AND id != ? LIMIT 1',
    [tg, accountId]
  );
  if (taken && taken.length) {
    throw new Error('This Telegram ID is already linked to another dashboard account');
  }

  await db.transaction(async (conn) => {
    const [accRows] = await conn.execute(
      'SELECT id FROM dashboard_accounts WHERE id = ? FOR UPDATE',
      [accountId]
    );
    if (!accRows || !accRows.length) throw new Error('Account not found');

    await conn.execute(
      `INSERT INTO users (id, first_name, is_bot) VALUES (?, NULL, FALSE)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [tg]
    );
    await conn.execute('INSERT IGNORE INTO user_settings (user_id) VALUES (?)', [tg]);

    await conn.execute(
      `UPDATE dashboard_accounts
       SET telegram_user_id = ?, onboarding_completed = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tg, accountId]
    );
  });

  if (userConfigModule) {
    const existing = (await userConfigModule.getUserConfig(tg)) || {};
    const mergedKeys = { ...(existing.apiKeys || {}), ...(apiKeys || {}) };
    const mergedGitlab = { ...(existing.gitlab || {}), ...(gitlab || {}) };
    await userConfigModule.setUserConfig(tg, {
      apiKeys: mergedKeys,
      gitlab: mergedGitlab,
      customModels: existing.customModels || {},
    });
  }

  logger.info('[DashboardAccounts] Onboarding complete for account', accountId, 'telegram', tg);
  return { telegramUserId: tg };
}

async function createKeyRequest(accountId, provider, notes) {
  const key = normalizeProviderKey(provider);
  if (!key) {
    throw new Error('Unknown provider. Use: openai, anthropic, zhipu, moonshot, deepseek, or env key name');
  }
  const result = await db.query(
    `INSERT INTO dashboard_key_requests (dashboard_account_id, provider, notes, status)
     VALUES (?, ?, ?, 'pending')`,
    [accountId, key, notes ? String(notes).slice(0, 2000) : null]
  );
  return { id: result.insertId, provider: key };
}

async function listKeyRequestsForAccount(accountId) {
  const rows = await db.query(
    `SELECT id, provider, notes, status, admin_note, created_at, reviewed_at
     FROM dashboard_key_requests WHERE dashboard_account_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [accountId]
  );
  return rows || [];
}

async function listKeyRequests(status = null) {
  let sql = `
    SELECT r.id, r.dashboard_account_id, r.provider, r.notes, r.status, r.admin_note, r.created_at, r.reviewed_at,
           a.username AS account_username
    FROM dashboard_key_requests r
    JOIN dashboard_accounts a ON a.id = r.dashboard_account_id
  `;
  const params = [];
  if (status) {
    sql += ' WHERE r.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.created_at DESC LIMIT 200';
  const rows = await db.query(sql, params);
  return rows || [];
}

async function reviewKeyRequest(requestId, status, adminNote, userConfigModule) {
  const sid = parseInt(requestId, 10);
  if (!sid) throw new Error('Invalid request id');
  const st = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : null;
  if (!st) throw new Error('status must be approved or rejected');

  const rows = await db.query(
    'SELECT * FROM dashboard_key_requests WHERE id = ? LIMIT 1',
    [sid]
  );
  const req = rows && rows[0];
  if (!req) throw new Error('Request not found');
  if (req.status !== 'pending') throw new Error('Request already reviewed');

  await db.query(
    `UPDATE dashboard_key_requests
     SET status = ?, admin_note = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [st, adminNote ? String(adminNote).slice(0, 2000) : null, sid]
  );

  if (st === 'approved' && userConfigModule) {
    const acc = await getAccountById(req.dashboard_account_id);
    const tg = acc && acc.telegram_user_id;
    if (!tg) {
      throw new Error('User must finish onboarding before keys can be granted');
    }
    const sharedConfig = require('../utils/shared-config');
    const full = sharedConfig.getFullConfig();
    const envKey = req.provider;
    const val = full.apiKeys && full.apiKeys[envKey];
    if (!val) {
      logger.warn('[DashboardAccounts] Approved key request but shared config missing', envKey);
    } else {
      const existing = (await userConfigModule.getUserConfig(tg)) || {};
      const apiKeys = { ...(existing.apiKeys || {}), [envKey]: val };
      await userConfigModule.setUserConfig(tg, {
        apiKeys,
        gitlab: existing.gitlab || {},
        customModels: existing.customModels || {},
      });
      logger.info('[DashboardAccounts] Copied shared key to user', envKey, tg);
    }
  }

  return { ok: true, status: st };
}

module.exports = {
  ensureTables,
  verifyLogin,
  createAccount,
  listAccounts,
  getAccountById,
  completeOnboarding,
  createKeyRequest,
  listKeyRequestsForAccount,
  listKeyRequests,
  reviewKeyRequest,
  normalizeProviderKey,
  hashPassword,
};
