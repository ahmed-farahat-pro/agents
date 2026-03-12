/**
 * 🦉 NightOwl - QA Tester Agent
 * Writes and runs tests
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const openhands = require('../tools/openhands');

class QATesterAgent extends BaseAgent {
  constructor() {
    const config = require('../../config/agents.json')['qa-tester'];
    super(config);
  }

  /**
   * Run tests for an implementation
   */
  async runTests(plan) {
    this.setStatus('working', { task: 'testing', plan: plan.title });
    this.currentTask = plan;

    try {
      this.emit('progress', { stage: 'writing_tests', message: 'Generating test cases...' });

      // Step 1: Generate test files
      const testFiles = await this.generateTests(plan);

      this.emit('progress', { stage: 'running_tests', message: 'Executing test suite...' });

      // Step 2: Run the tests
      const testResults = await this.executeTests(plan);

      // Step 3: Analyze results
      const analysis = this.analyzeResults(testResults);

      this.setStatus('done', { task: 'testing', results: analysis });

      return {
        success: analysis.passed,
        summary: analysis,
        testFiles: testFiles,
        details: testResults,
        message: this.formatResultsForTelegram(analysis),
      };
    } catch (error) {
      this.setStatus('error', { task: 'testing', error: error.message });
      return {
        success: false,
        message: `Testing failed: ${error.message}`,
      };
    }
  }

  /**
   * Generate test files for the plan
   */
  async generateTests(plan) {
    const prompt = `
Generate comprehensive test cases for the following implementation:

TITLE: ${plan.title}
DESCRIPTION: ${plan.description}

FILES TO TEST:
${plan.filesToModify?.join('\n') || 'N/A'}

NEW FILES:
${plan.filesToCreate?.join('\n') || 'N/A'}

Generate:
1. Unit tests for new functions/methods
2. Integration tests for API endpoints
3. Edge case tests
4. Error scenario tests

Based on the file extensions, determine the test framework:
- .java → JUnit
- .js/.ts → Jest
- .py → pytest

Respond with test file content in this format:
{
  "testFiles": [
    {
      "path": "path/to/TestFile.java",
      "content": "full test code"
    }
  ]
}
`;

    const result = await this.callClaude(prompt, { maxTokens: 4096 });
    
    if (!result.success) {
      logger.warn('[QA] Failed to generate tests:', result.error);
      return [];
    }

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.testFiles || [];
      }
    } catch (e) {
      logger.warn('[QA] Could not parse test files:', e);
    }

    return [];
  }

  /**
   * Execute tests via OpenHands
   */
  async executeTests(plan) {
    const workDir = `/workspace/${plan.project}`;
    
    // Detect test command based on project type
    const detectCommand = `cd ${workDir} && ls -la`;
    const detectResult = await openhands.executeCommands([detectCommand]);
    
    let testCommand;
    if (detectResult.output.includes('pom.xml')) {
      testCommand = 'mvn test';
    } else if (detectResult.output.includes('package.json')) {
      testCommand = 'npm test';
    } else if (detectResult.output.includes('requirements.txt')) {
      testCommand = 'pytest';
    } else if (detectResult.output.includes('gradlew')) {
      testCommand = './gradlew test';
    } else {
      testCommand = 'echo "No test framework detected"';
    }

    const result = await openhands.executeCommands([
      `cd ${workDir}`,
      testCommand,
    ]);

    return {
      command: testCommand,
      success: result.success,
      output: result.output,
      exitCode: result.exitCode,
    };
  }

  /**
   * Analyze test results
   */
  analyzeResults(testResults) {
    const output = testResults.output || '';
    
    // Parse different test output formats
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // Jest format
    const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,?\s+(\d+)\s+failed,?\s+(\d+)\s+skipped/);
    if (jestMatch) {
      passed = parseInt(jestMatch[1]) || 0;
      failed = parseInt(jestMatch[2]) || 0;
      skipped = parseInt(jestMatch[3]) || 0;
    }

    // Maven/JUnit format
    const mavenMatch = output.match(/Tests run:\s+(\d+),\s+Failures:\s+(\d+),\s+Errors:\s+(\d+)/);
    if (mavenMatch) {
      const total = parseInt(mavenMatch[1]) || 0;
      const failures = parseInt(mavenMatch[2]) || 0;
      const errors = parseInt(mavenMatch[3]) || 0;
      passed = total - failures - errors;
      failed = failures + errors;
    }

    // pytest format
    const pytestMatch = output.match(/(\d+)\s+passed.*?((\d+)\s+failed)?.*?((\d+)\s+skipped)?/);
    if (pytestMatch) {
      passed = parseInt(pytestMatch[1]) || 0;
      failed = parseInt(pytestMatch[3]) || 0;
      skipped = parseInt(pytestMatch[5]) || 0;
    }

    const total = passed + failed + skipped;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    return {
      total,
      passed,
      failed,
      skipped,
      passRate,
      passed: failed === 0 && total > 0,
      raw: output.substring(0, 2000), // Limit raw output
    };
  }

  /**
   * Format results for Telegram
   */
  formatResultsForTelegram(analysis) {
    const emoji = analysis.passed ? '✅' : '❌';
    const status = analysis.passed ? 'PASSED' : 'FAILED';

    return `${emoji} **Tests ${status}**

📊 Results:
• Total: ${analysis.total}
• ✅ Passed: ${analysis.passed}
• ❌ Failed: ${analysis.failed}
• ⏭️ Skipped: ${analysis.skipped}
• 📈 Pass Rate: ${analysis.passRate}%

${analysis.failed > 0 ? '⚠️ Please review failed tests before merging.' : '✅ All tests passing!'}`;
  }

  /**
   * Check test coverage
   */
  async checkCoverage(project) {
    const workDir = `/workspace/${project}`;
    
    const commands = [
      `cd ${workDir}`,
      'npm run test:coverage || mvn jacoco:report || pytest --cov=./',
    ];

    const result = await openhands.executeCommands(commands);
    
    return {
      success: result.success,
      output: result.output,
    };
  }

  /**
   * Validate API contracts
   */
  async validateApiContract(endpoints) {
    const prompt = `
Validate the API contract for these endpoints:

${JSON.stringify(endpoints, null, 2)}

Check for:
1. Consistent naming conventions
2. Proper HTTP methods
3. Request/response validation
4. Error handling consistency
5. Authentication requirements
6. Rate limiting considerations

Return a validation report.
`;

    return this.callClaude(prompt);
  }
}

module.exports = QATesterAgent;
