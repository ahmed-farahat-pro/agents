/**
 * 🦉 Nigents - GitLab API Tool
 * Interacts with GitLab for repo access and MR creation
 */

const axios = require('axios');
const logger = require('../utils/logger');

class GitLabAPI {
  constructor() {
    this.token = process.env.GITLAB_TOKEN;
    this.namespace = process.env.GITLAB_NAMESPACE;
    this.baseUrl = process.env.GITLAB_URL || 'https://gitlab.com';
    
    this.client = axios.create({
      baseURL: `${this.baseUrl}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * List all projects for the user
   */
  async listProjects(limit = 20) {
    try {
      const response = await this.client.get('/projects', {
        params: {
          membership: true,
          per_page: limit,
          order_by: 'last_activity_at',
          sort: 'desc',
        },
      });
      
      return response.data.map(project => ({
        id: project.path,
        name: project.name,
        fullPath: project.path_with_namespace,
        description: project.description,
        url: project.web_url,
        defaultBranch: project.default_branch || 'main',
        lastActivity: project.last_activity_at,
        visibility: project.visibility,
      }));
    } catch (error) {
      logger.error('[GitLab] Failed to list projects:', error.message);
      return [];
    }
  }

  /**
   * Get project ID from path
   */
  async getProjectId(projectPath) {
    try {
      const encodedPath = encodeURIComponent(`${this.namespace}/${projectPath}`);
      const response = await this.client.get(`/projects/${encodedPath}`);
      return response.data.id;
    } catch (error) {
      logger.error('[GitLab] Failed to get project ID:', error.message);
      throw error;
    }
  }

  /**
   * Get repository files
   */
  async getRepositoryFiles(projectPath, limit = 100) {
    try {
      const projectId = await this.getProjectId(projectPath);
      const response = await this.client.get(`/projects/${projectId}/repository/tree`, {
        params: {
          recursive: true,
          per_page: limit,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('[GitLab] Failed to get repository files:', error.message);
      return [];
    }
  }

  /**
   * Get file content
   */
  async getFileContent(projectPath, filePath, ref = 'main') {
    try {
      const projectId = await this.getProjectId(projectPath);
      const encodedFilePath = encodeURIComponent(filePath);
      const response = await this.client.get(
        `/projects/${projectId}/repository/files/${encodedFilePath}/raw`,
        { params: { ref } }
      );
      return response.data;
    } catch (error) {
      logger.error('[GitLab] Failed to get file content:', error.message);
      throw error;
    }
  }

  /**
   * Get repo clone URL
   */
  async getRepoUrl(projectPath) {
    try {
      const projectId = await this.getProjectId(projectPath);
      const response = await this.client.get(`/projects/${projectId}`);
      return response.data.ssh_url_to_repo;
    } catch (error) {
      // Fallback to constructed URL
      return `git@gitlab.com:${this.namespace}/${projectPath}.git`;
    }
  }

  /**
   * Create a merge request
   */
  async createMergeRequest({ project, title, description, sourceBranch, targetBranch = 'main' }) {
    try {
      const projectId = await this.getProjectId(project);
      
      const response = await this.client.post(`/projects/${projectId}/merge_requests`, {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: title,
        description: description,
        remove_source_branch: false,
      });

      logger.info('[GitLab] MR created:', response.data.web_url);
      
      return {
        success: true,
        url: response.data.web_url,
        iid: response.data.iid,
        id: response.data.id,
      };
    } catch (error) {
      logger.error('[GitLab] Failed to create MR:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get merge requests
   */
  async getMergeRequests(projectPath, state = 'opened') {
    try {
      const projectId = await this.getProjectId(projectPath);
      const response = await this.client.get(`/projects/${projectId}/merge_requests`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      logger.error('[GitLab] Failed to get MRs:', error.message);
      return [];
    }
  }

  /**
   * Get recent commits
   */
  async getRecentCommits(projectPath, limit = 10) {
    try {
      const projectId = await this.getProjectId(projectPath);
      const response = await this.client.get(`/projects/${projectId}/repository/commits`, {
        params: { per_page: limit },
      });
      return response.data;
    } catch (error) {
      logger.error('[GitLab] Failed to get commits:', error.message);
      return [];
    }
  }

  /**
   * Get diff between branches
   */
  async getDiff(projectPath, from, to) {
    try {
      const projectId = await this.getProjectId(projectPath);
      const response = await this.client.get(`/projects/${projectId}/repository/compare`, {
        params: { from, to },
      });
      return response.data;
    } catch (error) {
      logger.error('[GitLab] Failed to get diff:', error.message);
      return null;
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const response = await this.client.get('/user');
      return {
        success: true,
        user: response.data.username,
        name: response.data.name,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton
module.exports = new GitLabAPI();
