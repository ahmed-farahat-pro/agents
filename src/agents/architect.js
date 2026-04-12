/**
 * Nigents - Solutions Architect Agent
 * Designs system architecture, evaluates tech stacks, creates ADRs
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');

class ArchitectAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['architect'];
    super(config);
  }

  /**
   * Execute an architecture task
   */
  async execute(task) {
    this.setStatus('working', { task: 'architect', description: task });
    try {
      const prompt = typeof task === 'string' ? task : (task.description || task.title || JSON.stringify(task));
      const result = await this.callAI(prompt);
      this.setStatus('done', { task: 'architect' });
      return result;
    } catch (error) {
      this.setStatus('error', { task: 'architect', error: error.message });
      logger.error('[Architect] Error:', error);
      throw error;
    }
  }

  /**
   * Design system architecture for a feature or project
   */
  async designArchitecture(requirements) {
    this.setStatus('working', { task: 'design_architecture' });
    const prompt = `Design a complete system architecture based on these requirements:

${typeof requirements === 'string' ? requirements : JSON.stringify(requirements, null, 2)}

Provide:
1. Architecture overview (high-level description)
2. Component diagram (ASCII art)
3. Data flow between components
4. API contracts (key endpoints)
5. Database schema design
6. Technology stack with rationale
7. Scalability considerations
8. Trade-offs and alternatives considered
9. Migration path (if modifying existing system)
10. Estimated complexity and timeline`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'design_architecture' });
    return result;
  }

  /**
   * Evaluate and compare technology stack options
   */
  async evaluateTechStack(options) {
    this.setStatus('working', { task: 'evaluate_stack' });
    const prompt = `Evaluate technology stack options for this project:

${typeof options === 'string' ? options : JSON.stringify(options, null, 2)}

For each option, assess:
1. Performance characteristics
2. Developer experience and learning curve
3. Community support and ecosystem maturity
4. Cost (licensing, hosting, operational)
5. Scalability ceiling
6. Security posture
7. Long-term maintainability

Output a comparison matrix and final recommendation with rationale.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'evaluate_stack' });
    return result;
  }

  /**
   * Create an Architecture Decision Record (ADR)
   */
  async createADR(decision) {
    this.setStatus('working', { task: 'create_adr' });
    const prompt = `Create an Architecture Decision Record (ADR) for this decision:

${typeof decision === 'string' ? decision : JSON.stringify(decision, null, 2)}

Use this format:
# ADR-NNN: Title
## Status: Proposed/Accepted/Deprecated/Superseded
## Context: What is the issue that we're seeing?
## Decision: What is the change we're proposing?
## Consequences: What becomes easier or harder?
## Alternatives Considered: What other options were evaluated?
## References: Links, RFCs, prior art`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'create_adr' });
    return result;
  }

  /**
   * Review existing architecture and suggest improvements
   */
  async reviewArchitecture(currentArch) {
    this.setStatus('working', { task: 'review_architecture' });
    const prompt = `Review this existing architecture and identify improvements:

${typeof currentArch === 'string' ? currentArch : JSON.stringify(currentArch, null, 2)}

Analyze:
1. Single points of failure
2. Performance bottlenecks
3. Scaling limitations
4. Security gaps
5. Operational complexity
6. Cost inefficiencies
7. Technical debt areas

Provide prioritized recommendations with effort estimates.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'review_architecture' });
    return result;
  }
}

module.exports = ArchitectAgent;
