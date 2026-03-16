/**
 * Nigents - Telegram Bot with Persistent Chat & Voice AI
 * Main entry point for the AI agent team
 */

require('dotenv').config();

// Single instance check
const singleInstance = require('./utils/single-instance');
if (!singleInstance.acquire()) {
  console.error('[Bot] Another instance is already running. Exiting.');
  process.exit(1);
}
singleInstance.startHeartbeat();

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./utils/logger');
const chatStorage = require('./utils/chat-storage');
const chatHistory = require('./utils/chat-history');
const voiceProcessor = require('./utils/voice-processor');
const gitlab = require('./tools/gitlab');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
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
const bot = new TelegramBot(token, { 
  polling: {
    interval: 300, // ms between polling
    autoStart: true,
    params: {
      timeout: 10, // Timeout for long polling
    },
  },
});

// Properly stop polling on exit
function stopBot() {
  logger.info('[Bot] Stopping bot polling...');
  bot.stopPolling();
  singleInstance.release();
  logger.info('[Bot] Bot stopped');
  process.exit(0);
}

// Helper function to escape HTML for Telegram messages
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

process.on('SIGINT', stopBot);
process.on('SIGTERM', stopBot);
process.on('SIGUSR2', stopBot); // PM2 reload signal

// Memory monitoring and cleanup
function logMemoryUsage() {
  const used = process.memoryUsage();
  logger.info('[Bot] Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  });
}

// Log memory every 5 minutes
setInterval(logMemoryUsage, 5 * 60 * 1000);

// Force garbage collection hint every 10 minutes (if enabled)
setInterval(() => {
  if (global.gc) {
    logger.info('[Bot] Running garbage collection...');
    global.gc();
    logMemoryUsage();
  }
}, 10 * 60 * 1000);

// Memory leak prevention - cleanup old sessions periodically
setInterval(() => {
  logger.info('[Bot] Running periodic cleanup...');
  // Clear any old pending plans (older than 24 hours)
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  // This will be handled by the orchestrator's memory limits
  if (orchestrator && orchestrator.taskQueue) {
    const initialSize = orchestrator.taskQueue.length;
    orchestrator.taskQueue = orchestrator.taskQueue.filter(task => {
      if (task.createdAt && new Date(task.createdAt).getTime() < cutoff) {
        return task.status === 'running' || task.status === 'approved'; // Keep active tasks
      }
      return true;
    });
    const removed = initialSize - orchestrator.taskQueue.length;
    if (removed > 0) {
      logger.info(`[Bot] Cleaned up ${removed} old tasks from queue`);
    }
  }
}, 30 * 60 * 1000); // Every 30 minutes

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

// Helper: Log user message to chat history
function logUserMessage(userId, text, type = 'text', metadata = {}) {
  // Start session if not exists
  chatHistory.startSession(userId, metadata.userInfo || {});
  
  // Add message
  chatHistory.addMessage(userId, {
    role: 'user',
    text,
    type,
    ...metadata,
  });
}

// Helper: Log bot message to chat history
function logBotMessage(userId, text, type = 'text', metadata = {}) {
  chatHistory.addMessage(userId, {
    role: 'assistant',
    text,
    type,
    ...metadata,
  });
}

// Helper: Send message with voice option
async function sendMessageWithVoice(userId, chatId, text, options = {}) {
  const settings = await chatStorage.getUserSettings(userId);
  
  // Always send text first
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
  
  // Add to chat history (both systems)
  await chatStorage.addMessage(userId, 'assistant', text, { type: 'text' });
  logBotMessage(userId, text, options.type || 'text', { 
    voice: settings.voiceResponse && options.voice !== false,
    ...options.metadata,
  });
  
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

  // Use HTML parse mode instead of Markdown to avoid parsing issues with < > characters
  const welcomeMessage = `<b>Welcome to Nigents!</b>

Your AI development team. Send tasks via voice or text, and I'll handle the rest.

<b>Just Talk To Me!</b>
Send voice notes or text naturally:
• "Add login feature with JWT"
• "Switch to the frontend project"  
• "Use Moonshot AI instead"
• "What's the status?"
• "I want to talk to the backend developer"

<b>Quick Commands:</b>
• /plan task — Create implementation plan (interactive)
• /quickplan task | project — Create plan directly
• /plans — List your pending plans
• /approve — Approve plan
• /projects — List projects
• /project id — Switch project
• /models — List AI models
• /model id — Switch AI model
• /status — Check status
• /ask question — Ask about code

<b>Agent Chat:</b>
• /meet agent — Chat with specific agent
  (planner, backend, frontend, qa, reviewer)

<b>Management:</b>
• /run — Start implementation now
• /queue — List all tasks with IDs
• /cancel id — Cancel a queued/approved task
• /stop id — Stop a running task
• /remove id — Remove a pending plan
• /clear — Clear all completed/cancelled tasks

<b>System:</b>
• /status — Check system status
• /testmcp — Test MCP servers & GitLab
• /initmcp — Initialize MCP servers
• /findproject query — Search GitLab projects
• /migrate — Fix database issues

<b>Settings:</b>
• /voice — Toggle voice responses on/off
• /settings — View your settings
• /models — Select AI provider (interactive)
• /model provider model — Switch AI model
• /agentmodels — Show agent models
• /setagent agent provider model — Change agent model
• /setallagents provider model — Set all agents
• /models — Interactive AI model selection
• /usemodel provider model — Set default AI model
• /addopenai — Add OpenAI-compatible API
• /addglm key model — Add Zhipu GLM quickly
• /addmoonshot key model — Add Moonshot AI quickly
• /mymodels — List all your AI models
• /usecustommodel key — Use a custom model
• /testmodel — Test AI model connection
• /setallagents provider model — Set all agents
• /setagent agent provider model — Set one agent
• /reload — Reload configuration and API keys
• /debug — Show debug information

I understand Arabic and English voice messages!`;

  // Send without Markdown to avoid parsing issues
  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
});

// /settings command - Show user settings
bot.onText(/\/settings/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const settings = await chatStorage.getUserSettings(msg.from.id);
  
  let message = '**Your Settings**\n\n';
  message += `Voice Responses: ${settings.voiceResponse ? 'ON' : 'OFF'}\n`;
  message += `Language: ${settings.language === 'auto' ? 'Auto-detect' : settings.language.toUpperCase()}\n`;
  message += `Default Project: ${settings.defaultProject || 'Not set'}\n`;
  message += `Preferred AI: ${settings.preferredAI || 'Auto'}\n`;
  message += `Preferred Model: ${settings.preferredModel || 'Default'}\n\n`;
  message += '**Commands:**\n';
  message += '/voice - Toggle voice responses\n';
  message += '/models - Select AI provider and model\n';
  message += '/clearhistory - Clear chat history';

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /voice command - Toggle voice responses
bot.onText(/\/voice/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const newValue = await chatStorage.toggleVoiceResponse(msg.from.id);
  const status = newValue ? 'ON' : 'OFF';
  
  await bot.sendMessage(msg.chat.id, `Voice responses are now **${status}**.\n\nI will ${newValue ? 'send voice messages' : 'only send text messages'} in response to your commands.`, { parse_mode: 'Markdown' });
});

// /clearhistory command - Clear chat history
bot.onText(/\/clearhistory/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await chatStorage.clearChatHistory(msg.from.id);
  await bot.sendMessage(msg.chat.id, 'Chat history cleared.');
});

// /addmodel command - Add custom AI model
bot.onText(/\/addmodel/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const message = `**Add Custom AI Model**

To add a custom AI model, please send:

\`addmodel <name>|<api_key>|<base_url>|<model_name>\`

**Example:**
\`addmodel Kimi 2.5|sk-your-key|https://api.moonshot.cn/v1|kimi-k2-5\`

**Parameters:**
• name: Display name (e.g., "Kimi 2.5")
• api_key: Your API key
• base_url: API base URL
• model_name: Model identifier

**Quick Commands:**
• /addglm - Add Zhipu GLM model (easier)
• /addmoonshot - Add Moonshot model (easier)

**Popular presets:**
• **Zhipu GLM (Coding):** base_url=\`https://api.z.ai/api/coding/paas/v4\`
  Models: glm-5, glm-4.5, glm-4, glm-4-plus, glm-4-flash
• **Moonshot:** base_url=\`https://api.moonshot.cn/v1\`
  Models: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
• **OpenRouter:** base_url=\`https://openrouter.ai/api/v1\``;

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /addglm command - Quick add Zhipu GLM model
bot.onText(/\/addglm(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const args = match[1];
  
  // If no args, show help
  if (!args) {
    const message = `**Add Zhipu GLM Model**

Send your API key and optionally the model:

\`/addglm <api_key> [model]\`

**Examples:**
\`/addglm your-api-key-here\` (uses glm-5)
\`/addglm your-api-key-here glm-4\`
\`/addglm your-api-key-here glm-4-plus\`

**Available Models:**
• glm-5 - Best for coding (default)
• glm-4.5 - Advanced reasoning
• glm-4 - Balanced
• glm-4-plus - Enhanced version
• glm-4-flash - Fast, cheaper
• glm-4v - Vision capable
• glm-4-long - Long context

**Get API Key & Credits:**
• Get API key: https://z.ai/ → Profile → API Keys
• Buy credits: https://z.ai/devpack/overview
  - API Resource Pack: Pay-as-you-go API credits
  - DevPack Lite ($3/mo): ~400 prompts/week
  - DevPack Pro ($15/mo): ~2,000 prompts/week`;
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    return;
  }

  // Parse: api_key [model]
  const parts = args.trim().split(/\s+/);
  const apiKey = parts[0];
  const modelName = parts[1] || 'glm-5';
  
  if (!apiKey || apiKey.length < 10) {
    await bot.sendMessage(msg.chat.id, '❌ Invalid API key. Please provide a valid Zhipu API key.');
    return;
  }

  try {
    const baseUrl = 'https://api.z.ai/api/coding/paas/v4';
    const name = `GLM ${modelName.toUpperCase()}`;
    const providerKey = `zhipu_${modelName.replace(/[^a-z0-9]/g, '_')}`;

    // Store in shared config
    const customModels = sharedConfig.getFullConfig().customModels || {};
    customModels[providerKey] = {
      name: name,
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: modelName,
      enabled: true,
      addedBy: msg.from.id,
      addedAt: new Date().toISOString(),
    };

    sharedConfig.saveConfig({
      ...sharedConfig.getFullConfig(),
      customModels,
    });

    // Refresh AI client
    aiClient.refreshProviders();

    await bot.sendMessage(msg.chat.id, 
      `✅ **Zhipu GLM model added!**

Model: ${name}
Base URL: ${baseUrl}
Model ID: ${modelName}

Use /model ${providerKey} to select it.
Use /mymodels to see all your models.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('[Bot] Failed to add GLM model:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error adding model: ${error.message}`);
  }
});

// /addmoonshot command - Quick add Moonshot model
bot.onText(/\/addmoonshot(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const args = match[1];
  
  // If no args, show help
  if (!args) {
    const message = `**Add Moonshot Model**

Send your API key and optionally the model:

\`/addmoonshot <api_key> [model]\`

**Examples:**
\`/addmoonshot sk-your-key\` (uses moonshot-v1-8k)
\`/addmoonshot sk-your-key moonshot-v1-32k\`

**Available Models:**
• moonshot-v1-8k - 8k context (default)
• moonshot-v1-32k - 32k context
• moonshot-v1-128k - 128k context

Get your API key from: https://platform.moonshot.cn/`;
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    return;
  }

  // Parse: api_key [model]
  const parts = args.trim().split(/\s+/);
  const apiKey = parts[0];
  const modelName = parts[1] || 'moonshot-v1-8k';
  
  if (!apiKey || !apiKey.startsWith('sk-')) {
    await bot.sendMessage(msg.chat.id, '❌ Invalid API key. Moonshot keys start with "sk-"');
    return;
  }

  try {
    const baseUrl = 'https://api.moonshot.cn/v1';
    const name = `Moonshot ${modelName.replace('moonshot-', '').toUpperCase()}`;
    const providerKey = `moonshot_${modelName.replace(/[^a-z0-9]/g, '_')}`;

    // Store in shared config
    const customModels = sharedConfig.getFullConfig().customModels || {};
    customModels[providerKey] = {
      name: name,
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: modelName,
      enabled: true,
      addedBy: msg.from.id,
      addedAt: new Date().toISOString(),
    };

    sharedConfig.saveConfig({
      ...sharedConfig.getFullConfig(),
      customModels,
    });

    // Refresh AI client
    aiClient.refreshProviders();

    await bot.sendMessage(msg.chat.id, 
      `✅ **Moonshot model added!**

Model: ${name}
Base URL: ${baseUrl}
Model ID: ${modelName}

Use /model ${providerKey} to select it.
Use /mymodels to see all your models.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('[Bot] Failed to add Moonshot model:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error adding model: ${error.message}`);
  }
});

// /testmodel command - Test any AI model
bot.onText(/\/testmodel/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const message = `**🧪 Test AI Model**

Test any AI model before adding it.

**Usage:**
\`testmodel <base_url>|<api_key>|<model_name> [message]\`

**Examples:**
\`testmodel https://api.moonshot.cn/v1|sk-your-key|moonshot-v1-8k\`
\`testmodel https://api.z.ai/api/paas/v4|your-key|glm-5 Hello!\`

**Quick Tests:**
• /testglm - Test Zhipu GLM
• /testmoonshot - Test Moonshot

The bot will send a test message and show the response.`;

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// Handle testmodel with parameters
bot.onText(/testmodel (.+)\|(.+)\|(.+)(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const baseUrl = match[1].trim();
  const apiKey = match[2].trim();
  const modelName = match[3].trim();
  const customMessage = match[4] || 'Hello! Please respond with a short greeting to confirm this test is working.';

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const startTime = Date.now();
    
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: modelName,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: customMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const duration = Date.now() - startTime;
    const content = response.data.choices?.[0]?.message?.content || 'No content';
    const usage = response.data.usage || {};
    
    const resultMessage = `✅ **Test Successful!**

**Model:** ${modelName}
**Duration:** ${duration}ms
**Tokens:** ${usage.total_tokens || 0} total (${usage.prompt_tokens || 0} prompt, ${usage.completion_tokens || 0} completion)

**Response:**
\`\`\`
${content.substring(0, 3000)}
\`\`\`

✅ This model is working correctly!`;

    await bot.sendMessage(msg.chat.id, resultMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    const statusCode = error.response?.status;
    
    await bot.sendMessage(msg.chat.id, 
      `❌ **Test Failed!**

**Model:** ${modelName}
**Status:** ${statusCode || 'Network Error'}
**Error:** ${errorMsg}

Please check:
• Base URL is correct
• API key is valid
• Model name exists
• API key has sufficient credits`,
      { parse_mode: 'Markdown' }
    );
  }
});

// /testglm command - Quick test Zhipu GLM
bot.onText(/\/testglm(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const apiKey = match[1];
  
  if (!apiKey) {
    await bot.sendMessage(msg.chat.id, 
      `**🧪 Test Zhipu GLM**

Send your API key to test:

\`/testglm your-api-key\`

You can also specify a model:
\`/testglm your-api-key glm-5\`

The default test uses glm-5 (best for coding).

**Need Credits?**
• Get API key: https://z.ai/
• Buy DevPack: https://z.ai/devpack/overview
• API Resource Pack: For pay-as-you-go API calls`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const parts = apiKey.trim().split(/\s+/);
  const key = parts[0];
  const modelName = parts[1] || 'glm-5';
  
  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const startTime = Date.now();
    const baseUrl = 'https://api.z.ai/api/coding/paas/v4';
    
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: modelName,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello! Please confirm this test is working and tell me which model you are.' },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const duration = Date.now() - startTime;
    const content = response.data.choices?.[0]?.message?.content || 'No content';
    const usage = response.data.usage || {};
    
    const resultMessage = `✅ **Zhipu GLM Test Successful!**

**Model:** ${modelName}
**Base URL:** ${baseUrl}
**Duration:** ${duration}ms
**Tokens:** ${usage.total_tokens || 0} total

**Response:**
\`\`\`
${content.substring(0, 3000)}
\`\`\`

✅ Working! Add it with:
\`/addglm ${key.substring(0, 8)}... ${modelName}\``;

    await bot.sendMessage(msg.chat.id, resultMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    const statusCode = error.response?.status;
    
    let helpText = '';
    if (statusCode === 429 && errorMsg.includes('balance')) {
      helpText = `

💡 **You need to add credits:**
• Buy **API Resource Pack** at https://z.ai/ → Billing → Resource Pack
• Or subscribe to **DevPack/Coding Plan** at https://z.ai/devpack/overview

DevPack Plans:
• Lite: ~400 prompts/week
• Pro: ~2,000 prompts/week  
• Max: ~8,000 prompts/week`;
    }

    await bot.sendMessage(msg.chat.id, 
      `❌ **GLM Test Failed!**

**Status:** ${statusCode || 'Network Error'}
**Error:** ${errorMsg}${helpText}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// /testagents command - Test all configured agent models
// Usage: /testagents [agent]
// Examples:
//   /testagents         - Test all agents
//   /testagents planner - Test only planner agent
bot.onText(/\/testagents(?:\s+(\S+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const specificAgent = match[1];
  
  await bot.sendMessage(msg.chat.id, '🧪 **Testing Agent Models...**\n\nThis may take a moment.', { parse_mode: 'Markdown' });
  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    // Get all agent configurations
    const agents = await agentConfig.getAllAgents();
    const providers = await agentConfig.getAvailableProviders();
    
    const agentNames = specificAgent 
      ? [specificAgent.toLowerCase()]
      : Object.keys(agents);
    
    let results = [];
    let successCount = 0;
    let failCount = 0;

    for (const agentName of agentNames) {
      const agent = agents[agentName];
      if (!agent) {
        results.push(`❌ **${agentName}**: Agent not found`);
        failCount++;
        continue;
      }

      const provider = agent.provider;
      const model = agent.model;
      
      await bot.sendChatAction(msg.chat.id, 'typing');
      
      try {
        // Test the agent's configured model
        const startTime = Date.now();
        
        // Use aiClient to call the specific provider/model
        const response = await aiClient.call(
          'Hello! Please confirm this test is working and tell me which model you are. Reply in one short sentence.',
          {
            provider: provider,
            model: model,
            maxTokens: 100,
            temperature: 0.7,
          }
        );
        
        const duration = Date.now() - startTime;
        
        if (response.success) {
          results.push(
            `✅ **${agentName}**\n` +
            `   Provider: \`${provider}\`\n` +
            `   Model: \`${model}\`\n` +
            `   Duration: ${duration}ms\n` +
            `   Response: "${response.content.substring(0, 100)}..."`
          );
          successCount++;
        } else {
          results.push(
            `❌ **${agentName}**\n` +
            `   Provider: \`${provider}\`\n` +
            `   Model: \`${model}\`\n` +
            `   Error: ${response.error || 'Unknown error'}`
          );
          failCount++;
        }
      } catch (error) {
        results.push(
          `❌ **${agentName}**\n` +
          `   Provider: \`${provider}\`\n` +
          `   Model: \`${model}\`\n` +
          `   Error: ${error.message}`
        );
        failCount++;
      }
      
      // Small delay between tests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Send results
    const useMySQL = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD);
    const summary = `🧪 **Agent Model Test Results**\n\n` +
      `Data Source: ${useMySQL ? 'MySQL' : 'File'}\n` +
      `✅ Passed: ${successCount}\n` +
      `❌ Failed: ${failCount}\n\n` +
      results.join('\n\n');
    
    // Split if too long
    if (summary.length > 4000) {
      await bot.sendMessage(msg.chat.id, summary.substring(0, 4000) + '\n\n...(truncated)', { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(msg.chat.id, summary, { parse_mode: 'Markdown' });
    }
    
    // Provide recommendations if there are failures
    if (failCount > 0) {
      let helpText = '\n💡 **Troubleshooting:**\n';
      helpText += '• Check API keys in environment variables\n';
      helpText += '• Use `/agentmodels` to view current settings\n';
      helpText += '• Use `/setagent <agent> <provider> <model>` to fix\n';
      helpText += '• Use `/migrate` if using custom models (fixes DB constraints)\n';
      helpText += '• Use `/testglm <key>` to test GLM directly\n';
      await bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    logger.error('[Bot] Test agents failed:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error testing agents: ${error.message}`);
  }
});

// /testagentmodel command - Test a specific provider/model combination
// Usage: /testagentmodel <provider> <model>
// Example: /testagentmodel zhipu glm-5
bot.onText(/\/testagentmodel\s+(\S+)\s+(\S+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const provider = match[1].trim().toLowerCase();
  const model = match[2].trim();
  
  await bot.sendMessage(msg.chat.id, `🧪 Testing **${provider}** / **${model}**...`, { parse_mode: 'Markdown' });
  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const startTime = Date.now();
    
    const response = await aiClient.call(
      'Hello! Please confirm this test is working and tell me which model you are.',
      {
        provider: provider,
        model: model,
        maxTokens: 200,
        temperature: 0.7,
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (response.success) {
      await bot.sendMessage(msg.chat.id, 
        `✅ **Test Successful!**\n\n` +
        `**Provider:** ${provider}\n` +
        `**Model:** ${model}\n` +
        `**Duration:** ${duration}ms\n` +
        `**Tokens:** ${response.usage?.total_tokens || 'N/A'}\n\n` +
        `**Response:**\n` +
        '\`\`\`\n' +
        response.content.substring(0, 1000) +
        '\`\`\`',
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(msg.chat.id, 
        `❌ **Test Failed!**\n\n` +
        `**Provider:** ${provider}\n` +
        `**Model:** ${model}\n` +
        `**Error:** ${response.error || 'Unknown error'}`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    logger.error('[Bot] Test agent model failed:', error);
    await bot.sendMessage(msg.chat.id, 
      `❌ **Test Failed!**\n\n` +
      `**Provider:** ${provider}\n` +
      `**Model:** ${model}\n` +
      `**Error:** ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// /testmoonshot command - Quick test Moonshot
bot.onText(/\/testmoonshot(?:\s+(.+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const apiKey = match[1];
  
  if (!apiKey) {
    await bot.sendMessage(msg.chat.id, 
      `**🧪 Test Moonshot**

Send your API key to test:

\`/testmoonshot sk-your-api-key\`

You can also specify a model:
\`/testmoonshot sk-your-key moonshot-v1-32k\`

The default test uses moonshot-v1-8k.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const parts = apiKey.trim().split(/\s+/);
  const key = parts[0];
  const modelName = parts[1] || 'moonshot-v1-8k';
  
  if (!key.startsWith('sk-')) {
    await bot.sendMessage(msg.chat.id, '❌ Invalid API key. Moonshot keys start with "sk-"');
    return;
  }
  
  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const startTime = Date.now();
    const baseUrl = 'https://api.moonshot.cn/v1';
    
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: modelName,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello! Please confirm this test is working and tell me which model you are.' },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    const duration = Date.now() - startTime;
    const content = response.data.choices?.[0]?.message?.content || 'No content';
    const usage = response.data.usage || {};
    
    const resultMessage = `✅ **Moonshot Test Successful!**

**Model:** ${modelName}
**Base URL:** ${baseUrl}
**Duration:** ${duration}ms
**Tokens:** ${usage.total_tokens || 0} total

**Response:**
\`\`\`
${content.substring(0, 3000)}
\`\`\`

✅ Working! Add it with:
\`/addmoonshot ${key.substring(0, 8)}... ${modelName}\``;

    await bot.sendMessage(msg.chat.id, resultMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    const statusCode = error.response?.status;
    
    await bot.sendMessage(msg.chat.id, 
      `❌ **Moonshot Test Failed!**

**Status:** ${statusCode || 'Network Error'}
**Error:** ${errorMsg}

Please check your API key at:
https://platform.moonshot.cn/`,
      { parse_mode: 'Markdown' }
    );
  }
});

// /addopenai command - Add OpenAI-compatible API (easier format)
bot.onText(/\/addopenai/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const message = `<b>🤖 Add OpenAI-Compatible API</b>

Send me the details in this format:
<pre>addopenai name|api_key|base_url|model_name</pre>

<b>Examples:</b>
<pre>addopenai Grok|xai-your-key|https://api.x.ai/v1|grok-2</pre>
<pre>addopenai Together|together-key|https://api.together.xyz/v1|meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo</pre>
<pre>addopenai LocalAI|your-key|http://localhost:8080/v1|llama2</pre>

<b>Parameters:</b>
• <b>name:</b> Display name (e.g., "My API")
• <b>api_key:</b> Your API key
• <b>base_url:</b> API base URL (must end in /v1)
• <b>model_name:</b> Model identifier

<b>Or use quick commands:</b>
• /addglm - Add Zhipu GLM
• /addmoonshot - Add Moonshot AI`;

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
});

// Handle addopenai with parameters
bot.onText(/addopenai (.+)\|(.+)\|(.+)\|(.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const name = match[1].trim();
  const apiKey = match[2].trim();
  const baseUrl = match[3].trim();
  const modelName = match[4].trim();
  const providerKey = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;

  try {
    // Validate URL ends with /v1
    let normalizedUrl = baseUrl;
    if (!baseUrl.endsWith('/v1')) {
      normalizedUrl = baseUrl.replace(/\/$/, '') + '/v1';
    }

    // Store custom model in shared config
    const customModels = sharedConfig.getFullConfig().customModels || {};
    customModels[providerKey] = {
      name: name,
      apiKey: apiKey,
      baseUrl: normalizedUrl,
      model: modelName,
      enabled: true,
      addedBy: msg.from.id,
      addedAt: new Date().toISOString(),
    };

    sharedConfig.saveConfig({
      ...sharedConfig.getFullConfig(),
      customModels,
    });

    // Refresh AI client
    aiClient.refreshProviders();

    await bot.sendMessage(msg.chat.id, 
      `✅ <b>OpenAI-compatible API added!</b>\n\n` +
      `<b>Name:</b> ${name}\n` +
      `<b>Model:</b> ${modelName}\n` +
      `<b>URL:</b> ${normalizedUrl}\n\n` +
      `Use <code>/mymodels</code> to see all models.\n` +
      `Use <code>/usecustommodel ${providerKey}</code> to use it.`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    logger.error('[Bot] Failed to add OpenAI API:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// Handle addmodel with parameters (legacy format)
bot.onText(/addmodel (.+)\|(.+)\|(.+)\|(.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const name = match[1].trim();
  const apiKey = match[2].trim();
  const baseUrl = match[3].trim();
  const modelName = match[4].trim();
  const providerKey = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;

  try {
    // Store custom model in shared config
    const customModels = sharedConfig.getFullConfig().customModels || {};
    customModels[providerKey] = {
      name: name,
      apiKey: apiKey,
      baseUrl: baseUrl,
      model: modelName,
      enabled: true,
      addedBy: msg.from.id,
      addedAt: new Date().toISOString(),
    };

    sharedConfig.saveConfig({
      ...sharedConfig.getFullConfig(),
      customModels,
    });

    await bot.sendMessage(msg.chat.id, 
      `✅ **Custom model added!**\n\n` +
      `Name: ${name}\n` +
      `Model: ${modelName}\n` +
      `URL: ${baseUrl}\n\n` +
      `Use /mymodels to see all your models.\n` +
      `Use /usemodel ${providerKey} to set as default.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('[Bot] Failed to add custom model:', error);
    await bot.sendMessage(msg.chat.id, `Error adding model: ${error.message}`);
  }
});

// /mymodels command - List custom models
bot.onText(/\/mymodels/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const config = sharedConfig.getFullConfig();
  const customModels = config.customModels || {};
  const providers = aiClient.getAvailableProviders();

  let message = '**Your AI Models**\n\n';

  // Built-in providers
  message += '**Built-in Providers:**\n';
  Object.entries(providers).forEach(([key, p]) => {
    message += `${p.enabled ? '✅' : '❌'} ${p.name} (${key})\n`;
  });

  // Custom models
  const customEntries = Object.entries(customModels);
  if (customEntries.length > 0) {
    message += '\n**Custom Models:**\n';
    customEntries.forEach(([key, model]) => {
      message += `✅ ${model.name} (${key})\n`;
      message += `   Model: ${model.model}\n`;
      message += `   URL: ${model.baseUrl}\n`;
    });
  }

  message += '\n**Commands:**\n';
  message += '`/usemodel <provider>` - Set default built-in\n';
  message += '`/usecustommodel <key>` - Use custom model\n';
  message += '`/editcustommodel <key> <new_api_key>` - Update API key\n';
  message += '`/removecustommodel <key>` - Remove custom model\n';
  message += '`/addmodel` - Add new model';

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /usecustommodel command - Use a custom model
bot.onText(/\/usecustommodel\s+(\S+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const modelKeyInput = match[1].trim();
  const config = sharedConfig.getFullConfig();
  const customModels = config.customModels || {};
  
  // Try exact match first, then case-insensitive
  let modelKey = modelKeyInput;
  if (!customModels[modelKey]) {
    const lowerInput = modelKeyInput.toLowerCase();
    const foundKey = Object.keys(customModels).find(k => k.toLowerCase() === lowerInput);
    if (foundKey) {
      modelKey = foundKey;
    }
  }
  
  if (!customModels[modelKey]) {
    // Debug: show available keys
    const availableKeys = Object.keys(customModels);
    logger.info(`[Bot] /usecustommodel failed: key='${modelKeyInput}', available=[${availableKeys.join(', ')}]`);
    
    let debugInfo = '';
    if (availableKeys.length > 0) {
      debugInfo = `\n\n**Available custom model keys:**\n${availableKeys.map(k => `• \`${k}\``).join('\n')}`;
    } else {
      debugInfo = '\n\n**No custom models found.**\nAdd one with /addmodel or /addglm';
    }
    
    await bot.sendMessage(msg.chat.id, 
      `❌ Custom model "${modelKeyInput}" not found.` + debugInfo,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const model = customModels[modelKey];
  
  // Update user settings to use this custom model
  await chatStorage.setUserSettings(msg.from.id, { 
    preferredAI: modelKey,
    preferredModel: model.model,
  });
  
  await bot.sendMessage(msg.chat.id, 
    `✅ **Custom Model Selected**\n\n` +
    `Model: **${model.name}**\n` +
    `Provider Key: \`${modelKey}\`\n` +
    `Model ID: \`${model.model}\`\n` +
    `URL: \`${model.baseUrl}\`\n\n` +
    `This model will now be used for your requests.`,
    { parse_mode: 'Markdown' }
  );
  
  logger.info(`[Bot] User ${msg.from.id} selected custom model: ${modelKey}`);
});

// /editcustommodel command - Update API key for custom model
bot.onText(/\/editcustommodel\s+(\S+)\s+(.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const modelKey = match[1].trim();
  const newApiKey = match[2].trim();
  
  const config = sharedConfig.getFullConfig();
  const customModels = config.customModels || {};
  
  if (!customModels[modelKey]) {
    await bot.sendMessage(msg.chat.id, 
      `❌ Custom model "${modelKey}" not found.\n\n` +
      `Use /mymodels to see available custom models.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Update the API key
  customModels[modelKey].apiKey = newApiKey;
  customModels[modelKey].updatedAt = new Date().toISOString();
  
  sharedConfig.saveConfig({
    ...config,
    customModels,
  });
  
  // Refresh AI client
  aiClient.refreshProviders();
  
  const model = customModels[modelKey];
  await bot.sendMessage(msg.chat.id, 
    `✅ **API Key Updated**\n\n` +
    `Model: **${model.name}** (${modelKey})\n` +
    `New API Key: \`${newApiKey.substring(0, 8)}...${newApiKey.substring(newApiKey.length - 4)}\`\n\n` +
    `The AI client has been refreshed with the new key.`,
    { parse_mode: 'Markdown' }
  );
  
  logger.info(`[Bot] User ${msg.from.id} updated API key for custom model: ${modelKey}`);
});

// /removecustommodel command - Remove a custom model
bot.onText(/\/removecustommodel\s+(\S+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const modelKey = match[1].trim();
  const config = sharedConfig.getFullConfig();
  const customModels = config.customModels || {};
  
  if (!customModels[modelKey]) {
    await bot.sendMessage(msg.chat.id, 
      `❌ Custom model "${modelKey}" not found.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const modelName = customModels[modelKey].name;
  delete customModels[modelKey];
  
  sharedConfig.saveConfig({
    ...config,
    customModels,
  });
  
  // Refresh AI client
  aiClient.refreshProviders();
  
  await bot.sendMessage(msg.chat.id, 
    `✅ **Custom Model Removed**\n\n` +
    `Model: **${modelName}** (${modelKey}) has been removed.`,
    { parse_mode: 'Markdown' }
  );
  
  logger.info(`[Bot] User ${msg.from.id} removed custom model: ${modelKey}`);
});

// /usemodel command - Set default model
bot.onText(/\/usemodel (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const providerName = match[1].trim();
  
  await chatStorage.setUserSettings(msg.from.id, { preferredAI: providerName });
  
  await bot.sendMessage(msg.chat.id, 
    `✅ Default AI provider set to: **${providerName}**\n\n` +
    `This will be used for your future requests.`,
    { parse_mode: 'Markdown' }
  );
});

// /plans command - List all pending plans
bot.onText(/\/plans/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const allPlans = await chatStorage.getAllPendingPlans();
  const planEntries = Object.entries(allPlans);
  
  if (planEntries.length === 0) {
    await bot.sendMessage(msg.chat.id, '**No Pending Plans**\n\nUse `/plan <task>` to create a new plan.', { parse_mode: 'Markdown' });
    return;
  }
  
  let message = `**Pending Plans (${planEntries.length})**\n\n`;
  
  planEntries.forEach(([userId, plan], index) => {
    const age = Math.round((Date.now() - plan.createdAt) / 1000 / 60);
    message += `${index + 1}. **${plan.task}**\n`;
    message += `   User: ${plan.username || userId}\n`;
    message += `   Age: ${age} minutes ago\n\n`;
  });
  
  message += 'Use `/planwith <project-id>` to select a project for your plan.';
  
  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// /debug command - Show debug info
bot.onText(/\/debug/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const stats = await chatStorage.getStats();
  const pending = await chatStorage.getPendingPlan(msg.from.id.toString());
  const providers = aiClient.getAvailableProviders();
  
  let message = '**Debug Info**\n\n';
  message += `Data Directory: \`${stats.dataDir}\`\n`;
  message += `Files exist: ${JSON.stringify(stats.files)}\n\n`;
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

// /migrate command - Run database migrations
bot.onText(/\/migrate/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendMessage(msg.chat.id, '🔄 Running database migrations...');
  
  try {
    // Check if MySQL config module is available
    const useMySQL = process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD;
    
    if (!useMySQL) {
      await bot.sendMessage(msg.chat.id, '⚠️ MySQL is not configured. Using file-based config.');
      return;
    }
    
    // Import MySQL config module and run migrations
    const mysqlConfig = require('./database/agent-config-mysql');
    await mysqlConfig.runMigrations();
    
    await bot.sendMessage(msg.chat.id, 
      '✅ **Migration Complete**\n\n' +
      'Custom provider keys are now supported.\n' +
      'You can now use `/setagent` and `/setallagents` with custom models.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('[Bot] Migration failed:', error);
    await bot.sendMessage(msg.chat.id, `❌ Migration failed: ${error.message}`);
  }
});

// /plan command - Shows project selection from GitLab
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1].trim();
  const userId = msg.from.id;
  
  // Log user message
  logUserMessage(userId, `/plan ${task}`, 'command', {
    userInfo: {
      username: msg.from.username,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name,
    },
  });
  
  await bot.sendChatAction(msg.chat.id, 'typing');
  
  try {
    const projects = await getGitLabProjects();
    
    if (projects.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No projects found in your GitLab account. Please check your GITLAB_TOKEN and GITLAB_NAMESPACE.');
      return;
    }
    
    // Store pending plan persistently
    const userIdStr = userId.toString();
    logger.info(`[Bot] Storing pending plan for user ${userIdStr}: ${task}`);
    const saved = await chatStorage.setPendingPlan(userIdStr, {
      task,
      chatId: msg.chat.id,
      username: msg.from.username || msg.from.first_name,
    });
    
    // Verify it was saved
    const verify = await chatStorage.getPendingPlan(userIdStr);
    logger.info(`[Bot] Verified pending plan: ${verify ? 'FOUND' : 'NOT FOUND'}, saved: ${saved}`);
    
    // Show project selection with inline keyboard
    const message = `**Task:** ${task}\n\nSelect a project:`;
    
    // Create inline keyboard with projects - use string userId consistently
    const keyboard = projects.slice(0, 10).map(project => ([{
      text: project.name,
      callback_data: `planwith:${project.id}:${userIdStr}`,
    }]));
    
    await bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
    
    // Add to chat history
    await chatStorage.addMessage(userId, 'user', `/plan ${task}`, { type: 'command' });
    await chatStorage.addMessage(userId, 'assistant', message, { type: 'project_selection', projects: projects.map(p => p.name) });
    
  } catch (error) {
    logger.error('Failed to load projects for plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects from GitLab. Please check your configuration.');
  }
});

// /quickplan command - Direct plan creation without pending storage
bot.onText(/\/quickplan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const args = match[1].trim();
  const userId = msg.from.id;
  
  // Parse: task | project
  const parts = args.split('|').map(p => p.trim());
  
  if (parts.length < 2) {
    await bot.sendMessage(msg.chat.id, 
      `**Quick Plan Usage:**

\`/quickplan <task> | <project-id>\`

**Example:**
\`/quickplan Add user authentication | my-project\`

Use /projects to see available project IDs.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  const task = parts[0];
  const projectId = parts[1];
  
  await bot.sendChatAction(msg.chat.id, 'typing');
  
  try {
    const projects = await getGitLabProjects();
    const project = projects.find(p => p.id === projectId || p.fullPath === projectId || p.name === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found. Use /projects to see available projects.`);
      return;
    }
    
    const statusMsg = await bot.sendMessage(msg.chat.id, `Creating plan for: **${task}**\nProject: ${project.name}...`, { parse_mode: 'Markdown' });
    
    // Get user's preferred AI provider/model
    const userSettings = await chatStorage.getUserSettings(userId);
    const aiProvider = userSettings.preferredAI;
    const aiModel = userSettings.preferredModel;
    
    const result = await orchestrator.processCommand(`/plan ${task}`, {
      userId: userId,
      chatId: msg.chat.id,
      project: project.fullPath,
      projectInfo: project,
      aiProvider: aiProvider,
      aiModel: aiModel,
    });
    
    await bot.deleteMessage(msg.chat.id, statusMsg.message_id);
    
    if (result.success) {
      const keyboard = [[
        { text: '✅ Approve Plan', callback_data: `approve:${result.plan?.id || 'latest'}:${userId}` },
        { text: '❌ Cancel', callback_data: `cancelplan:${userId}` },
      ]];
      
      await bot.sendMessage(msg.chat.id, result.message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      await bot.sendMessage(msg.chat.id, `Error: ${result.message}`);
    }
  } catch (error) {
    logger.error('[Bot] Quick plan error:', error);
    await bot.sendMessage(msg.chat.id, `Error creating plan: ${error.message}`);
  }
});

// /planwith command - Create plan with selected project
bot.onText(/\/planwith (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  const userIdStr = msg.from.id.toString();
  
  // Get pending plan from persistent storage with retries
  logger.info(`[Bot] Looking for pending plan for user ${userIdStr}`);
  let pending = await chatStorage.getPendingPlan(userIdStr);
  
  // Retry with backoff if not found
  let retryCount = 0;
  while (!pending && retryCount < 3) {
    retryCount++;
    logger.warn(`[Bot] No pending plan found for user ${userIdStr}, retry ${retryCount}/3...`);
    await new Promise(resolve => setTimeout(resolve, 200 * retryCount));
    pending = await chatStorage.getPendingPlan(userIdStr);
  }
  
  if (!pending) {
    logger.warn(`[Bot] No pending plan found for user ${userIdStr} after retries`);
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

    // Keep pending plan until we have a full plan to store (so /approve and /run can use it)
    await bot.sendChatAction(msg.chat.id, 'typing');
    const statusMsg = await bot.sendMessage(msg.chat.id, `Analyzing ${project.name}... This may take a moment.`);

    // Add to chat history
    await chatStorage.addMessage(userIdStr, 'user', `/planwith ${projectId}`, { type: 'command' });

    // Get user's preferred AI provider/model
    const userSettings = await chatStorage.getUserSettings(userIdStr);
    const aiProvider = userSettings.preferredAI;
    
    // If preferredAI contains a model (e.g., "moonshot:moonshot-v1-32k"), parse it
    let aiModel = null;
    let finalProvider = aiProvider;
    if (aiProvider && aiProvider.includes(':')) {
      const parts = aiProvider.split(':');
      finalProvider = parts[0];
      aiModel = parts[1];
    }
    
    logger.info(`[Bot] Using AI provider for plan: ${finalProvider}${aiModel ? `, model: ${aiModel}` : ''}`);

    const result = await orchestrator.processCommand(`/plan ${pending.task}`, {
      userId: userIdStr,
      chatId: msg.chat.id,
      project: project.fullPath,
      projectInfo: project,
      aiProvider: finalProvider,
      aiModel: aiModel,
    });

    await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

    if (result.success) {
      // Persist full plan so /approve and /run can use it (with steps, branch, project)
      await chatStorage.setPendingPlan(userIdStr, {
        task: pending.task,
        chatId: msg.chat.id,
        username: pending.username || msg.from?.username || msg.from?.first_name,
        plan: result.plan,
        projectId: project.id,
        projectName: project.name,
        project: project.fullPath,
      });

      await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });

      // Add to chat history
      await chatStorage.addMessage(userId, 'assistant', result.message, {
        type: 'plan',
        planId: result.plan?.id,
      });

      // Send voice confirmation
      const voiceText = `Plan created for ${pending.task}. Complexity: ${result.plan.complexity}, estimated ${result.plan.estimatedHours} hours. Reply with /approve to start.`;
      await sendMessageWithVoice(userId, msg.chat.id, voiceText, { voice: true, language: 'en' });
    } else {
      await bot.sendMessage(msg.chat.id, `Error: ${result.message}`);
      await chatStorage.addMessage(userId, 'assistant', `Error: ${result.message}`, { type: 'error' });
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
    await chatStorage.addMessage(msg.from.id, 'assistant', message, { type: 'projects_list' });
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
    await chatStorage.setUserSettings(msg.from.id, { defaultProject: project.fullPath });
    
    await bot.sendMessage(msg.chat.id, 
      `Default project set to: **${project.name}**\nRepo: \`${project.fullPath}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to switch project:', error);
    await bot.sendMessage(msg.chat.id, 'Error switching project');
  }
});

// /models command - Show providers first, then models
bot.onText(/\/models/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const providers = aiClient.getAvailableProviders();
    const settings = await chatStorage.getUserSettings(msg.from.id);
    
    let message = '**Select AI Provider**\n\n';
    message += 'Click a provider to see available models:\n';
    
    // Create keyboard for enabled providers
    const keyboard = [];
    
    for (const [key, provider] of Object.entries(providers)) {
      if (provider.enabled) {
        keyboard.push([{
          text: `${provider.name}`,
          callback_data: `showmodels:${key}:${msg.from.id}`
        }]);
      }
    }
    
    message += '\n**Current:** ' + (settings.preferredAI || 'Auto (Cheapest)');
    
    await bot.sendMessage(msg.chat.id, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
    });
    
    await chatStorage.addMessage(msg.from.id, 'assistant', message, { type: 'models_list' });
  } catch (error) {
    logger.error('Failed to load models:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading AI models.');
  }
});

// Import agent config manager
const agentConfig = require('./utils/agent-config');

// /agentmodels command - Show current agent model assignments
bot.onText(/\/agentmodels/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  try {
    const agents = await agentConfig.getAllAgents();
    const globalDefaults = await agentConfig.getGlobalDefaults();
    const providers = await agentConfig.getAvailableProviders();
    
    let message = '🤖 **Agent Model Configuration**\n\n';
    
    // Show global defaults
    message += '🌍 **Global Defaults:**\n';
    message += `Provider: ${globalDefaults.defaultProvider || 'zhipu'}\n`;
    message += `Model: ${globalDefaults.defaultModel || 'glm-5'}\n\n`;
    
    // Show per-agent configuration
    message += '📋 **Per-Agent Configuration:**\n';
    
    for (const [agentName, agent] of Object.entries(agents)) {
      const provider = agent.provider || 'default';
      const model = agent.model || 'default';
      message += `• **${agentName}**: \`${provider}\` / \`${model}\`\n`;
    }
    
    message += '\n💡 **Commands to change:**\n';
    message += '`/setagent <agent> <provider> <model>`\n';
    message += 'Example: `/setagent planner zhipu glm-5`\n\n';
    message += '`/setallagents <provider> <model>`\n';
    message += 'Example: `/setallagents zhipu glm-4-plus`\n\n';
    message += '**Available providers:**\n';
    for (const [key, info] of Object.entries(providers)) {
      message += `• ${key}: ${info.name}\n`;
    }
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('[Bot] Failed to load agent models:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading agent configuration.');
  }
});

// /setagent command - Set AI model for a specific agent
// Usage: /setagent <agent> <provider> <model>
// Example: /setagent planner zhipu glm-5
// For custom models: /setagent <agent> custom <custom_key>
bot.onText(/\/setagent\s+(\S+)\s+(\S+)\s+(\S+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const agentName = match[1].trim().toLowerCase();
  const provider = match[2].trim().toLowerCase();
  const modelOrKey = match[3].trim();

  // Validate agent name
  const validAgents = ['orchestrator', 'planner', 'backend-dev', 'frontend-dev', 'qa-tester', 'code-reviewer', 'reporter'];
  if (!validAgents.includes(agentName)) {
    await bot.sendMessage(msg.chat.id, 
      `❌ Invalid agent name: ${agentName}\n\n` +
      `Valid agents:\n` +
      validAgents.map(a => `• ${a}`).join('\n'),
      { parse_mode: 'Markdown' }
    );
    return;
  }

  let targetProvider = provider;
  let targetModel = modelOrKey;
  let isCustomModel = false;
  let customModelInfo = null;

  // Check if using custom model syntax: /setagent <agent> custom <custom_key>
  if (provider === 'custom') {
    const customKey = modelOrKey.toLowerCase();
    const config = sharedConfig.getFullConfig();
    const customModels = config.customModels || {};
    
    // Find custom model (case-insensitive)
    const foundKey = Object.keys(customModels).find(k => k.toLowerCase() === customKey);
    
    if (!foundKey) {
      const availableKeys = Object.keys(customModels);
      await bot.sendMessage(msg.chat.id, 
        `❌ Custom model "${modelOrKey}" not found.\n\n` +
        `Available custom models:\n` +
        (availableKeys.length > 0 
          ? availableKeys.map(k => `• ${k}`).join('\n')
          : 'No custom models configured. Use /addmodel or /addglm'),
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const customModel = customModels[foundKey];
    isCustomModel = true;
    customModelInfo = customModel;
    
    // For custom models, we use the provider key as provider and the model ID as model
    targetProvider = foundKey;
    targetModel = customModel.model;
  } else {
    // Validate built-in provider
    const providers = await agentConfig.getAvailableProviders();
    if (!providers[provider]) {
      await bot.sendMessage(msg.chat.id, 
        `❌ Invalid provider: ${provider}\n\n` +
        `Available providers:\n` +
        Object.keys(providers).map(p => `• ${p}`).join('\n') + '\n\n' +
        `For custom models, use:\n` +
        '`/setagent ' + agentName + ' custom <model_key>`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Validate model for built-in providers
    const validModels = providers[provider].models;
    if (!validModels.includes(targetModel)) {
      await bot.sendMessage(msg.chat.id, 
        `⚠️ Warning: ${targetModel} is not a standard model for ${provider}.\n\n` +
        `Standard models:\n` +
        validModels.map(m => `• ${m}`).join('\n') + `\n\n` +
        `Continuing anyway...`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // Update the agent config
  const success = await agentConfig.setAgentModel(agentName, targetProvider, targetModel);
  
  if (success) {
    // Reload orchestrator agents with new config
    orchestrator.reloadAgentConfigs();
    
    let message = `✅ **Agent Model Updated**\n\n`;
    message += `**${agentName}** will now use:\n`;
    
    if (isCustomModel && customModelInfo) {
      message += `Provider: \`${targetProvider}\` (custom)\n`;
      message += `Model: \`${targetModel}\`\n`;
      message += `Base URL: \`${customModelInfo.baseUrl}\`\n`;
    } else {
      message += `Provider: ${targetProvider}\n`;
      message += `Model: ${targetModel}\n`;
    }
    
    message += `\nChanges are active immediately!`;
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
    logger.info(`[Bot] User ${msg.from.id} set ${agentName} to ${targetProvider}/${targetModel}`);
  } else {
    await bot.sendMessage(msg.chat.id, `❌ Failed to update ${agentName}. Check logs.`);
  }
});

// /setallagents command - Set AI model for ALL agents at once
// Usage: /setallagents <provider> <model>
// Example: /setallagents zhipu glm-5
// For custom models: /setallagents custom <custom_key>
bot.onText(/\/setallagents\s+(\S+)\s+(\S+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const provider = match[1].trim().toLowerCase();
  const modelOrKey = match[2].trim();

  let targetProvider = provider;
  let targetModel = modelOrKey;
  let isCustomModel = false;
  let customModelInfo = null;

  // Check if using custom model syntax: /setallagents custom <custom_key>
  if (provider === 'custom') {
    const customKey = modelOrKey.toLowerCase();
    const config = sharedConfig.getFullConfig();
    const customModels = config.customModels || {};
    
    // Find custom model (case-insensitive)
    const foundKey = Object.keys(customModels).find(k => k.toLowerCase() === customKey);
    
    if (!foundKey) {
      const availableKeys = Object.keys(customModels);
      await bot.sendMessage(msg.chat.id, 
        `❌ Custom model "${modelOrKey}" not found.\n\n` +
        `Available custom models:\n` +
        (availableKeys.length > 0 
          ? availableKeys.map(k => `• ${k}`).join('\n')
          : 'No custom models configured. Use /addmodel or /addglm'),
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    const customModel = customModels[foundKey];
    isCustomModel = true;
    customModelInfo = customModel;
    
    // For custom models, we use the provider key as provider and the model ID as model
    targetProvider = foundKey;
    targetModel = customModel.model;
  } else {
    // Validate built-in provider
    const providers = await agentConfig.getAvailableProviders();
    if (!providers[provider]) {
      await bot.sendMessage(msg.chat.id, 
        `❌ Invalid provider: ${provider}\n\n` +
        `Available providers:\n` +
        Object.keys(providers).map(p => `• ${p}`).join('\n') + '\n\n' +
        `For custom models, use:\n` +
        '`/setallagents custom <model_key>`',
        { parse_mode: 'Markdown' }
      );
      return;
    }
  }

  // Update global defaults
  await agentConfig.setGlobalDefaults(targetProvider, targetModel);
  
  // Update all agents
  const agentNames = ['orchestrator', 'planner', 'backend-dev', 'frontend-dev', 'qa-tester', 'code-reviewer', 'reporter'];
  let updatedCount = 0;
  
  for (const agentName of agentNames) {
    const success = await agentConfig.setAgentModel(agentName, targetProvider, targetModel);
    if (success) updatedCount++;
  }
  
  // Reload orchestrator agents with new config
  orchestrator.reloadAgentConfigs();
  
  let message = `✅ **All Agents Updated**\n\n`;
  message += `${updatedCount} agents will now use:\n`;
  
  if (isCustomModel && customModelInfo) {
    message += `Provider: \`${targetProvider}\` (custom)\n`;
    message += `Model: \`${targetModel}\`\n`;
    message += `Base URL: \`${customModelInfo.baseUrl}\`\n`;
  } else {
    message += `Provider: ${targetProvider}\n`;
    message += `Model: ${targetModel}\n`;
  }
  
  message += `\nChanges are active immediately!`;
  
  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  
  logger.info(`[Bot] User ${msg.from.id} set ALL agents to ${targetProvider}/${targetModel}`);
});

// /model command - Set default AI provider and optionally model
// Usage: /model <provider> [model]
// Examples: 
//   /model moonshot        - Select moonshot provider with default model
//   /model moonshot moonshot-v1-32k  - Select specific model
bot.onText(/\/model(?:\s+(\S+))?(?:\s+(\S+))?/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const providerName = match[1]?.trim().toLowerCase();
  const modelName = match[2]?.trim();
  
  try {
    // If no provider specified, show interactive selection
    if (!providerName) {
      const providers = aiClient.getAvailableProviders();
      const availableProviders = Object.entries(providers)
        .filter(([_, p]) => p.enabled)
        .map(([name, _]) => name);
      
      const aiProviders = ['anthropic', 'moonshot', 'deepseek', 'zhipu'];
      const customProviders = sharedConfig.getCustomProviders ? Object.keys(sharedConfig.getCustomProviders()) : [];
      const allProviders = [...new Set([...aiProviders, ...customProviders])].filter(p => 
        availableProviders.includes(p)
      );
      
      const keyboard = allProviders.map(provider => ([{
        text: provider === 'anthropic' ? '🤖 Anthropic (Claude)' :
              provider === 'moonshot' ? '🌙 Moonshot AI' :
              provider === 'deepseek' ? '🔍 DeepSeek' :
              provider === 'zhipu' ? '⚡ Zhipu AI' : `🔧 ${provider}`,
        callback_data: `showmodels:${provider}:${msg.from.id}`,
      }]));
      
      await bot.sendMessage(msg.chat.id, 
        '🤖 Select an AI provider:\n\n' +
        'You can also use: `/model <provider> [model]`',
        { 
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: keyboard },
        }
      );
      return;
    }
    
    const providers = aiClient.getAvailableProviders();
    
    // Check if provider exists
    if (!providers[providerName]) {
      const available = Object.keys(providers).filter(p => providers[p].enabled).join(', ');
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
    
    // If model name provided, validate it
    if (modelName) {
      const availableModels = aiClient.getAvailableModels ? aiClient.getAvailableModels(providerName) : [];
      if (availableModels.length > 0 && !availableModels.includes(modelName)) {
        await bot.sendMessage(msg.chat.id, 
          `Unknown model "${modelName}" for ${providerName}.\n\n` +
          `Available models: ${availableModels.join(', ')}`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }
    
    // Save preference
    const settings = { preferredAI: providerName };
    if (modelName) {
      settings.preferredModel = modelName;
    }
    await chatStorage.setUserSettings(msg.from.id, settings);
    
    const modelDisplay = modelName || providers[providerName].defaultModel;
    await bot.sendMessage(msg.chat.id, 
      `✅ Default AI provider set to: **${providers[providerName].name}**\n` +
      `Model: \`${modelDisplay}\`\n\n` +
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
  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'HTML' });
});

// /testmcp command - Test MCP servers and GitLab connectivity
bot.onText(/\/testmcp/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  
  await bot.sendMessage(msg.chat.id, '🧪 Running MCP and GitLab connectivity tests...\n\nThis may take up to 30 seconds.');
  
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout, stderr } = await execPromise('node scripts/test-mcp.js', {
      cwd: process.cwd(),
      timeout: 60000,
      env: process.env
    });
    
    // Split output if too long for Telegram
    const output = stdout || stderr || 'No output';
    const chunks = output.match(/.{1,3500}/gs) || ['No output'];
    
    for (const chunk of chunks.slice(0, 5)) {
      await bot.sendMessage(msg.chat.id, `<pre>${escapeHtml(chunk)}</pre>`, { parse_mode: 'HTML' });
    }
  } catch (error) {
    const output = error.stdout || error.message || 'Test failed';
    await bot.sendMessage(msg.chat.id, `❌ <b>Test Error</b>\n<pre>${escapeHtml(output.substring(0, 3500))}</pre>`, { parse_mode: 'HTML' });
  }
});

// /initmcp command - Initialize MCP servers
bot.onText(/\/initmcp/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  
  await bot.sendMessage(msg.chat.id, '🔧 Initializing MCP servers...\nThis may take a few minutes on first run.');
  
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    const { stdout, stderr } = await execPromise('node scripts/init-mcp.js', {
      cwd: process.cwd(),
      timeout: 300000,
      env: process.env
    });
    
    const output = stdout || stderr || 'Done';
    const chunks = output.match(/.{1,3500}/gs) || ['Done'];
    
    for (const chunk of chunks.slice(0, 5)) {
      await bot.sendMessage(msg.chat.id, `<pre>${escapeHtml(chunk)}</pre>`, { parse_mode: 'HTML' });
    }
  } catch (error) {
    const output = error.stdout || error.message || 'Init failed';
    await bot.sendMessage(msg.chat.id, `❌ <b>Init Error</b>\n<pre>${escapeHtml(output.substring(0, 3500))}</pre>`, { parse_mode: 'HTML' });
  }
});

// /findproject command - Search for projects
bot.onText(/\/findproject (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;
  
  const query = match[1].trim();
  if (!query) {
    return bot.sendMessage(msg.chat.id, 'Please provide a search query. Example: /findproject myapp');
  }
  
  await bot.sendMessage(msg.chat.id, `🔍 Searching for projects matching "${query}"...`);
  
  try {
    const projects = await gitlab.searchProjects(query, 10);
    
    if (projects.length === 0) {
      return bot.sendMessage(msg.chat.id, `No projects found matching "${query}".\n\nTry using /projects to list all your accessible projects.`);
    }
    
    let message = `<b>🔍 Found ${projects.length} project(s):</b>\n\n`;
    projects.forEach((p, idx) => {
      message += `<b>${idx + 1}. ${p.name}</b>\n`;
      message += `   Path: <code>${p.fullPath}</code>\n`;
      if (p.description) {
        message += `   ${p.description.substring(0, 100)}${p.description.length > 100 ? '...' : ''}\n`;
      }
      message += `   Branch: ${p.defaultBranch}\n\n`;
    });
    
    message += `Use <code>/project ${projects[0].fullPath}</code> to switch to a project.`;
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error('[Bot] Find project error:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error searching projects: ${error.message}`);
  }
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
  const userId = msg.from.id;
  await bot.sendChatAction(msg.chat.id, 'typing');

  // Get user's preferred AI provider/model
  const userSettings = await chatStorage.getUserSettings(userId);
  const aiProvider = userSettings.preferredAI;
  const aiModel = userSettings.preferredModel;
  
  logger.info(`[Bot] /ask using AI provider: ${aiProvider || 'default'}${aiModel ? ` (${aiModel})` : ''}`);

  const result = await orchestrator.processCommand(`/ask ${question}`, {
    userId: userId,
    chatId: msg.chat.id,
    aiProvider: aiProvider,
    aiModel: aiModel,
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
  const settings = await chatStorage.getUserSettings(userId);
  
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
    
    // Add to chat history (both systems)
    await chatStorage.addMessage(userId, 'user', transcribedText, { type: 'voice', language });
    logUserMessage(userId, transcribedText, 'voice', {
      language,
      userInfo: {
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
      },
    });
    
    // Get chat history for context
    const chatHistory = await chatStorage.getChatHistory(userId, 10);

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
          const userIdStrVoice = userId.toString();
          await chatStorage.setPendingPlan(userIdStrVoice, {
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
          await chatStorage.addMessage(userId, 'assistant', projectMsg, { type: 'project_selection' });
          
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
          await chatStorage.addMessage(userId, 'assistant', aiResponse.response, { type: 'ai_response' });
        }
    }

  } catch (error) {
    logger.error('Voice processing error:', error);
    await bot.sendMessage(msg.chat.id, 'Error processing your voice message. Please try again or use text commands.');
  }
});

// ============================================================================
// CALLBACK QUERY HANDLER (Inline Keyboard Buttons)
// ============================================================================

bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (!isAuthorized(chatId)) return;
  
  try {
    // Answer the callback query (removes loading state)
    await bot.answerCallbackQuery(query.id);
    
    // Handle planwith:projectId:userId
    if (data.startsWith('planwith:')) {
      const parts = data.split(':');
      const projectId = parts[1];
      const expectedUserId = parts[2];
      const userIdStr = userId.toString();
      
      logger.info(`[Bot] Callback planwith: projectId=${projectId}, expectedUserId=${expectedUserId}, actualUserId=${userIdStr}`);
      
      // Security check
      if (userIdStr !== expectedUserId) {
        logger.warn(`[Bot] Security check failed: ${userIdStr} !== ${expectedUserId}`);
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Get pending plan with multiple retries
      let pending = null;
      let retryCount = 0;
      const maxRetries = 5;
      
      while (!pending && retryCount < maxRetries) {
        pending = await chatStorage.getPendingPlan(userIdStr);
        
        if (!pending) {
          retryCount++;
          logger.warn(`[Bot] Pending plan not found for user ${userIdStr}, retry ${retryCount}/${maxRetries}...`);
          
          if (retryCount < maxRetries) {
            // Exponential backoff: 100ms, 200ms, 400ms, 800ms
            const delay = 100 * Math.pow(2, retryCount - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (!pending) {
        logger.error(`[Bot] No pending plan found for user ${userIdStr} after ${maxRetries} retries`);
        await bot.sendMessage(chatId, 'No pending plan found. Please use `/plan <task>` again.\n\nIf this keeps happening, use `/debug` to check storage status.');
        return;
      }
      
      logger.info(`[Bot] Found pending plan after ${retryCount} retries: ${pending.task}`);
      
      // Get project
      const projects = await getGitLabProjects();
      const project = projects.find(p => p.id === projectId || p.fullPath === projectId);
      
      if (!project) {
        await bot.sendMessage(chatId, `Project "${projectId}" not found.`);
        return;
      }

      // Keep pending plan until we have full plan stored (for /run)
      // Update message to show selection
      await bot.editMessageText(
        `**Task:** ${pending.task}\n\nSelected project: **${project.name}**\n\nCreating plan...`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        }
      );
      
      // Create the plan
      await bot.sendChatAction(chatId, 'typing');
      
      // Get user's preferred AI provider/model
      const userSettings = await chatStorage.getUserSettings(userIdStr);
      const aiProvider = userSettings.preferredAI;
      const aiModel = userSettings.preferredModel;
      
      logger.info(`[Bot] Using AI provider for plan: ${aiProvider}${aiModel ? `, model: ${aiModel}` : ''}`);
      
      const result = await orchestrator.processCommand(`/plan ${pending.task}`, {
        userId: userIdStr,
        chatId: chatId,
        project: project.fullPath,
        projectInfo: project,
        aiProvider: aiProvider,
        aiModel: aiModel,
      });
      
      if (result.success) {
        // Persist full plan so /run (when they click Approve) has steps, branch, project
        await chatStorage.setPendingPlan(userIdStr, {
          task: pending.task,
          chatId,
          username: pending.username || query.from?.username || query.from?.first_name,
          plan: result.plan,
          projectId: project.id,
          projectName: project.name,
          project: project.fullPath,
        });

        // Show plan with approve button
        const keyboard = [[
          { text: '✅ Approve Plan', callback_data: `approve:${result.plan?.id || 'latest'}:${userIdStr}` },
          { text: '❌ Cancel', callback_data: `cancelplan:${userIdStr}` },
        ]];

        await bot.sendMessage(chatId, result.message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: keyboard,
          },
        });

        // Voice confirmation
        const voiceText = `Plan created for ${pending.task}. Complexity: ${result.plan.complexity}, estimated ${result.plan.estimatedHours} hours.`;
        await sendMessageWithVoice(userId, chatId, voiceText, { voice: true, language: 'en' });
      } else {
        await bot.sendMessage(chatId, `Error: ${result.message}`);
      }
    }
    
    // Handle approve:planId:userId
    else if (data.startsWith('approve:')) {
      const parts = data.split(':');
      const expectedUserId = parts[2];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Update message
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );
      
      await bot.sendMessage(chatId, '✅ Plan approved! Starting implementation...');
      
      // Run the plan
      const result = await orchestrator.processCommand('/run', {
        userId: userId,
        chatId: chatId,
      });
      
      await sendMessageWithVoice(userId, chatId, result.message, { parse_mode: 'Markdown' });
    }
    
    // Handle cancelplan:userId
    else if (data.startsWith('cancelplan:')) {
      const expectedUserId = data.split(':')[1];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );
      
      await bot.sendMessage(chatId, '❌ Plan cancelled.');
    }
    
    // Handle showmodels:providerName:userId - Show available models for a provider
    else if (data.startsWith('showmodels:')) {
      const parts = data.split(':');
      const providerName = parts[1];
      const expectedUserId = parts[2];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Get available models for this provider
      const models = aiClient.getAvailableModels ? aiClient.getAvailableModels(providerName) : null;
      
      if (models && models.length > 0) {
        // Show model selection keyboard
        const keyboard = models.map(model => ([{
          text: model,
          callback_data: `setmodel:${providerName}:${model}:${userId}`,
        }]));
        
        // Add back button
        keyboard.push([{
          text: '⬅️ Back to Providers',
          callback_data: `selectprovider:${userId}`,
        }]);
        
        await bot.editMessageText(
          `🤖 Select a **${providerName}** model:`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
          }
        );
      } else {
        // No models available, just set the provider
        await chatStorage.setUserSettings(userId, { preferredAI: providerName });
        
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: query.message.message_id }
        );
        
        await bot.sendMessage(chatId, `✅ AI provider set to: **${providerName}**`, { parse_mode: 'Markdown' });
      }
    }
    
    // Handle setmodel:providerName:modelName:userId
    else if (data.startsWith('setmodel:')) {
      const parts = data.split(':');
      const providerName = parts[1];
      const modelName = parts[2];
      const expectedUserId = parts[3];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Update user settings with both provider and model
      await chatStorage.setUserSettings(userId, { 
        preferredAI: providerName,
        preferredModel: modelName,
      });
      
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );
      
      await bot.sendMessage(chatId, `✅ AI model set to: **${providerName}** (${modelName})`, { parse_mode: 'Markdown' });
    }
    
    // Handle selectprovider:userId - Show provider selection again
    else if (data.startsWith('selectprovider:')) {
      const expectedUserId = data.split(':')[1];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Get available providers
      const aiProviders = ['anthropic', 'moonshot', 'deepseek', 'zhipu'];
      const customProviders = sharedConfig.getCustomProviders ? Object.keys(sharedConfig.getCustomProviders()) : [];
      const allProviders = [...aiProviders, ...customProviders];
      
      const keyboard = allProviders.map(provider => ([{
        text: provider === 'anthropic' ? 'Anthropic (Claude)' :
              provider === 'moonshot' ? '🌙 Moonshot AI' :
              provider === 'deepseek' ? '🔍 DeepSeek' :
              provider === 'zhipu' ? '⚡ Zhipu AI' : `🔧 ${provider}`,
        callback_data: `showmodels:${provider}:${userId}`,
      }]));
      
      await bot.editMessageText(
        '🤖 Select an AI provider:',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: { inline_keyboard: keyboard },
        }
      );
    }
    
    // Handle setprovider:providerName:userId (legacy - for backward compatibility)
    else if (data.startsWith('setprovider:')) {
      const parts = data.split(':');
      const providerName = parts[1];
      const expectedUserId = parts[2];
      
      if (userId.toString() !== expectedUserId) {
        await bot.sendMessage(chatId, 'This button is not for you.');
        return;
      }
      
      // Update user settings
      await chatStorage.setUserSettings(userId, { preferredAI: providerName });
      
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );
      
      await bot.sendMessage(chatId, `✅ AI provider set to: **${providerName}**`, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    logger.error('[Bot] Callback query error:', error);
    await bot.sendMessage(chatId, 'Error processing button click. Please try again.');
  }
});

// ============================================================================
// START SERVER
// ============================================================================

logger.info('Nigents Bot is running!');
logger.info('Features: Persistent chat history, AI voice processing, voice/text toggle');

module.exports = { bot, orchestrator, chatStorage };
