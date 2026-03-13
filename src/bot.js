/**
 * 🦉 Nigents - Telegram Bot
 * Main entry point for the AI agent team
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const logger = require('./utils/logger');
const voice = require('./tools/voice');
const gitlab = require('./tools/gitlab');
const path = require('path');
const fs = require('fs');
const intentRouter = require('./utils/intent-router');

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

// Helper: Get active project from config
function getActiveProject() {
  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    
    const activeProject = projectsConfig.projects.find(
      p => p.id === projectsConfig.defaultProject
    );
    
    return activeProject || null;
  } catch (error) {
    logger.error('Failed to get active project:', error);
    return null;
  }
}

logger.info('🦉 Nigents Bot starting...');

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// /start command
bot.onText(/\/start/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const welcomeMessage = `
🦉 **Welcome to Nigents!**

Your AI development team. Send tasks via voice or text, and I'll handle the rest.

**🎙️ Just Talk To Me!**
Send voice notes or text naturally:
• "Add login feature with JWT"
• "Switch to the frontend project"  
• "Use Moonshot AI instead"
• "What's the status?"
• "I want to talk to the backend developer"

**📋 Quick Commands:**
• /plan <task> — Create implementation plan
• /approve — Approve plan
• /projects — List projects
• /project <id> — Switch project
• /models — List AI models
• /model <id> — Switch AI model
• /status — Check status
• /ask <question> — Ask about code

**👥 Agent Chat:**
• /meet <agent> — Chat with specific agent
  (planner, backend, frontend, qa, reviewer)

**⚙️ Management:**
• /run — Start implementation now
• /queue — List queued tasks
• /cancel <id> — Cancel task

I understand Arabic and English voice messages! 🌙
`;

  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
  
  // Send voice welcome
  await reporter.sendVoice('Welcome to Nigents! I am your AI development team. How can I help you today?', 'en');
});

// /plan command
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1];
  const activeProject = getActiveProject();
  
  await bot.sendChatAction(msg.chat.id, 'typing');

  const statusMsg = await bot.sendMessage(msg.chat.id, '📋 Planner is analyzing your request...');

  const result = await orchestrator.processCommand(`/plan ${task}`, {
    userId: msg.from.id,
    chatId: msg.chat.id,
    project: activeProject?.gitlabRepo,
    projectInfo: activeProject,
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

// /projects command - List available projects
bot.onText(/\/projects/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    
    const activeProject = projectsConfig.defaultProject;
    
    let message = '📁 **Available Projects**\n\n';
    
    projectsConfig.projects.forEach(project => {
      const isActive = project.id === activeProject ? ' ✅' : '';
      message += `**${project.name}**${isActive}\n`;
      message += `  ID: \`${project.id}\`\n`;
      message += `  Repo: \`${project.gitlabRepo}\`\n`;
      message += `  Stack: ${Object.values(project.stack).flat().slice(0, 3).join(', ')}\n\n`;
    });
    
    message += `Active project: **${activeProject}**\n\n`;
    message += `To switch project, use:\n`;
    message += '`/project <project-id>`';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Failed to load projects:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error loading projects list');
  }
});

// /project command - Switch active project
bot.onText(/\/project (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  
  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    
    const project = projectsConfig.projects.find(p => p.id === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `❌ Project "${projectId}" not found. Use /projects to see available projects.`);
      return;
    }
    
    // Update default project
    projectsConfig.defaultProject = projectId;
    fs.writeFileSync(projectsPath, JSON.stringify(projectsConfig, null, 2));
    
    // Update orchestrator context
    orchestrator.activeProject = projectId;
    
    await bot.sendMessage(msg.chat.id, 
      `✅ **Switched to project: ${project.name}**\n\n` +
      `Repository: \`${project.gitlabRepo}\`\n` +
      `Stack: ${Object.keys(project.stack).join(', ')}\n\n` +
      `All future tasks will target this project.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to switch project:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error switching project');
  }
});

// ============================================================================
// AI MODEL COMMANDS
// ============================================================================

// /models command - List available AI models
bot.onText(/\/models/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  try {
    const aiClient = require('./utils/ai-client');
    const providers = aiClient.getAvailableProviders();
    const currentProvider = aiClient.defaultProvider;
    
    let message = '🤖 **Available AI Models**\n\n';
    
    Object.entries(providers).forEach(([key, provider]) => {
      const isActive = key === currentProvider ? ' ✅' : '';
      const status = provider.enabled ? '🟢' : '🔴';
      
      message += `${status} **${provider.name}**${isActive}\n`;
      message += `  ID: \`${key}\`\n`;
      message += `  Models: ${provider.models.slice(0, 3).join(', ')}${provider.models.length > 3 ? '...' : ''}\n`;
      message += `  Status: ${provider.enabled ? 'Available' : 'Not configured'}\n\n`;
    });
    
    message += `Current provider: **${providers[currentProvider]?.name || currentProvider}**\n\n`;
    message += `To switch provider, use:\n`;
    message += '`/model <provider-id>`\n\n';
    message += `Examples:\n`;
    message += '`/model anthropic` - Use Claude\n';
    message += '`/model moonshot` - Use Moonshot AI\n';
    message += '`/model zhipu` - Use Zhipu GLM\n';
    message += '`/model deepseek` - Use DeepSeek';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Failed to get AI models:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error loading AI models');
  }
});

// /model command - Switch AI provider
bot.onText(/\/model (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const providerId = match[1].trim().toLowerCase();
  
  try {
    const aiClient = require('./utils/ai-client');
    const providers = aiClient.getAvailableProviders();
    
    const provider = providers[providerId];
    
    if (!provider) {
      await bot.sendMessage(msg.chat.id, 
        `❌ Provider "${providerId}" not found.\n\nUse /models to see available providers.`
      );
      return;
    }
    
    if (!provider.enabled) {
      await bot.sendMessage(msg.chat.id, 
        `❌ Provider "${provider.name}" is not configured.\n\n` +
        `Please add the API key to your .env file:\n` +
        `${providerId.toUpperCase()}_API_KEY=your_key_here`
      );
      return;
    }
    
    // Update default provider
    aiClient.defaultProvider = providerId;
    
    // Also update orchestrator's default
    orchestrator.provider = providerId;
    
    await bot.sendMessage(msg.chat.id, 
      `✅ **Switched to AI Provider: ${provider.name}**\n\n` +
      `Default model: \`${provider.defaultModel}\`\n` +
      `Available models: ${provider.models.length}\n\n` +
      `All future tasks will use this provider.`,
      { parse_mode: 'Markdown' }
    );
    
    // Send voice confirmation
    await reporter.sendVoice(
      `Switched to ${provider.name}. This model will be used for all future tasks.`,
      'en'
    );
    
  } catch (error) {
    logger.error('Failed to switch AI provider:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error switching AI provider');
  }
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

    // Use intent router to understand what user wants
    await bot.sendChatAction(msg.chat.id, 'typing');
    const intentResult = await intentRouter.detectIntent(transcription.text, {
      userId: msg.from.id,
      isVoice: true,
    });

    if (!intentResult.success) {
      await bot.sendMessage(msg.chat.id, '❌ Sorry, I had trouble understanding. Please try again or use commands like /plan, /projects, etc.');
      return;
    }

    // Generate response based on intent
    const response = await intentRouter.generateResponse(intentResult);
    
    // Acknowledge understanding
    await bot.sendMessage(msg.chat.id, response.message);

    // Execute the appropriate action
    await executeIntent(msg, intentResult, response, {
      isVoice: true,
      detectedLanguage: transcription.language,
    });

  } catch (error) {
    logger.error('Voice processing error:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error processing voice message');
  }
});

// ============================================================================
// GENERAL MESSAGE HANDLER (for natural language and agent chat)
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
      const result = await agent.callAI(msg.text);
      await bot.sendMessage(msg.chat.id, result.content, { parse_mode: 'Markdown' });
    }
    return;
  }

  // Natural language handling with intent router
  await bot.sendChatAction(msg.chat.id, 'typing');
  
  try {
    const intentResult = await intentRouter.detectIntent(msg.text, {
      userId: msg.from.id,
      isVoice: false,
    });

    if (!intentResult.success) {
      await bot.sendMessage(msg.chat.id, 'I\'m not sure what you want to do. Try:\n• /plan <task>\n• /projects\n• /models\n• Or send "help" for more options.');
      return;
    }

    // Generate and send response
    const response = await intentRouter.generateResponse(intentResult);
    await bot.sendMessage(msg.chat.id, response.message);

    // Execute the action
    await executeIntent(msg, intentResult, response, {
      isVoice: false,
    });

  } catch (error) {
    logger.error('Message processing error:', error);
    await bot.sendMessage(msg.chat.id, '❌ Error processing your message');
  }
});

// ============================================================================
// INTENT EXECUTION HELPER
// ============================================================================

async function executeIntent(msg, intent, response, context = {}) {
  const activeProject = getActiveProject();
  
  switch (response.type) {
    case 'PLAN':
      if (response.task) {
        await bot.sendChatAction(msg.chat.id, 'typing');
        const result = await orchestrator.processCommand(`/plan ${response.task}`, {
          userId: msg.from.id,
          chatId: msg.chat.id,
          project: activeProject?.gitlabRepo,
          projectInfo: activeProject,
          ...context,
        });
        await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
      }
      break;

    case 'PROJECT_SWITCH':
      // Try to find matching project
      try {
        const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
        const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
        
        const matchedProject = projectsConfig.projects.find(p => 
          p.id.toLowerCase() === intent.extracted_project?.toLowerCase() ||
          p.name.toLowerCase().includes(intent.extracted_project?.toLowerCase())
        );
        
        if (matchedProject) {
          projectsConfig.defaultProject = matchedProject.id;
          fs.writeFileSync(projectsPath, JSON.stringify(projectsConfig, null, 2));
          orchestrator.activeProject = matchedProject.id;
          
          await bot.sendMessage(msg.chat.id, 
            `✅ Switched to project: ${matchedProject.name}\nRepository: ${matchedProject.gitlabRepo}`
          );
        } else {
          await bot.sendMessage(msg.chat.id, 
            `❌ Project "${intent.extracted_project}" not found. Use /projects to see available projects.`
          );
        }
      } catch (error) {
        await bot.sendMessage(msg.chat.id, '❌ Error switching project');
      }
      break;

    case 'PROJECT_LIST':
      bot.emitText(msg, '/projects');
      break;

    case 'MODEL_SWITCH':
      const aiClient = require('./utils/ai-client');
      const providers = aiClient.getAvailableProviders();
      
      const matchedProvider = Object.entries(providers).find(([key, p]) => 
        key.toLowerCase() === intent.extracted_model?.toLowerCase() ||
        p.name.toLowerCase().includes(intent.extracted_model?.toLowerCase())
      );
      
      if (matchedProvider && matchedProvider[1].enabled) {
        aiClient.defaultProvider = matchedProvider[0];
        orchestrator.provider = matchedProvider[0];
        await bot.sendMessage(msg.chat.id, 
          `✅ Switched to ${matchedProvider[1].name}`
        );
      } else {
        await bot.sendMessage(msg.chat.id, 
          `❌ Model "${intent.extracted_model}" not found or not configured. Use /models to see available models.`
        );
      }
      break;

    case 'MODEL_LIST':
      bot.emitText(msg, '/models');
      break;

    case 'STATUS':
      const statusResult = await orchestrator.processCommand('/status', {});
      await bot.sendMessage(msg.chat.id, statusResult.message, { parse_mode: 'Markdown' });
      break;

    case 'APPROVE':
      const approveResult = await orchestrator.processCommand('/approve', {
        userId: msg.from.id,
        chatId: msg.chat.id,
      });
      await bot.sendMessage(msg.chat.id, approveResult.message, { parse_mode: 'Markdown' });
      break;

    case 'ASK':
      if (response.question) {
        await bot.sendChatAction(msg.chat.id, 'typing');
        const askResult = await orchestrator.processCommand(`/ask ${response.question}`, {
          userId: msg.from.id,
          chatId: msg.chat.id,
        });
        await bot.sendMessage(msg.chat.id, askResult.message, { parse_mode: 'Markdown' });
      }
      break;

    case 'CHAT':
      if (intent.extracted_agent) {
        const agentMap = {
          'planner': 'planner',
          'backend': 'backend',
          'frontend': 'frontend',
          'qa': 'qa',
          'reviewer': 'reviewer',
          'dev': 'backend',
          'developer': 'backend',
        };
        
        const agentName = agentMap[intent.extracted_agent.toLowerCase()];
        if (agentName) {
          botState.activeChats.set(msg.from.id, agentName);
          await bot.sendMessage(msg.chat.id, 
            `💬 Now chatting with ${agentName} agent. Send your message or /exit to stop.`
          );
        } else {
          await bot.sendMessage(msg.chat.id, 
            `❌ Agent "${intent.extracted_agent}" not found. Available: planner, backend, frontend, qa, reviewer`
          );
        }
      }
      break;

    case 'HELP':
      bot.emitText(msg, '/start');
      break;

    case 'GREETING':
      // Already sent greeting, nothing more to do
      break;

    case 'CLARIFY':
    case 'UNKNOWN':
    default:
      // Already sent clarification message
      break;
  }
}

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
