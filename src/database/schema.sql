-- =====================================================
-- Nigents Database Schema
-- MySQL Database for persistent storage
-- =====================================================

CREATE DATABASE IF NOT EXISTS nigents 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE nigents;

-- =====================================================
-- Users Table
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  username VARCHAR(100),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  language_code VARCHAR(10),
  is_bot BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NULL,
  INDEX idx_last_active (last_active_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- User Settings Table
-- =====================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(50) PRIMARY KEY,
  voice_response BOOLEAN DEFAULT TRUE,
  language VARCHAR(10) DEFAULT 'auto',
  default_project VARCHAR(255),
  preferred_ai VARCHAR(50),
  preferred_model VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Chat Messages Table
-- =====================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  role ENUM('user', 'assistant', 'system', 'tool') NOT NULL,
  content TEXT NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Pending Plans Table
-- =====================================================
CREATE TABLE IF NOT EXISTS pending_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  task TEXT NOT NULL,
  chat_id VARCHAR(50),
  username VARCHAR(100),
  project_id VARCHAR(100),
  project_name VARCHAR(255),
  plan_data JSON,
  status ENUM('pending', 'approved', 'rejected', 'expired') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Tasks Table (Task Queue)
-- =====================================================
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(100) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  description TEXT,
  status ENUM('pending', 'approved', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  priority INT DEFAULT 0,
  plan_data JSON,
  result_data JSON,
  progress INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_user_status (user_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Task Steps Table
-- =====================================================
CREATE TABLE IF NOT EXISTS task_steps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL,
  step_order INT NOT NULL,
  description TEXT,
  status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
  files JSON,
  type VARCHAR(50),
  result TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_task_order (task_id, step_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Agents Table
-- =====================================================
CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100),
  role VARCHAR(100),
  status ENUM('idle', 'working', 'error', 'offline') DEFAULT 'offline',
  current_task_id VARCHAR(100),
  activity TEXT,
  last_update TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  FOREIGN KEY (current_task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Activities Table
-- =====================================================
CREATE TABLE IF NOT EXISTS activities (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  agent_name VARCHAR(100),
  task_id VARCHAR(100),
  message TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_type_time (type, created_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Code Edits Table
-- =====================================================
CREATE TABLE IF NOT EXISTS code_edits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agent_name VARCHAR(100),
  file_path VARCHAR(500),
  action VARCHAR(50),
  code TEXT,
  line_numbers VARCHAR(100),
  task_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_agent_time (agent_name, created_at),
  INDEX idx_file (file_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Agent Communications Table
-- =====================================================
CREATE TABLE IF NOT EXISTS agent_communications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_agent VARCHAR(100),
  to_agent VARCHAR(100),
  message TEXT,
  type VARCHAR(50),
  task_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  INDEX idx_agents (from_agent, to_agent),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Subscribers Table (for email subscriptions)
-- =====================================================
CREATE TABLE IF NOT EXISTS subscribers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),
  source VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- System Config Table
-- =====================================================
CREATE TABLE IF NOT EXISTS system_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default config
INSERT INTO system_config (config_key, config_value) VALUES
('version', '1.0.0'),
('db_schema_version', '1')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
