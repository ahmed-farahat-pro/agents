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
        parse_mode: options.parse_mode || 'Markdown',
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
   * Send a voice message with text fallback
   */
  async sendVoice(text, options = {}) {
    try {
      // Check if bot is available
      if (!this.bot || !this.chatId) {
        logger.info('[Reporter] Would send voice:', text.substring(0, 100));
        return { success: true, mock: true };
      }
      
      // Check if voice is enabled in settings
      if (process.env.ENABLE_VOICE !== 'true') {
        logger.debug('[Reporter] Voice disabled, sending text fallback');
        await this.sendMessage(`🎤 ${text}`, { ...options, parse_mode: 'HTML' });
        return { success: true, textFallback: true };
      }

      // Generate voice using TTS
      const voicePath = await voice.textToSpeech(text, options.language || 'en');
      
      // Send voice message
      const result = await this.bot.sendVoice(this.chatId, voicePath);
      
      // Clean up temp file
      voice.cleanup(voicePath);

      logger.info('[Reporter] Voice sent');
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error('[Reporter] Failed to send voice, using text fallback:', error.message);
      // Fallback to text message
      try {
        await this.sendMessage(`🎤 ${text}`, { ...options, parse_mode: 'HTML' });
        return { success: true, textFallback: true, error: error.message };
      } catch (textError) {
        logger.error('[Reporter] Text fallback also failed:', textError.message);
        return { success: false, error: error.message };
      }
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
    let pipelineLine = '';
    if (task.pipelineStatus && task.pipelineUrl) {
      const status = task.pipelineStatus;
      const emoji = status === 'success' ? '✅' : status === 'failed' ? '❌' : '🔄';
      const label = status === 'success' ? 'passed' : status === 'failed' ? 'failed — do not merge until pipeline passes' : 'running';
      pipelineLine = `• Pipeline: ${emoji} ${label}\n  [View pipeline](${task.pipelineUrl})\n\n`;
    }
    const compileCheckLine = task.compileCheckPassed === false
      ? '• ⚠️ Compile/syntax check failed — review code before merge.\n\n'
      : '';
    const message = `
✅ **Task Completed**

**${task.plan?.title || 'Untitled Task'}**

• Branch: \`${branch}\`
• Started: ${this.formatTime(task.startedAt)}
• Completed: ${this.formatTime(task.completedAt)}
• Duration: ${this.calculateDuration(task.startedAt, task.completedAt)}

${compileCheckLine}${pipelineLine}${task.mrUrl ? `🔗 [View Merge Request](${task.mrUrl})` : ''}

Sleep well! 🌙
`;

    await this.sendMessage(message);

    // Also send voice summary when enabled; do not let voice failure break the flow
    try {
      const voiceText = `Task completed successfully. ${task.plan?.title || 'Task'} is ready for review.`;
      await this.sendVoice(voiceText);
    } catch (voiceErr) {
      logger.warn('[Reporter] Voice summary skipped:', voiceErr.message);
    }
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
        if (task.mrUrl) {
          message += `   🔗 [MR](${task.mrUrl})\n`;
        }
        message += `   ⏱️ ${this.calculateDuration(task.startedAt, task.completedAt)}\n\n`;
      });
    }

    if (failed.length > 0) {
      message += `🔴 **FAILED (${failed.length})**\n\n`;
      failed.forEach(task => {
        message += `❌ **${task.plan.project}** — ${task.plan.title}\n`;
        message += `   Error: ${task.error || 'Unknown error'}\n\n`;
      });
    }

    if (pending.length > 0) {
      message += `🟡 **NEEDS CHANGES (${pending.length})**\n\n`;
      pending.forEach(task => {
        message += `⚠️ **${task.plan.project}** — ${task.plan.title}\n\n`;
      });
    }

    if (completed.length === 0 && failed.length === 0 && pending.length === 0) {
      message += `😴 No activity during the night.\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Use /status for full details.`;

    await this.sendMessage(message);

    // Send voice summary with fallback
    const voiceText = `Good morning! Overnight, I completed ${completed.length} tasks, ${failed.length} failed, and ${pending.length} need changes.`;
    await this.sendVoice(voiceText, { language: 'en' });
  }

  /**
   * Format timestamp for display
   */
  formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  }

  /**
   * Calculate duration between two timestamps
   */
  calculateDuration(start, end) {
    if (!start || !end) return 'N/A';
    const diff = new Date(end) - new Date(start);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Track API cost for a task
   */
  trackCost(taskId, cost) {
    if (!this.costTracking.tasks[taskId]) {
      this.costTracking.tasks[taskId] = 0;
    }
    this.costTracking.tasks[taskId] += cost;
    this.costTracking.daily += cost;
    this.costTracking.monthly += cost;
  }

  /**
   * Get cost report
   */
  getCostReport() {
    return {
      ...this.costTracking,
      taskCount: Object.keys(this.costTracking.tasks).length,
    };
  }
}

module.exports = ReporterAgent;
