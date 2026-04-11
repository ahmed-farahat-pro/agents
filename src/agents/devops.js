/**
 * Nigents - DevOps & Infrastructure Agent
 * Manages CI/CD, Docker, Kubernetes, cloud deployments, and monitoring
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');

class DevOpsAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['devops'];
    super(config);
  }

  /**
   * Execute a DevOps task — CI/CD, Docker, infra, monitoring
   */
  async execute(task) {
    this.setStatus('working', { task: 'devops', description: task });
    try {
      const prompt = typeof task === 'string' ? task : (task.description || task.title || JSON.stringify(task));
      const result = await this.callAI(prompt);
      this.setStatus('done', { task: 'devops' });
      return result;
    } catch (error) {
      this.setStatus('error', { task: 'devops', error: error.message });
      logger.error('[DevOps] Error:', error);
      throw error;
    }
  }

  /**
   * Review and generate CI/CD pipeline configuration
   */
  async generatePipeline(projectType, options = {}) {
    this.setStatus('working', { task: 'generate_pipeline' });
    const prompt = `Generate a production-ready CI/CD pipeline configuration.

Project type: ${projectType}
Platform: ${options.platform || 'GitLab CI'}
Requirements:
- Build, test, lint stages
- Docker image build and push
- Staging and production deployment
- Security scanning (SAST, dependency check)
- Rollback capability
${options.extra || ''}

Output the complete pipeline YAML file.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'generate_pipeline' });
    return result;
  }

  /**
   * Generate Dockerfile for a project
   */
  async generateDockerfile(projectInfo) {
    this.setStatus('working', { task: 'generate_dockerfile' });
    const prompt = `Generate an optimized, production-ready Dockerfile.

Project: ${JSON.stringify(projectInfo)}

Requirements:
- Multi-stage build for minimal image size
- Non-root user for security
- Proper HEALTHCHECK instruction
- .dockerignore recommendations
- Layer caching optimization

Output the complete Dockerfile with comments.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'generate_dockerfile' });
    return result;
  }

  /**
   * Analyze and optimize infrastructure
   */
  async analyzeInfrastructure(config) {
    this.setStatus('working', { task: 'analyze_infra' });
    const prompt = `Analyze this infrastructure configuration and suggest optimizations:

${typeof config === 'string' ? config : JSON.stringify(config, null, 2)}

Check for:
1. Security issues (open ports, missing encryption, weak IAM)
2. Cost optimization opportunities
3. Scalability bottlenecks
4. High availability gaps
5. Monitoring blind spots

Provide actionable recommendations with priority levels.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'analyze_infra' });
    return result;
  }
}

module.exports = DevOpsAgent;
