/**
 * Per-user config: API keys, GitLab, custom models.
 * Merges user_config table with shared-config fallback.
 */

const db = require('./connection');
const logger = require('../utils/logger');

const useDatabase = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return typeof value === 'string' ? JSON.parse(value) : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Get raw user config from DB (no fallback).
 * @returns {Promise<{ apiKeys: object, gitlab: object, customModels: object } | null>}
 */
async function getUserConfig(userId) {
  if (!useDatabase) return null;
  const key = String(userId);
  try {
    const rows = await db.query(
      'SELECT api_keys, gitlab, custom_models FROM user_config WHERE user_id = ?',
      [key]
    );
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      apiKeys: parseJson(row.api_keys, {}),
      gitlab: parseJson(row.gitlab, {}),
      customModels: parseJson(row.custom_models, {}),
    };
  } catch (error) {
    logger.error('[UserConfig] getUserConfig failed:', error.message);
    return null;
  }
}

/**
 * Set (upsert) user config in DB.
 * @param {string} userId
 * @param {{ apiKeys?: object, gitlab?: object, customModels?: object }} config
 */
async function setUserConfig(userId, config) {
  if (!useDatabase) {
    logger.warn('[UserConfig] DB not configured; setUserConfig no-op');
    return false;
  }
  const key = String(userId);
  const apiKeys = config.apiKeys != null ? config.apiKeys : {};
  const gitlab = config.gitlab != null ? config.gitlab : {};
  const customModels = config.customModels != null ? config.customModels : {};
  try {
    await db.query(
      `INSERT INTO user_config (user_id, api_keys, gitlab, custom_models)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         api_keys = VALUES(api_keys),
         gitlab = VALUES(gitlab),
         custom_models = VALUES(custom_models),
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(apiKeys), JSON.stringify(gitlab), JSON.stringify(customModels)]
    );
    logger.info('[UserConfig] Updated config for user', key);
    return true;
  } catch (error) {
    logger.error('[UserConfig] setUserConfig failed:', error.message);
    return false;
  }
}

/**
 * Get merged config for a user: user_config over shared-config fallback.
 * @param {string} userId
 * @returns {Promise<{ apiKeys: object, gitlab: object, customModels: object, telegram?: object }>}
 */
async function getConfigForUser(userId) {
  const sharedConfig = require('../utils/shared-config');
  const fallback = sharedConfig.getFullConfig();
  const base = {
    apiKeys: { ...(fallback.apiKeys || {}) },
    gitlab: { ...(fallback.gitlab || {}) },
    customModels: fallback.customModels ? { ...fallback.customModels } : {},
  };
  const user = await getUserConfig(userId);
  if (user) {
    if (user.apiKeys && Object.keys(user.apiKeys).length) {
      Object.assign(base.apiKeys, user.apiKeys);
    }
    if (user.gitlab && (user.gitlab.token != null || user.gitlab.namespace != null || user.gitlab.url != null)) {
      Object.assign(base.gitlab, user.gitlab);
    }
    if (user.customModels && Object.keys(user.customModels).length) {
      Object.assign(base.customModels, user.customModels);
    }
  }
  if (fallback.telegram) base.telegram = fallback.telegram;
  return base;
}

/**
 * List all user IDs that have config in DB (for admin UI).
 * @returns {Promise<string[]>}
 */
async function listUserIdsWithConfig() {
  if (!useDatabase) return [];
  try {
    const rows = await db.query('SELECT user_id FROM user_config ORDER BY updated_at DESC');
    return (rows || []).map((r) => r.user_id);
  } catch (error) {
    logger.error('[UserConfig] listUserIdsWithConfig failed:', error.message);
    return [];
  }
}

module.exports = {
  getUserConfig,
  setUserConfig,
  getConfigForUser,
  listUserIdsWithConfig,
  useDatabase,
};
