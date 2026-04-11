/**
 * Nigents - Security Analyst Agent
 * Performs security audits, vulnerability scanning, threat modeling
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');

class SecurityAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['security'];
    super(config);
  }

  /**
   * Execute a security task
   */
  async execute(task) {
    this.setStatus('working', { task: 'security', description: task });
    try {
      const prompt = typeof task === 'string' ? task : (task.description || task.title || JSON.stringify(task));
      const result = await this.callAI(prompt);
      this.setStatus('done', { task: 'security' });
      return result;
    } catch (error) {
      this.setStatus('error', { task: 'security', error: error.message });
      logger.error('[Security] Error:', error);
      throw error;
    }
  }

  /**
   * Perform a security audit on code diff or files
   */
  async auditCode(code, context = {}) {
    this.setStatus('working', { task: 'audit_code' });
    const prompt = `Perform a comprehensive security audit on this code.

${context.language ? `Language: ${context.language}` : ''}
${context.framework ? `Framework: ${context.framework}` : ''}

Code to audit:
\`\`\`
${code}
\`\`\`

Check for:
1. OWASP Top 10 vulnerabilities
2. Injection flaws (SQL, NoSQL, OS command, LDAP)
3. Authentication/authorization weaknesses
4. Sensitive data exposure (hardcoded secrets, PII leaks)
5. Security misconfiguration
6. XSS, CSRF, SSRF vulnerabilities
7. Insecure deserialization
8. Known vulnerable dependencies
9. Cryptographic failures
10. Broken access control

Format each finding as:
- Severity: CRITICAL/HIGH/MEDIUM/LOW
- Finding: Description
- Location: File/line if applicable
- Impact: What an attacker could do
- Remediation: Specific fix with code example
- CWE: Reference number`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'audit_code' });
    return result;
  }

  /**
   * Perform threat modeling for a feature or system
   */
  async threatModel(systemDescription) {
    this.setStatus('working', { task: 'threat_model' });
    const prompt = `Perform STRIDE threat modeling for this system:

${systemDescription}

For each STRIDE category:
- Spoofing: Identity threats
- Tampering: Data integrity threats
- Repudiation: Non-accountability threats
- Information Disclosure: Confidentiality threats
- Denial of Service: Availability threats
- Elevation of Privilege: Authorization threats

Output:
1. Threat matrix (STRIDE x components)
2. Risk ratings (likelihood x impact)
3. Recommended mitigations with priority
4. Data flow diagram annotations`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'threat_model' });
    return result;
  }

  /**
   * Audit dependency tree for vulnerabilities
   */
  async auditDependencies(packageJson) {
    this.setStatus('working', { task: 'audit_deps' });
    const prompt = `Analyze these project dependencies for security issues:

${typeof packageJson === 'string' ? packageJson : JSON.stringify(packageJson, null, 2)}

Check for:
1. Known CVEs in listed packages
2. Outdated packages with security patches available
3. Packages with known supply chain risks
4. Typosquatting risks
5. Unnecessary dependencies that increase attack surface
6. Packages that should be devDependencies only

Provide a remediation plan with priority.`;

    const result = await this.callAI(prompt);
    this.setStatus('done', { task: 'audit_deps' });
    return result;
  }
}

module.exports = SecurityAgent;
