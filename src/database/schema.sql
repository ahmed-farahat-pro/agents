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
-- User Config Table (per-user API keys, GitLab, custom models)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_config (
  user_id VARCHAR(50) PRIMARY KEY,
  api_keys JSON,
  gitlab JSON,
  custom_models JSON,
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
-- AI Providers Table
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_providers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  base_url VARCHAR(255),
  api_key_required BOOLEAN DEFAULT TRUE,
  enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default AI providers
INSERT INTO ai_providers (id, name, description, base_url, enabled) VALUES
('anthropic', 'Anthropic Claude', 'Claude AI models', 'https://api.anthropic.com', FALSE),
('zhipu', 'Zhipu AI GLM', 'GLM-4/5 models for coding', 'https://api.z.ai/api/coding/paas/v4', FALSE),
('moonshot', 'Moonshot AI', 'Kimi models', 'https://api.moonshot.cn/v1', FALSE),
('deepseek', 'DeepSeek', 'DeepSeek Coder/Chat', 'https://api.deepseek.com/v1', FALSE)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- =====================================================
-- AI Models Table
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_models (
  id VARCHAR(100) PRIMARY KEY,
  provider_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_tokens INT DEFAULT 4096,
  cost_per_1k_input DECIMAL(10,6) DEFAULT 0,
  cost_per_1k_output DECIMAL(10,6) DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE,
  INDEX idx_provider (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default models
INSERT INTO ai_models (id, provider_id, name, description, max_tokens) VALUES
-- Anthropic
('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet', 'Best for complex code', 4096),
('claude-3-opus-20240229', 'anthropic', 'Claude 3 Opus', 'Most powerful', 4096),
('claude-3-haiku-20240307', 'anthropic', 'Claude 3 Haiku', 'Fast and cheap', 4096),
-- Zhipu
('glm-5', 'zhipu', 'GLM-5', 'Best for coding tasks', 4096),
('glm-4.5', 'zhipu', 'GLM-4.5', 'Advanced reasoning', 4096),
('glm-4', 'zhipu', 'GLM-4', 'Balanced performance', 4096),
('glm-4-plus', 'zhipu', 'GLM-4 Plus', 'Enhanced version', 4096),
('glm-4-flash', 'zhipu', 'GLM-4 Flash', 'Fast inference', 4096),
-- Moonshot
('moonshot-v1-8k', 'moonshot', 'Moonshot 8K', '8k context', 8192),
('moonshot-v1-32k', 'moonshot', 'Moonshot 32K', '32k context', 32768),
('moonshot-v1-128k', 'moonshot', 'Moonshot 128K', '128k context', 131072),
-- DeepSeek
('deepseek-chat', 'deepseek', 'DeepSeek Chat', 'General chat', 4096),
('deepseek-coder', 'deepseek', 'DeepSeek Coder', 'Code generation', 4096)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- =====================================================
-- Agent Configurations Table
-- =====================================================
-- Dropped foreign key constraints to support custom provider keys
CREATE TABLE IF NOT EXISTS agent_configurations (
  agent_name VARCHAR(100) PRIMARY KEY,
  display_name VARCHAR(100),
  role VARCHAR(100),
  provider_id VARCHAR(100),
  model_id VARCHAR(100),
  fallback_provider_id VARCHAR(100),
  fallback_model_id VARCHAR(100),
  max_tokens INT DEFAULT 4096,
  system_message TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default agent configurations
INSERT INTO agent_configurations 
(agent_name, display_name, role, provider_id, model_id, fallback_provider_id, fallback_model_id, max_tokens, system_message) 
VALUES
('orchestrator', 'Orchestrator', 'Team Lead & Router', 'zhipu', 'glm-5', 'anthropic', 'claude-3-5-sonnet-20241022', 4096, 'You are the Orchestrator agent for Nigents.'),
('planner', 'Planner', 'Architecture & Planning', 'zhipu', 'glm-5', 'anthropic', 'claude-3-5-sonnet-20241022', 4096, 'You are the Planner agent for Nigents.'),
('backend-dev', 'Backend Developer', 'Backend Developer', 'zhipu', 'glm-5', 'anthropic', 'claude-3-5-sonnet-20241022', 4096, 'You are the Backend Developer agent for Nigents.'),
('frontend-dev', 'Frontend Developer', 'Frontend Developer', 'zhipu', 'glm-4-plus', 'anthropic', 'claude-3-haiku-20240307', 4096, 'You are the Frontend Developer agent for Nigents.'),
('qa-tester', 'QA Tester', 'Quality Assurance', 'zhipu', 'glm-4', 'anthropic', 'claude-3-haiku-20240307', 4096, 'You are the QA Tester agent for Nigents.'),
('code-reviewer', 'Code Reviewer', 'Code Reviewer', 'zhipu', 'glm-5', 'anthropic', 'claude-3-5-sonnet-20241022', 4096, 'You are the Code Reviewer agent for Nigents.'),
('reporter', 'Reporter', 'Reporter & Communicator', 'zhipu', 'glm-4', 'anthropic', 'claude-3-haiku-20240307', 2048, 'You are the Reporter agent for Nigents.')
ON DUPLICATE KEY UPDATE 
provider_id = VALUES(provider_id),
model_id = VALUES(model_id),
system_message = VALUES(system_message);

-- =====================================================
-- Global Configuration Table
-- =====================================================
CREATE TABLE IF NOT EXISTS global_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default global config
INSERT INTO global_config (config_key, config_value) VALUES
('default_provider', 'zhipu'),
('default_model', 'glm-5'),
('fallback_provider', 'anthropic'),
('fallback_model', 'claude-3-5-sonnet-20241022')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);

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
('db_schema_version', '2')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
