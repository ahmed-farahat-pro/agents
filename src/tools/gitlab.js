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
      timeout: 30000,
    });
    
    // Cache for project IDs to avoid repeated lookups
    this.projectCache = new Map();
    this.projectListCache = null;
    this.projectListCacheTime = null;
  }

  /**
   * Check if GitLab is properly configured
   */
  isConfigured() {
    return !!this.token;
  }

  /**
   * Get configuration info
   */
  getConfig() {
    return {
      configured: this.isConfigured(),
      hasToken: !!this.token,
      namespace: this.namespace,
      baseUrl: this.baseUrl,
    };
  }

  /**
   * List all projects for the user
   */
  async listProjects(limit = 50) {
    try {
      if (!this.token) {
        logger.warn('[GitLab] No GITLAB_TOKEN configured');
        return [];
      }
      
      const response = await this.client.get('/projects', {
        params: {
          membership: true,
          per_page: limit,
          order_by: 'last_activity_at',
          sort: 'desc',
        },
      });
      
      const projects = response.data.map(project => ({
        id: project.id,
        path: project.path,
        name: project.name,
        fullPath: project.path_with_namespace,
        description: project.description,
        url: project.web_url,
        defaultBranch: project.default_branch || 'main',
        lastActivity: project.last_activity_at,
        visibility: project.visibility,
      }));
      
      // Update cache
      this.projectListCache = projects;
      this.projectListCacheTime = Date.now();
      
      // Also cache the IDs
      projects.forEach(p => {
        this.projectCache.set(p.path, p.id);
        this.projectCache.set(p.fullPath, p.id);
        this.projectCache.set(p.name.toLowerCase(), p.id);
      });
      
      return projects;
    } catch (error) {
      logger.error('[GitLab] Failed to list projects:', error.message);
      if (error.response) {
        logger.error(`[GitLab] Status: ${error.response.status}, Data:`, error.response.data);
      }
      return [];
    }
  }

  /**
   * Search for projects by name
   */
  async searchProjects(query, limit = 10) {
    try {
      if (!this.token) {
        logger.warn('[GitLab] No GITLAB_TOKEN configured');
        return [];
      }
      
      // First check cache
      if (this.projectListCache) {
        const cached = this.projectListCache.filter(p => 
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.path.toLowerCase().includes(query.toLowerCase()) ||
          p.fullPath.toLowerCase().includes(query.toLowerCase())
        );
        if (cached.length > 0) {
          return cached.slice(0, limit);
        }
      }
      
      const response = await this.client.get('/projects', {
        params: {
          membership: true,
          search: query,
          per_page: limit,
          order_by: 'last_activity_at',
          sort: 'desc',
        },
      });
      
      return response.data.map(project => ({
        id: project.id,
        path: project.path,
        name: project.name,
        fullPath: project.path_with_namespace,
        description: project.description,
        url: project.web_url,
        defaultBranch: project.default_branch || 'main',
        lastActivity: project.last_activity_at,
        visibility: project.visibility,
      }));
    } catch (error) {
      logger.error('[GitLab] Failed to search projects:', error.message);
      return [];
    }
  }

  /**
   * Find a project by name (fuzzy search)
   */
  async findProject(projectName) {
    try {
      // First try exact match from cache
      if (this.projectCache.has(projectName)) {
        const projectId = this.projectCache.get(projectName);
        return this.getProjectById(projectId);
      }
      
      // Try case-insensitive cache lookup
      const lowerName = projectName.toLowerCase();
      for (const [key, id] of this.projectCache) {
        if (key.toLowerCase() === lowerName) {
          return this.getProjectById(id);
        }
      }
      
      // Refresh project list and search
      const projects = await this.listProjects(100);
      
      // Try exact matches first
      let match = projects.find(p => 
        p.path === projectName || 
        p.fullPath === projectName ||
        p.name === projectName
      );
      
      // Try case-insensitive match
      if (!match) {
        match = projects.find(p => 
          p.path.toLowerCase() === lowerName || 
          p.fullPath.toLowerCase() === lowerName ||
          p.name.toLowerCase() === lowerName
        );
      }
      
      // Try partial match
      if (!match) {
        match = projects.find(p => 
          p.path.toLowerCase().includes(lowerName) || 
          p.name.toLowerCase().includes(lowerName)
        );
      }
      
      return match || null;
    } catch (error) {
      logger.error('[GitLab] Failed to find project:', error.message);
      return null;
    }
  }

  /**
   * Get project by ID
   */
  async getProjectById(projectId) {
    try {
      const response = await this.client.get(`/projects/${projectId}`);
      const project = response.data;
      
      return {
        id: project.id,
        path: project.path,
        name: project.name,
        fullPath: project.path_with_namespace,
        description: project.description,
        url: project.web_url,
        defaultBranch: project.default_branch || 'main',
        lastActivity: project.last_activity_at,
        visibility: project.visibility,
        stars: project.star_count,
        forks: project.forks_count,
      };
    } catch (error) {
      logger.error('[GitLab] Failed to get project by ID:', error.message);
      return null;
    }
  }

  /**
   * Get project ID from path (with caching)
   */
  async getProjectId(projectPath) {
    try {
      if (!this.token) {
        logger.warn('[GitLab] No GITLAB_TOKEN configured');
        return null;
      }
      
      // Check cache first
      if (this.projectCache.has(projectPath)) {
        return this.projectCache.get(projectPath);
      }
      
      // Try to find by numeric ID
      if (/^\d+$/.test(projectPath)) {
        return parseInt(projectPath, 10);
      }
      
      // If projectPath already contains a namespace (has a /), use it directly
      if (projectPath.includes('/')) {
        const encodedPath = encodeURIComponent(projectPath);
        try {
          const response = await this.client.get(`/projects/${encodedPath}`);
          const id = response.data.id;
          this.projectCache.set(projectPath, id);
          return id;
        } catch (e) {
          logger.debug(`[GitLab] Project not found with path: ${projectPath}`);
          return null;
        }
      }
      
      // Try with configured namespace first
      if (this.namespace) {
        const encodedPath = encodeURIComponent(`${this.namespace}/${projectPath}`);
        try {
          const response = await this.client.get(`/projects/${encodedPath}`);
          const id = response.data.id;
          this.projectCache.set(projectPath, id);
          return id;
        } catch (nsError) {
          logger.debug(`[GitLab] Not found in namespace ${this.namespace}, searching all projects...`);
        }
      }
      
      // Search all projects
      const project = await this.findProject(projectPath);
      if (project) {
        this.projectCache.set(projectPath, project.id);
        return project.id;
      }
      
      logger.warn(`[GitLab] Project not found: ${projectPath}`);
      return null;
    } catch (error) {
      logger.error(`[GitLab] Error getting project ID for ${projectPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get project details by path
   */
  async getProject(projectPath) {
    const projectId = await this.getProjectId(projectPath);
    if (!projectId) return null;
    
    return this.getProjectById(projectId);
  }

  /**
   * Get repository files
   */
  async getRepositoryFiles(projectPath, limit = 100, ref = 'main') {
    try {
      const projectId = await this.getProjectId(projectPath);
      if (!projectId) {
        logger.warn(`[GitLab] Cannot get files for ${projectPath}: project not found`);
        return [];
      }
      
      // First get project to find default branch
      const project = await this.getProjectById(projectId);
      const branch = ref || project?.defaultBranch || 'main';
      
      const response = await this.client.get(`/projects/${projectId}/repository/tree`, {
        params: {
          recursive: true,
          per_page: limit,
          ref: branch,
        },
      });
      
      return response.data.map(item => ({
        path: item.path,
        name: item.name,
        type: item.type,
        mode: item.mode,
      }));
    } catch (error) {
      logger.warn(`[GitLab] Failed to get repository files for ${projectPath}:`, error.message);
      return [];
    }
  }

  /**
   * Get file content
   */
  async getFileContent(projectPath, filePath, ref = null) {
    try {
      const projectId = await this.getProjectId(projectPath);
      if (!projectId) {
        throw new Error(`Project not found: ${projectPath}`);
      }
      
      // Get default branch if ref not provided
      if (!ref) {
        const project = await this.getProjectById(projectId);
        ref = project?.defaultBranch || 'main';
      }
      
      const encodedFilePath = encodeURIComponent(filePath);
      const response = await this.client.get(
        `/projects/${projectId}/repository/files/${encodedFilePath}/raw`,
        { params: { ref } }
      );
      return response.data;
    } catch (error) {
      logger.error(`[GitLab] Failed to get file content ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Get multiple files content
   */
  async getFilesContent(projectPath, filePaths, ref = null) {
    const results = [];
    for (const filePath of filePaths) {
      try {
        const content = await this.getFileContent(projectPath, filePath, ref);
        results.push({ path: filePath, content, success: true });
      } catch (error) {
        results.push({ path: filePath, error: error.message, success: false });
      }
    }
    return results;
  }

  /**
   * Get repo clone URL
   */
  async getRepoUrl(projectPath) {
    try {
      const projectId = await this.getProjectId(projectPath);
      if (!projectId) {
        // Fallback to constructed URL
        return this.namespace 
          ? `${this.baseUrl}/${this.namespace}/${projectPath}.git`
          : `${this.baseUrl}/${projectPath}.git`;
      }
      
      const response = await this.client.get(`/projects/${projectId}`);
      return response.data.ssh_url_to_repo || response.data.http_url_to_repo;
    } catch (error) {
      // Fallback to constructed URL
      return this.namespace 
        ? `${this.baseUrl}/${this.namespace}/${projectPath}.git`
        : `${this.baseUrl}/${projectPath}.git`;
    }
  }

  /**
   * Get repo URL with token for push (so OpenHands or git can push without prompt)
   * Uses https://oauth2:TOKEN@host/group/repo.git format.
   */
  async getPushUrl(projectPath) {
    const url = await this.getRepoUrl(projectPath);
    if (!this.token) return url;
    if (url.startsWith('https://')) {
      return url.replace(/^https:\/\//, `https://oauth2:${encodeURIComponent(this.token)}@`);
    }
    if (url.startsWith('http://')) {
      return url.replace(/^http:\/\//, `http://oauth2:${encodeURIComponent(this.token)}@`);
    }
    return url;
  }

  /**
   * Create a branch and commit files via API (so there is code to view in the MR).
   * Use when OpenHands did not push (e.g. fallback mode).
   */
  async createBranchWithFiles(projectPath, branchName, sourceBranch, files, commitMessage) {
    const projectId = await this.getProjectId(projectPath);
    if (!projectId) {
      throw new Error(`Project not found: ${projectPath}`);
    }
    if (!files || files.length === 0) {
      throw new Error('At least one file is required');
    }
    const actions = files.map(({ path: filePath, content }) => ({
      action: 'create',
      file_path: filePath,
      content: content || '',
    }));
    const response = await this.client.post(`/projects/${encodeURIComponent(projectId)}/repository/commits`, {
      branch: branchName,
      start_branch: sourceBranch || 'main',
      commit_message: commitMessage || `feat: ${branchName}`,
      actions,
    });
    logger.info('[GitLab] Branch created with commit:', branchName, response.data.id);
    return { commitId: response.data.id, webUrl: response.data.web_url };
  }

  /**
   * Create a merge request
   */
  async createMergeRequest({ project, title, description, sourceBranch, targetBranch = 'main', branch }) {
    try {
      // Accept 'branch' as alias for sourceBranch for backwards compatibility
      const srcBranch = sourceBranch || branch;
      if (!srcBranch) {
        throw new Error('sourceBranch (or branch) is required to create merge request');
      }

      let projectId = project != null && project !== '' ? await this.getProjectId(project) : null;
      if (!projectId && this.namespace) {
        const projects = await this.listProjects(10);
        const first = projects[0];
        if (first) {
          projectId = first.id;
          logger.info('[GitLab] Using first project from namespace:', first.fullPath);
        }
      }
      if (!projectId) {
        throw new Error(project != null ? `Project not found: ${project}` : 'No project specified and could not resolve from GitLab');
      }

      const response = await this.client.post(`/projects/${projectId}/merge_requests`, {
        source_branch: srcBranch,
        target_branch: targetBranch,
        title: title || `Merge ${srcBranch} into ${targetBranch}`,
        description: description || '',
        remove_source_branch: false,
      });

      return {
        success: true,
        url: response.data.web_url,
        iid: response.data.iid,
        title: response.data.title,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error('[GitLab] Failed to create MR:', msg);
      if (error.response?.data) {
        logger.error('[GitLab] Response:', JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Get diff between two refs (e.g. main and feature branch)
   * Returns combined diff string or null on failure
   */
  async getCompareDiff(projectId, fromRef = 'main', toRef) {
    try {
      const id = typeof projectId === 'string' && !/^\d+$/.test(projectId)
        ? encodeURIComponent(projectId)
        : projectId;
      const response = await this.client.get(`/projects/${id}/repository/compare`, {
        params: { from: fromRef, to: toRef },
      });
      const diffs = response.data?.diffs;
      if (!Array.isArray(diffs) || diffs.length === 0) {
        return null;
      }
      return diffs.map(d => d.diff || '').filter(Boolean).join('\n');
    } catch (error) {
      logger.warn('[GitLab] getCompareDiff failed:', error.message);
      return null;
    }
  }

  /**
   * Get repository branches
   */
  async getBranches(projectPath, limit = 20) {
    try {
      const projectId = await this.getProjectId(projectPath);
      if (!projectId) return [];
      
      const response = await this.client.get(`/projects/${projectId}/repository/branches`, {
        params: { per_page: limit },
      });
      
      return response.data.map(branch => ({
        name: branch.name,
        default: branch.default,
        protected: branch.protected,
        lastCommit: branch.commit?.id,
      }));
    } catch (error) {
      logger.error('[GitLab] Failed to get branches:', error.message);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.projectCache.clear();
    this.projectListCache = null;
    this.projectListCacheTime = null;
    logger.info('[GitLab] Cache cleared');
  }
}

// Export singleton
module.exports = new GitLabAPI();
