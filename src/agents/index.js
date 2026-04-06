/**
 * Nigents - Agent Exports (10 Agents)
 */

const OrchestratorAgent = require('./orchestrator');
const PlannerAgent = require('./planner');
const BackendDevAgent = require('./backend-dev');
const FrontendDevAgent = require('./frontend-dev');
const QATesterAgent = require('./qa-tester');
const CodeReviewerAgent = require('./code-reviewer');
const ReporterAgent = require('./reporter');
const DevOpsAgent = require('./devops');
const SecurityAgent = require('./security');
const ArchitectAgent = require('./architect');

module.exports = {
  OrchestratorAgent,
  PlannerAgent,
  BackendDevAgent,
  FrontendDevAgent,
  QATesterAgent,
  CodeReviewerAgent,
  ReporterAgent,
  DevOpsAgent,
  SecurityAgent,
  ArchitectAgent,
};
