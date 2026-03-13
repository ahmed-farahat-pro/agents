/**
 * 🦉 Nigents - Telegram Bot
 * Main entry point for the AI agent team
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./utils/logger');
const voice = require('./tools/voice');
const gitlab = require('./tools/gitlab');

// Import agents
const {
  OrchestratorAgent,
  PlannerAgent,
  BackendDevAgent,
  FrontendDevAgent,
  QATesterAgent,
  CodeReviewerAgent,
  ReporterAgent,
} = require('./agents');

// Initialize bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  logger.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  process.exit(1);
}

// Create bot with polling
const bot = new TelegramBot(token, { polling: true });

// Initialize agents
const orchestrator = new OrchestratorAgent();
const reporter = new ReporterAgent(bot, chatId);

// Register all agents with orchestrator
orchestrator.registerAgent(new PlannerAgent());
orchestrator.registerAgent(new BackendDevAgent());
orchestrator.registerAgent(new FrontendDevAgent());
orchestrator.registerAgent(new QATesterAgent());
orchestrator.registerAgent(new CodeReviewerAgent());
orchestrator.registerAgent(reporter);

// Bot state
const botState = {
  authorizedUsers: new Set([chatId]),
  activeChats: new Map(), // userId -> agentName for direct chat
};

logger.info('🦉 Nigents Bot starting...');

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// /start command
bot.onText(/\/start/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const welcomeMessage = `
🦉 **Welcome to Nigents!**

Your personal AI development team. Send a task before you sleep, wake up to a finished Merge Request.

**Available Commands:**

📋 **Planning**
• /plan <task> — Create implementation plan
• /approve — Approve plan for implementation
• /run — Start implementing queued tasks

💬 **Questions**
• /ask <question> — Ask about your code

📊 **Status**
• /status — View task queue status
• /queue — List queued tasks
• /standup — Daily agent standup
• /costs — API cost summary

👥 **Agent Chat**
• /meet <agent> — Chat with specific agent
  (planner, backend, frontend, qa, reviewer)

⚙️ **Management**
• /repos — List your GitLab repositories
• /cancel <id> — Cancel a task
• /logs <agent> — View agent logs

🎙️ **Voice Support**
Send voice notes in Arabic or English!

Sleep well! 🌙
`;

  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
  
  // Send voice welcome
  await reporter.sendVoice('Welcome to Nigents! I am your AI development team. How can I help you today?', 'en');
});

// /plan command
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1];
  await bot.sendChatAction(msg.chat.id, 'typing');

  const statusMsg = await bot.sendMessage(msg.chat.id, '📋 Planner is analyzing your request...');

  const result = await orchestrator.processCommand(`/plan ${task}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

  if (result.success) {
    await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
    
    // Send voice summary
    const voiceText = `I've created a plan for: ${task}. It has ${result.plan.complexity} complexity and will take about ${result.plan.estimatedHours} hours. Reply with approve to start implementation.`;
    await reporter.sendVoice(voiceText, 'en');
  } else {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${result.message}`);
  }
});

// /ask command
bot.onText(/\/ask (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const question = match[1];
  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand(`/ask ${question}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  if (result.success) {
    await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
  } else {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${result.message}`);
  }
});

// /approve command
bot.onText(/\/approve/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/approve', {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /run command
bot.onText(/\/run/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendMessage(msg.chat.id, '🚀 Starting implementation...');

  const result = await orchestrator.processCommand('/run', {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /status command
bot.onText(/\/status/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/status', {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /queue command
bot.onText(/\/queue/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/queue', {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /standup command
bot.onText(/\/standup/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/standup', {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /meet command
bot.onText(/\/meet (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const agentName = match[1].toLowerCase();
  const result = await orchestrator.processCommand(`/meet ${agentName}`, {});

  if (result.success) {
    botState.activeChats.set(msg.from.id, agentName);
  }

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /repos command
bot.onText(/\/repos/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  try {
    const connection = await gitlab.testConnection();
    if (connection.success) {
      await bot.sendMessage(msg.chat.id, `✅ Connected to GitLab as ${connection.name} (@${connection.user})`);
    } else {
      await bot.sendMessage(msg.chat.id, `❌ GitLab connection failed: ${connection.error}`);
    }
  } catch (error) {
    await bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// /costs command
bot.onText(/\/costs/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await reporter.sendCostReport();
});

// /cancel command
bot.onText(/\/cancel (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const taskId = match[1];
  const result = await orchestrator.processCommand(`/cancel ${taskId}`, {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// ============================================================================
// VOICE MESSAGE HANDLER
// ============================================================================

bot.on('voice', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    // Download voice file
    const voiceFile = await voice.downloadVoiceFile(bot, msg.voice.file_id);
    
    // Transcribe
    await bot.sendMessage(msg.chat.id, '🎙️ Transcribing voice message...');
    
    const transcription = await voice.speechToText(voiceFile);
    
    // Cleanup
    voice.cleanup(voiceFile);

    if (!transcription.success) {
      await bot.sendMessage(msg.chat.id, '❌ Failed to transcribe voice message');
      return;
    }

    // Show transcription
    await bot.sendMessage(msg.chat.id, `📝 Transcribed: "${transcription.text}"`);

    // Process as command
    const result = await orchestrator.processCommand(transcription.text, {
      userId: msg.from.id,
      chatId: msg.chat.id,
      isVoice: true,
      detectedLanguage: transcription.language,
    });

    if (result.message) {
      await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    logger.error('Voice processing error:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error processing voice message');
  }
});

// ============================================================================
// GENERAL MESSAGE HANDLER (for agent chat)
// ============================================================================

bot.on('message', async (msg) => {
  // Skip commands and voice
  if (msg.text?.startsWith('/') || msg.voice) return;
  if (!isAuthorized(msg.chat.id)) return;

  // Check if user is in direct chat with an agent
  const activeAgent = botState.activeChats.get(msg.from.id);
  if (activeAgent) {
    await bot.sendChatAction(msg.chat.id, 'typing');
    
    // Route to specific agent
    const agent = orchestrator.agents.get(activeAgent);
    if (agent) {
      const result = await agent.callClaude(msg.text);
      await bot.sendMessage(msg.chat.id, result.content, { parse_mode: 'Markdown' });
    }
  }
});

// ============================================================================
// ORCHESTRATOR EVENT LISTENERS
// ============================================================================

orchestrator.on('taskStarted', (data) => {
  logger.info('Task started:', data);
});

orchestrator.on('taskCompleted', (data) => {
  logger.info('Task completed:', data);
});

orchestrator.on('planApproved', (data) => {
  reporter.sendMessage(`✅ Plan approved: ${data.plan.title}`);
});

orchestrator.on('implementationStarted', (data) => {
  reporter.sendMessage('🚀 Starting overnight implementation. Sleep well! 🌙');
});

orchestrator.on('implementationCompleted', (data) => {
  reporter.sendCompletionReport(data.task);
});

orchestrator.on('agentStatusChange', (data) => {
  logger.info(`Agent ${data.agent} status: ${data.status}`);
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isAuthorized(chatId) {
  return botState.authorizedUsers.has(String(chatId));
}

// Error handling
bot.on('polling_error', (error) => {
  logger.error('Telegram polling error:', error);
});

bot.on('error', (error) => {
  logger.error('Telegram bot error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Nigents...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down Nigents...');
  bot.stopPolling();
  process.exit(0);
});

logger.info('🦉 Nigents Bot is running!');

// Export for testing
module.exports = { bot, orchestrator, reporter };
