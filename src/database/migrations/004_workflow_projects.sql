-- Persisted Workflow Studio graphs (per GitLab repo or ad-hoc project)
-- Run via migrate or auto-ensure on dashboard boot.

CREATE TABLE IF NOT EXISTS workflow_projects (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  gitlab_path VARCHAR(512) NULL,
  gitlab_project_id VARCHAR(64) NOT NULL DEFAULT '',
  nodes_json LONGTEXT NOT NULL,
  edges_json LONGTEXT NOT NULL,
  meta_json LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_workflow_gitlab_path (gitlab_path(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
