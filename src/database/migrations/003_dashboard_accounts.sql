-- Dashboard login accounts (separate from Telegram users.id)
-- Run via migrate or auto-ensure on dashboard server boot.

CREATE TABLE IF NOT EXISTS dashboard_accounts (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dashboard_key_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dashboard_account_id INT UNSIGNED NOT NULL,
  provider VARCHAR(128) NOT NULL,
  notes TEXT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  FOREIGN KEY (dashboard_account_id) REFERENCES dashboard_accounts(id) ON DELETE CASCADE,
  INDEX idx_dkr_status (status),
  INDEX idx_dkr_account (dashboard_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
