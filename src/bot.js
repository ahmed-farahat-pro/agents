/**
 * Nigents - Telegram Bot with Persistent Chat & Voice AI
 * Main entry point for the AI agent team
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./utils/logger');
const chatStorage = require('./utils/chat-storage');
const voiceProcessor = require('./utils/voice-processor');
const gitlab = require('./tools/gitlab');
const path = require('path');
const fs = require('fs');
const intentRouter = require('./utils/intent-router');
const aiClient = require('./utils/ai-client');
const sharedConfig = require('./utils/shared-config');

// Reload shared config to get latest API keys from file
sharedConfig.applyToEnv();
logger.info('[Bot] Shared config applied, API keys reloaded');

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
  activeChats: new Map(),
};

// Cache for GitLab projects
let cachedProjects = [];
let lastFetchTime = 0;

logger.info('Nigents Bot starting...');

// Helper function to check authorization
function isAuthorized(userChatId) {
  return botState.authorizedUsers.has(userChatId.toString());
}

// Helper: Get projects from GitLab (with cache)
async function getGitLabProjects(forceRefresh = false) {
  const now = Date.now();
  // Cache for 5 minutes
  if (!forceRefresh && cachedProjects.length > 0 && (now - lastFetchTime) < 300000) {
    return cachedProjects;
  }
  
  try {
    const projects = await gitlab.listProjects(20);
    cachedProjects = projects;
    lastFetchTime = now;
    return projects;
  } catch (error) {
    logger.error('Failed to fetch GitLab projects:', error);
    return cachedProjects; // Return cached if available
  }
}

// Helper: Get active project from GitLab cache
async function getActiveProject() {
  const projects = await getGitLabProjects();
  return projects[0] || null;
}

// Helper: Send message with voice option
async function sendMessageWithVoice(userId, chatId, text, options = {}) {
  const settings = chatStorage.getUserSettings(userId);
  
  // Always send text first
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  
  // Add to chat history
  chatStorage.addMessage(userId, 'assistant', text, { type: 'text' });
  
  // Send voice if enabled and not disabled for this message
  if (settings.voiceResponse && options.voice !== false) {
    try {
      const lang = options.language || settings.language || 'en';
      const voiceFile = await voiceProcessor.textToSpeech(text.replace(/[*_`]/g, ''), lang);
      await bot.sendVoice(chatId, voiceFile);
      voiceProcessor.cleanup(voiceFile);
    } catch (error) {
      logger.warn('[Bot] Voice send failed:', error.message);
    }
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// /start command
bot.onText(/\/start/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const welcomeMessage = `**Welcome to Nigents!**

Your AI development team. Send tasks via voice or text, and I'll handle the rest.

**Just Talk To Me!**
Send voice notes or text naturally:
• "Add login feature with JWT"
• "Switch to the frontend project"  
• "Use Moonshot AI instead"
• "What's the status?"
• "I want to talk to the backend developer"

**Quick Commands:**
• /plan <task> — Create implementation plan
• /approve — Approve plan
• /projects — List projects
• /project <id> — Switch project
• /models — List AI models
• /model <id> — Switch AI model
• /status — Check status
• /ask <question> — Ask about code

**Agent Chat:**
• /meet <agent> — Chat with specific agent
  (planner, backend, frontend, qa, reviewer)

**Management:**
• /run — Start implementation now
• /queue — List all tasks with IDs
• /cancel <id> — Cancel a queued/approved task
• /stop <id> — Stop a running task
• /remove <id> — Remove a pending plan
• /clear — Clear all completed/cancelled tasks

**Settings:**
• /voice — Toggle voice responses on/off
• /settings — View your settings
• /reload — Reload configuration and API keys
• /debug — Show debug information

I understand Arabic and English voice messages!`;

  await sendMessageWithVoice(msg.from.id, msg.chat.id, welcomeMessage, { voice: false });
});

// /settings command - Show user settings
bot.onText(/\/settings/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const settings = chatStorage.getUserSettings(msg.from.id);
  
  let message = '**Your Settings**\n\n';
  message += `Voice Responses: ${settings.voiceResponse ? 'ON' : 'OFF'}\n`;
  message += `Language: ${settings.language === 'auto' ? 'Auto-detect' : settings.language.toUpperCase()}\n`;
  message += `Default Project: ${settings.defaultProject || 'Not set'}\n`;
  message += `Preferred AI: ${settings.preferredAI || 'Auto'}\n\n`;
  message += '**Commands:**\n';
  message += '/voice - Toggle voice responses\n';
  message += '/clearhistory - Clear chat history';

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /voice command - Toggle voice responses
bot.onText(/\/voice/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const newValue = chatStorage.toggleVoiceResponse(msg.from.id);
  const status = newValue ? 'ON' : 'OFF';
  
  await bot.sendMessage(msg.chat.id, `Voice responses are now **${status}**.\n\nI will ${newValue ? 'send voice messages' : 'only send text messages'} in response to your commands.`, { parse_mode: 'Markdown' });
});

// /clearhistory command - Clear chat history
bot.onText(/\/clearhistory/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  chatStorage.clearChatHistory(msg.from.id);
  await bot.sendMessage(msg.chat.id, 'Chat history cleared.');
});

// /debug command - Show debug info
bot.onText(/\/debug/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const stats = chatStorage.getStats();
  const pending = chatStorage.getPendingPlan(msg.from.id);
  const providers = aiClient.getAvailableProviders();
  
  let message = '**Debug Info**\n\n';
  message += `Data Directory: \`${stats.dataDir}\`\n`;
  message += `Pending Plans: ${stats.pendingPlansCount}\n`;
  message += `Chat Histories: ${stats.chatHistoryCount}\n`;
  message += `User Settings: ${stats.userSettingsCount}\n\n`;
  
  message += `**AI Providers:**\n`;
  Object.entries(providers).forEach(([key, p]) => {
    message += `${p.enabled ? '✅' : '❌'} ${p.name}\n`;
  });
  message += '\n';
  
  if (pending) {
    message += `**Your Pending Plan:**\n`;
    message += `Task: ${pending.task}\n`;
    message += `Created: ${new Date(pending.createdAt).toLocaleString()}\n`;
  } else {
    message += `**Your Pending Plan:** None\n`;
  }
  
  message += `\nAll Pending Users: ${stats.pendingPlans.join(', ') || 'None'}`;
  
  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /reload command - Reload config and API keys
bot.onText(/\/reload/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendMessage(msg.chat.id, 'Reloading configuration...');
  
  try {
    // Reload shared config
    sharedConfig.applyToEnv();
    
    // Get updated provider status
    const providers = aiClient.getAvailableProviders();
    
    let message = '**Configuration Reloaded**\n\n';
    message += '**AI Providers:**\n';
    Object.entries(providers).forEach(([key, p]) => {
      message += `${p.enabled ? '✅' : '❌'} ${p.name}\n`;
    });
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('[Bot] Reload failed:', error);
    await bot.sendMessage(msg.chat.id, `Error reloading: ${error.message}`);
  }
});

// /plan command - Shows project selection from GitLab
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1].trim();
  const userId = msg.from.id;
  
  await bot.sendChatAction(msg.chat.id, 'typing');
  
  try {
    const projects = await getGitLabProjects();
    
    if (projects.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No projects found in your GitLab account. Please check your GITLAB_TOKEN and GITLAB_NAMESPACE.');
      return;
    }
    
    // Store pending plan persistently
    logger.info(`[Bot] Storing pending plan for user ${userId}: ${task}`);
    chatStorage.setPendingPlan(userId, {
      task,
      chatId: msg.chat.id,
      username: msg.from.username || msg.from.first_name,
    });
    
    // Verify it was saved
    const verify = chatStorage.getPendingPlan(userId);
    logger.info(`[Bot] Verified pending plan: ${verify ? 'FOUND' : 'NOT FOUND'}`);
    
    // Show project selection
    let message = `**Task:** ${task}\n\n`;
    message += '**Select a project by typing:**\n';
    message += '`/planwith <project-id>`\n\n';
    message += '**Your GitLab Projects:**\n';
    
    projects.slice(0, 10).forEach((project, index) => {
      message += `${index + 1}. **${project.name}**\n   ID: \`${project.id}\`\n`;
    });
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
    // Add to chat history
    chatStorage.addMessage(userId, 'user', `/plan ${task}`, { type: 'command' });
    chatStorage.addMessage(userId, 'assistant', message, { type: 'project_selection' });
    
  } catch (error) {
    logger.error('Failed to load projects for plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects from GitLab. Please check your configuration.');
  }
});

// /planwith command - Create plan with selected project
bot.onText(/\/planwith (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  const userId = msg.from.id;
  
  // Get pending plan from persistent storage
  logger.info(`[Bot] Looking for pending plan for user ${userId}`);
  const pending = chatStorage.getPendingPlan(userId);
  
  if (!pending) {
    logger.warn(`[Bot] No pending plan found for user ${userId}`);
    await bot.sendMessage(msg.chat.id, 'No pending plan found. Please use `/plan <task>` first to create a plan.\n\nUse `/debug` to see storage status.');
    return;
  }
  
  logger.info(`[Bot] Found pending plan: ${pending.task}`);
  
  try {
    const projects = await getGitLabProjects();
    const project = projects.find(p => p.id === projectId || p.fullPath === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found. Use /projects to see available projects.`);
      return;
    }
    
    // Delete pending plan (we're processing it now)
    chatStorage.deletePendingPlan(userId);
    
    await bot.sendChatAction(msg.chat.id, 'typing');
    const statusMsg = await bot.sendMessage(msg.chat.id, `Analyzing ${project.name}... This may take a moment.`);

    // Add to chat history
    chatStorage.addMessage(userId, 'user', `/planwith ${projectId}`, { type: 'command' });

    const result = await orchestrator.processCommand(`/plan ${pending.task}`, {
      userId: userId,
      chatId: msg.chat.id,
      project: project.fullPath,
      projectInfo: project,
    });

    await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

    if (result.success) {
      await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
      
      // Add to chat history
      chatStorage.addMessage(userId, 'assistant', result.message, { 
        type: 'plan',
        planId: result.plan?.id,
      });
      
      // Send voice confirmation
      const voiceText = `Plan created for ${pending.task}. Complexity: ${result.plan.complexity}, estimated ${result.plan.estimatedHours} hours. Reply with /approve to start.`;
      await sendMessageWithVoice(userId, msg.chat.id, voiceText, { voice: true, language: 'en' });
    } else {
      await bot.sendMessage(msg.chat.id, `Error: ${result.message}`);
      chatStorage.addMessage(userId, 'assistant', `Error: ${result.message}`, { type: 'error' });
    }
    
  } catch (error) {
    logger.error('Failed to create plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error creating plan. Please try again.');
  }
});

// /projects command - List from GitLab
bot.onText(/\/projects/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const projects = await getGitLabProjects(true); // Force refresh
    
    if (projects.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No projects found. Please check your GITLAB_TOKEN and GITLAB_NAMESPACE in .env file.');
      return;
    }
    
    let message = '**Your GitLab Projects:**\n\n';
    projects.forEach((project, index) => {
      message += `${index + 1}. **${project.name}**\n`;
      message += `   ID: \`${project.id}\`\n`;
      message += `   Repo: \`${project.fullPath}\`\n`;
      if (project.description) {
        message += `   ${project.description.substring(0, 50)}${project.description.length > 50 ? '...' : ''}\n`;
      }
      message += '\n';
    });
    
    message += '**To create a plan:** `/plan <task>` then select project\n';
    message += '**To switch default:** `/project <project-id>`';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    chatStorage.addMessage(msg.from.id, 'assistant', message, { type: 'projects_list' });
  } catch (error) {
    logger.error('Failed to load projects:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects from GitLab. Check your GITLAB_TOKEN.');
  }
});

// /project command - Set default project
bot.onText(/\/project (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  
  try {
    const projects = await getGitLabProjects();
    const project = projects.find(p => p.id === projectId || p.fullPath === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found. Use /projects to see available projects.`);
      return;
    }
    
    // Save as default in user settings
    chatStorage.setUserSettings(msg.from.id, { defaultProject: project.fullPath });
    
    await bot.sendMessage(msg.chat.id, 
      `Default project set to: **${project.name}**\nRepo: \`${project.fullPath}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to switch project:', error);
    await bot.sendMessage(msg.chat.id, 'Error switching project');
  }
});

// /models command - List all AI models
bot.onText(/\/models/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const providers = aiClient.getAvailableProviders();
    const settings = chatStorage.getUserSettings(msg.from.id);
    
    let message = '**Available AI Models**\n\n';
    
    for (const [key, provider] of Object.entries(providers)) {
      const status = provider.enabled ? '✅' : '❌';
      message += `${status} **${provider.name}** (${key})\n`;
      
      if (provider.enabled) {
        message += `   Models: ${provider.models.join(', ')}\n`;
        message += `   Default: \`${provider.defaultModel}\`\n`;
      } else {
        message += `   (API key not configured)\n`;
      }
      message += '\n';
    }
    
    message += '**Usage:**\n';
    message += '`/model <provider>` - Set default provider\n';
    message += 'Example: `/model anthropic` or `/model moonshot`\n\n';
    message += `Your current preference: ${settings.preferredAI || 'Auto (Cheapest)'}`;
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    chatStorage.addMessage(msg.from.id, 'assistant', message, { type: 'models_list' });
  } catch (error) {
    logger.error('Failed to load models:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading AI models.');
  }
});

// /model command - Set default AI provider
bot.onText(/\/model (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const providerName = match[1].trim().toLowerCase();
  
  try {
    const providers = aiClient.getAvailableProviders();
    
    // Check if provider exists
    if (!providers[providerName]) {
      const available = Object.keys(providers).join(', ');
      await bot.sendMessage(msg.chat.id, 
        `Unknown provider "${providerName}".\n\nAvailable: ${available}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Check if provider is enabled
    if (!providers[providerName].enabled) {
      await bot.sendMessage(msg.chat.id, 
        `Provider "${providerName}" is not available. API key not configured.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Save preference
    chatStorage.setUserSettings(msg.from.id, { preferredAI: providerName });
    
    await bot.sendMessage(msg.chat.id, 
      `✅ Default AI provider set to: **${providers[providerName].name}**\n` +
      `Default model: \`${providers[providerName].defaultModel}\`\n\n` +
      `This provider will be used for your future requests.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to set model:', error);
    await bot.sendMessage(msg.chat.id, 'Error setting AI provider.');
  }
});

// /approve command
bot.onText(/\/approve/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/approve', {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await sendMessageWithVoice(msg.from.id, msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /status command
bot.onText(/\/status/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const result = await orchestrator.processCommand('/status', {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /run command
bot.onText(/\/run/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendMessage(msg.chat.id, 'Starting implementation...');

  const result = await orchestrator.processCommand('/run', {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await sendMessageWithVoice(msg.from.id, msg.chat.id, result.message, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(msg.chat.id, `Error: ${result.message}`);
  }
});

// /queue command
bot.onText(/\/queue/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand('/queue', {});
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /cancel command
bot.onText(/\/cancel (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const taskId = match[1].trim();
  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand(`/cancel ${taskId}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /stop command
bot.onText(/\/stop (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const taskId = match[1].trim();
  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand(`/stop ${taskId}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /remove command
bot.onText(/\/remove (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const taskId = match[1].trim();
  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand(`/remove ${taskId}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// /clear command
bot.onText(/\/clear/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  const result = await orchestrator.processCommand('/clear', {
    userId: msg.from.id,
    chatId: msg.chat.id,
  });

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
});

// ============================================================================
// VOICE MESSAGE HANDLER WITH AI
// ============================================================================

bot.on('voice', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const userId = msg.from.id;
  const settings = chatStorage.getUserSettings(userId);
  
  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    // Download voice file
    const voiceFile = await voiceProcessor.downloadVoiceFile(bot, msg.voice.file_id);
    
    // Transcribe with AI
    const transcription = await voiceProcessor.transcribe(voiceFile, settings.language !== 'auto' ? settings.language : null);
    voiceProcessor.cleanup(voiceFile);

    if (!transcription.success) {
      await bot.sendMessage(msg.chat.id, `Failed to transcribe voice: ${transcription.error}. Please try again or use text.`);
      return;
    }

    const transcribedText = transcription.text;
    const language = transcription.language;
    
    // Show transcribed text
    await bot.sendMessage(msg.chat.id, `You said: "${transcribedText}"`);
    
    // Add to chat history
    chatStorage.addMessage(userId, 'user', transcribedText, { type: 'voice', language });
    
    // Get chat history for context
    const chatHistory = chatStorage.getChatHistory(userId, 10);

    // Route via intent router
    await bot.sendChatAction(msg.chat.id, 'typing');
    const intentResult = await intentRouter.detectIntent(transcribedText);

    if (!intentResult.success) {
      const errorMsg = 'Sorry, I did not understand. Try saying things like:\n\n• "Create a plan for adding login"\n• "Show my projects"\n• "What is the status?"';
      await bot.sendMessage(msg.chat.id, errorMsg);
      return;
    }

    // Generate AI response based on context
    const aiResponse = await voiceProcessor.generateResponse(
      transcription,
      chatHistory,
      settings
    );

    // Handle specific intents
    switch (intentResult.intent) {
      case 'PLAN':
        if (intentResult.extracted_task) {
          // Store the pending plan persistently
          chatStorage.setPendingPlan(userId, {
            task: intentResult.extracted_task,
            chatId: msg.chat.id,
            fromVoice: true,
            language: language,
          });
          
          // Get projects and show selection
          await bot.sendChatAction(msg.chat.id, 'typing');
          const projects = await getGitLabProjects();
          
          if (projects.length === 0) {
            await bot.sendMessage(msg.chat.id, 'No projects found. Please check your GitLab configuration.');
            return;
          }
          
          // Show project selection
          let projectMsg = `**Task:** ${intentResult.extracted_task}\n\n`;
          projectMsg += '**Select a project by typing:**\n';
          projectMsg += '`/planwith <project-id>`\n\n';
          projectMsg += '**Your projects:**\n';
          
          projects.slice(0, 10).forEach((p, i) => {
            projectMsg += `${i + 1}. **${p.name}**\n   ID: \`${p.id}\`\n`;
          });
          
          await bot.sendMessage(msg.chat.id, projectMsg, { parse_mode: 'Markdown' });
          chatStorage.addMessage(userId, 'assistant', projectMsg, { type: 'project_selection' });
          
          // Send voice confirmation if enabled
          const voiceResponse = language === 'ar' 
            ? `تم استلام طلبك: ${intentResult.extracted_task}. اختر مشروعاً من القائمة.`
            : `I received your request: ${intentResult.extracted_task}. Please select a project from the list.`;
          
          if (settings.voiceResponse) {
            const voiceFile = await voiceProcessor.textToSpeech(voiceResponse, language);
            await bot.sendVoice(msg.chat.id, voiceFile);
            voiceProcessor.cleanup(voiceFile);
          }
        }
        break;
        
      case 'PROJECT_LIST':
        bot.emitText(msg, '/projects');
        break;
        
      case 'STATUS':
        bot.emitText(msg, '/status');
        break;
        
      case 'APPROVE':
        bot.emitText(msg, '/approve');
        break;
      
      case 'QUEUE':
        bot.emitText(msg, '/queue');
        break;
      
      case 'CANCEL':
        if (intentResult.extracted_task_id) {
          bot.emitText(msg, `/cancel ${intentResult.extracted_task_id}`);
        } else {
          await bot.sendMessage(msg.chat.id, 'Please specify which task to cancel. Say something like "cancel task abc123" or use /queue to see task IDs.');
        }
        break;
      
      case 'STOP':
        if (intentResult.extracted_task_id) {
          bot.emitText(msg, `/stop ${intentResult.extracted_task_id}`);
        } else {
          await bot.sendMessage(msg.chat.id, 'Please specify which task to stop. Say something like "stop task abc123" or use /queue to see task IDs.');
        }
        break;
      
      case 'REMOVE':
        if (intentResult.extracted_task_id) {
          bot.emitText(msg, `/remove ${intentResult.extracted_task_id}`);
        } else {
          await bot.sendMessage(msg.chat.id, 'Please specify which pending plan to remove. Say something like "remove plan abc123" or use /queue to see task IDs.');
        }
        break;
      
      case 'CLEAR':
        bot.emitText(msg, '/clear');
        break;
        
      case 'GREETING':
        // Send voice greeting back
        const greetingVoice = language === 'ar'
          ? 'أهلاً بك! أنا نايت أوول، فريق التطوير الذكي. يمكنك إرسال مهامك بالصوت وسأقوم بإنشاء خطط التنفيذ والتنفيذ لك.'
          : 'Hello! I am NightOwl, your AI development team. You can send me tasks by voice and I will create implementation plans and execute them for you.';
        
        if (settings.voiceResponse) {
          const voiceFile = await voiceProcessor.textToSpeech(greetingVoice, language);
          await bot.sendVoice(msg.chat.id, voiceFile);
          voiceProcessor.cleanup(voiceFile);
        } else {
          await bot.sendMessage(msg.chat.id, greetingVoice);
        }
        break;
        
      default:
        // For other intents, send the AI-generated response
        if (aiResponse.success) {
          await bot.sendMessage(msg.chat.id, aiResponse.response);
          chatStorage.addMessage(userId, 'assistant', aiResponse.response, { type: 'ai_response' });
        }
    }

  } catch (error) {
    logger.error('Voice processing error:', error);
    await bot.sendMessage(msg.chat.id, 'Error processing your voice message. Please try again or use text commands.');
  }
});

// ============================================================================
// START SERVER
// ============================================================================

logger.info('Nigents Bot is running!');
logger.info('Features: Persistent chat history, AI voice processing, voice/text toggle');

module.exports = { bot, orchestrator, chatStorage };
