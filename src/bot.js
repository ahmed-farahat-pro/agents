/**
 * Nigents - Telegram Bot
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
  activeChats: new Map(),
};

// Store pending plan selections
const pendingPlanSelections = new Map();

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

logger.info('Nigents Bot starting...');

// Helper function to check authorization
function isAuthorized(userChatId) {
  return botState.authorizedUsers.has(userChatId.toString());
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// /start command
bot.onText(/\/start/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const welcomeMessage = `
**Welcome to Nigents!**

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
• /queue — List queued tasks
• /cancel <id> — Cancel task

I understand Arabic and English voice messages!
`;

  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'Markdown' });
  
  // Send voice welcome
  await reporter.sendVoice('Welcome to Nigents! I am your AI development team. How can I help you today?', 'en');
});

// /plan command - Shows project selection
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1];
  
  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    
    // Store pending plan
    pendingPlanSelections.set(msg.from.id, {
      task,
      timestamp: Date.now(),
    });
    
    // Show compact project selection
    let message = `**Task:** ${task}\n\n`;
    message += '**Select project:**\n';
    
    projectsConfig.projects.forEach((project, index) => {
      message += `${index + 1}. ${project.name} (\`${project.id}\`)\n`;
    });
    
    message += '\n**Use:** `/planwith <project-id>`';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('Failed to load projects for plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects');
  }
});

// /planwith command - Create plan with selected project
bot.onText(/\/planwith (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  const pending = pendingPlanSelections.get(msg.from.id);
  
  if (!pending) {
    await bot.sendMessage(msg.chat.id, 'No pending plan. Use `/plan <task>` first.');
    return;
  }
  
  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    const project = projectsConfig.projects.find(p => p.id === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found.`);
      return;
    }
    
    pendingPlanSelections.delete(msg.from.id);
    
    await bot.sendChatAction(msg.chat.id, 'typing');
    const statusMsg = await bot.sendMessage(msg.chat.id, `Analyzing ${project.name}...`);

    const result = await orchestrator.processCommand(`/plan ${pending.task}`, {
      userId: msg.from.id,
      chatId: msg.chat.id,
      project: project.gitlabRepo,
      projectInfo: project,
    });

    await bot.deleteMessage(msg.chat.id, statusMsg.message_id);

    if (result.success) {
      await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
      
      const voiceText = `Plan created for ${pending.task}. Complexity: ${result.plan.complexity}, estimated ${result.plan.estimatedHours} hours. Reply with /approve to start.`;
      await reporter.sendVoice(voiceText, 'en');
    } else {
      await bot.sendMessage(msg.chat.id, `Error: ${result.message}`);
    }
    
  } catch (error) {
    logger.error('Failed to create plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error creating plan');
  }
});

// /projects command - Compact list
bot.onText(/\/projects/, async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    const activeProject = projectsConfig.defaultProject;
    
    let message = '**Your Projects:**\n';
    projectsConfig.projects.forEach((project, index) => {
      const isActive = project.id === activeProject ? ' [ACTIVE]' : '';
      message += `${index + 1}. ${project.name}${isActive} (\`${project.id}\`)\n`;
    });
    message += '\nSwitch: `/project <id>`';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Failed to load projects:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects');
  }
});

// /project command - Switch project
bot.onText(/\/project (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  
  try {
    const projectsPath = path.join(__dirname, '..', 'config', 'projects.json');
    const projectsConfig = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    const project = projectsConfig.projects.find(p => p.id === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found.`);
      return;
    }
    
    projectsConfig.defaultProject = projectId;
    fs.writeFileSync(projectsPath, JSON.stringify(projectsConfig, null, 2));
    orchestrator.activeProject = projectId;
    
    await bot.sendMessage(msg.chat.id, 
      `Switched to: **${project.name}**\nRepo: \`${project.gitlabRepo}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    logger.error('Failed to switch project:', error);
    await bot.sendMessage(msg.chat.id, 'Error switching project');
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

  await bot.sendMessage(msg.chat.id, result.message, { parse_mode: 'Markdown' });
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

// ============================================================================
// VOICE MESSAGE HANDLER
// ============================================================================

bot.on('voice', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  await bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const voiceFile = await voice.downloadVoiceFile(bot, msg.voice.file_id);
    await bot.sendMessage(msg.chat.id, 'Transcribing voice...');
    
    const transcription = await voice.speechToText(voiceFile);
    voice.cleanup(voiceFile);

    if (!transcription.success) {
      await bot.sendMessage(msg.chat.id, 'Failed to transcribe voice message');
      return;
    }

    await bot.sendMessage(msg.chat.id, `Transcribed: "${transcription.text}"`);

    // Route via intent router
    await bot.sendChatAction(msg.chat.id, 'typing');
    const intentResult = await intentRouter.detectIntent(transcription.text);

    if (!intentResult.success) {
      await bot.sendMessage(msg.chat.id, 'Sorry, I did not understand. Try /plan, /projects, etc.');
      return;
    }

    const response = await intentRouter.generateResponse(intentResult);
    await bot.sendMessage(msg.chat.id, response.message);

    // Handle project selection for plan intent
    if (intentResult.intent === 'PLAN' && intentResult.extracted_task) {
      // Store and show project selection
      pendingPlanSelections.set(msg.from.id, {
        task: intentResult.extracted_task,
        timestamp: Date.now(),
      });
      
      // Trigger project selection
      bot.emitText(msg, '/projects');
      await bot.sendMessage(msg.chat.id, 'Reply with: `/planwith <project-id>` to create the plan.');
    }

  } catch (error) {
    logger.error('Voice processing error:', error);
    await bot.sendMessage(msg.chat.id, 'Error processing voice message');
  }
});

// ============================================================================
// START SERVER
// ============================================================================

logger.info('Nigents Bot is running!');

module.exports = { bot, orchestrator };
