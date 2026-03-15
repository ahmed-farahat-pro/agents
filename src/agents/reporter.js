/**
 * 🦉 Nigents - Reporter Agent
 * Sends Telegram updates and reports
 */

const BaseAgent = require('./base-agent');
const logger = require('../utils/logger');
const voice = require('../tools/voice');

class ReporterAgent extends BaseAgent {
  constructor(telegramBot, chatId) {
    const config = require('../../config/agents.json').reporter;
    super(config);
    
    this.bot = telegramBot;
    this.chatId = chatId;
    this.messageQueue = [];
    this.costTracking = {
      daily: 0,
      monthly: 0,
      tasks: {},
    };
  }

  /**
   * Send a text message to Telegram
   */
  async sendMessage(text, options = {}) {
    try {
      if (!this.bot || !this.chatId) {
        logger.info('[Reporter] Would send:', text.substring(0, 100));
        return { success: true, mock: true };
      }

      const result = await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'Markdown',
        ...options,
      });

      logger.info('[Reporter] Message sent');
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error('[Reporter] Failed to send message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a voice message
   */
  async sendVoice(text, options = {}) {
    try {
      if (!this.bot || !this.chatId || process.env.ENABLE_VOICE !== 'true') {
        logger.info('[Reporter] Would send voice:', text.substring(0, 100));
        return { success: true, mock: true };
      }

      // Generate voice using gTTS
      const voicePath = await voice.textToSpeech(text, options.language || 'en');
      
      // Send voice message
      const result = await this.bot.sendVoice(this.chatId, voicePath);

      logger.info('[Reporter] Voice sent');
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error('[Reporter] Failed to send voice:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send progress update
   */
  async sendProgress(message, options = {}) {
    this.emit('progress', { message, timestamp: new Date() });
    return this.sendMessage(message, options);
  }

  /**
   * Send completion report
   */
  async sendCompletionReport(task) {
    const branch = task.branch || task.plan?.branch || 'unknown';
    const message = `
✅ **Task Completed**

**${task.plan?.title || 'Untitled Task'}**

• Branch: \`${branch}\`
• Started: ${this.formatTime(task.startedAt)}
• Completed: ${this.formatTime(task.completedAt)}
• Duration: ${this.calculateDuration(task.startedAt, task.completedAt)}

${task.mrUrl ? `🔗 [View Merge Request](${task.mrUrl})` : ''}

Sleep well! 🌙
`;

    await this.sendMessage(message);
    
    // Also send voice summary
    const voiceText = `Task completed successfully. ${task.plan.title} is ready for review.`;
    await this.sendVoice(voiceText);
  }

  /**
   * Send daily morning report
   */
  async sendMorningReport(tasks) {
    const completed = tasks.filter(t => t.status === 'completed');
    const failed = tasks.filter(t => t.status === 'failed');
    const pending = tasks.filter(t => t.status === 'needs_changes');

    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let message = `🌅 **Good morning! Nigents Daily Report**\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `${date}\n\n`;

    if (completed.length > 0) {
      message += `🟢 **COMPLETED (${completed.length})**\n\n`;
      completed.forEach(task => {
        message += `✅ **${task.plan.project}** — ${task.plan.title}\n`;
        message += `   ${task.mrUrl ? `[MR Link](${task.mrUrl})` : `Branch: ${task.branch}`}\n\n`;
      });
    }

    if (failed.length > 0) {
      message += `\n🔴 **FAILED (${failed.length})**\n\n`;
      failed.forEach(task => {
        message += `❌ **${task.plan.project}** — ${task.plan.title}\n`;
        message += `   Check logs for details\n\n`;
      });
    }

    if (pending.length > 0) {
      message += `\n🟡 **NEEDS CHANGES (${pending.length})**\n\n`;
      pending.forEach(task => {
        message += `⚠️ **${task.plan.project}** — ${task.plan.title}\n`;
        message += `   Reviewer requested changes\n\n`;
      });
    }

    // Cost tracking
    const monthlyCost = this.costTracking.monthly.toFixed(2);
    message += `\n💰 **API Cost This Month: $${monthlyCost}**\n`;

    await this.sendMessage(message);

    // Voice summary
    const completedCount = completed.length;
    const voiceText = `Good morning! Nigents completed ${completedCount} task${completedCount !== 1 ? 's' : ''} overnight. Check Telegram for details.`;
    await this.sendVoice(voiceText, { language: 'en' });
  }

  /**
   * Send standup report
   */
  async sendStandupReport(agentStatuses) {
    let message = `🌅 **Daily Standup**\n\n`;

    agentStatuses.forEach(agent => {
      const emoji = this.getStatusEmoji(agent.status);
      message += `${emoji} **${agent.name}** — ${agent.status}\n`;
      if (agent.currentTask) {
        message += `   Working on: ${agent.currentTask}\n`;
      }
      message += `\n`;
    });

    await this.sendMessage(message);
  }

  /**
   * Send project health report
   */
  async sendProjectHealthReport(project, health) {
    const statusEmoji = health.status === 'good' ? '🟢' : health.status === 'warning' ? '🟡' : '🔴';

    let message = `${statusEmoji} **${project} Health Report**\n\n`;
    message += `Open MRs: ${health.openMRs}\n`;
    message += `Last Commit: ${health.lastCommit}\n`;
    message += `Test Status: ${health.testStatus}\n`;
    message += `Security Issues: ${health.securityIssues}\n`;

    await this.sendMessage(message);
  }

  /**
   * Track API costs
   */
  trackCost(taskId, cost) {
    this.costTracking.daily += cost;
    this.costTracking.monthly += cost;
    this.costTracking.tasks[taskId] = (this.costTracking.tasks[taskId] || 0) + cost;
    
    logger.info(`[Reporter] Cost tracked: $${cost.toFixed(4)} for task ${taskId}`);
  }

  /**
   * Send cost report
   */
  async sendCostReport() {
    const message = `
💰 **API Cost Report**

Daily: $${this.costTracking.daily.toFixed(2)}
Monthly: $${this.costTracking.monthly.toFixed(2)}

Breakdown by agent:
${Object.entries(this.costTracking.tasks)
  .map(([task, cost]) => `• ${task}: $${cost.toFixed(2)}`)
  .join('\n')}
`;

    await this.sendMessage(message);
  }

  /**
   * Send deployment notification
   */
  async sendDeploymentNotification(version, status) {
    const emoji = status === 'success' ? '✅' : '❌';
    const message = `${emoji} **Deployment ${status}**\n\nVersion: ${version}\nTime: ${new Date().toLocaleString()}`;
    
    await this.sendMessage(message);
  }

  /**
   * Helper: Format time
   */
  formatTime(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Helper: Calculate duration
   */
  calculateDuration(start, end) {
    if (!start || !end) return 'N/A';
    const diff = new Date(end) - new Date(start);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  }

  /**
   * Helper: Get status emoji
   */
  getStatusEmoji(status) {
    const emojis = {
      'idle': '⚪',
      'working': '🟡',
      'done': '🟢',
      'error': '🔴',
    };
    return emojis[status] || '⚪';
  }

  /**
   * Send a report based on task type
   */
  async sendReport(task) {
    const reportType = task.type || 'message';
    
    switch (reportType) {
      case 'completion':
        return this.sendCompletionReport(task);
      case 'morning':
        return this.sendMorningReport(task.tasks);
      case 'standup':
        return this.sendStandupReport(task.agents);
      case 'health':
        return this.sendProjectHealthReport(task.project, task.health);
      case 'cost':
        return this.sendCostReport();
      case 'deployment':
        return this.sendDeploymentNotification(task.version, task.status);
      case 'voice':
        return this.sendVoice(task.text, task.options);
      case 'progress':
        return this.sendProgress(task.message, task.options);
      case 'message':
      default:
        return this.sendMessage(task.text || task.message, task.options);
    }
  }

  /**
   * Execute task - required by BaseAgent
   */
  async execute(task) {
    return this.sendReport(task);
  }
}

module.exports = ReporterAgent;
