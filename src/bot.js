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

// Helper: Get active project from GitLab cache
async function getActiveProject() {
  const projects = await getGitLabProjects();
  // Return first project as default, or null if none
  return projects[0] || null;
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

// Cache for GitLab projects
let cachedProjects = [];
let lastFetchTime = 0;

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

// /plan command - Shows project selection from GitLab
bot.onText(/\/plan (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const task = match[1];
  
  await bot.sendChatAction(msg.chat.id, 'typing');
  
  try {
    const projects = await getGitLabProjects();
    
    if (projects.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No projects found in your GitLab account. Please check your GITLAB_TOKEN and GITLAB_NAMESPACE.');
      return;
    }
    
    // Store pending plan
    pendingPlanSelections.set(msg.from.id, {
      task,
      timestamp: Date.now(),
    });
    
    // Show compact project selection
    let message = `**Task:** ${task}\n\n`;
    message += '**Select a project from your GitLab:**\n';
    
    projects.forEach((project, index) => {
      message += `${index + 1}. ${project.name} (\`${project.id}\`)\n`;
    });
    
    message += '\n**Use:** `/planwith <project-id>`';
    
    await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('Failed to load projects for plan:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects from GitLab');
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
    const projects = await getGitLabProjects();
    const project = projects.find(p => p.id === projectId || p.fullPath === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found. Use /projects to see available projects.`);
      return;
    }
    
    pendingPlanSelections.delete(msg.from.id);
    
    await bot.sendChatAction(msg.chat.id, 'typing');
    const statusMsg = await bot.sendMessage(msg.chat.id, `Analyzing ${project.name}...`);

    const result = await orchestrator.processCommand(`/plan ${pending.task}`, {
      userId: msg.from.id,
      chatId: msg.chat.id,
      project: project.fullPath,
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
  } catch (error) {
    logger.error('Failed to load projects:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading projects from GitLab. Check your GITLAB_TOKEN.');
  }
});

// /project command - Set default project (from GitLab)
bot.onText(/\/project (.+)/, async (msg, match) => {
  if (!isAuthorized(msg.chat.id)) return;

  const projectId = match[1].trim();
  
  try {
    const projects = await getGitLabProjects();
    const project = projects.find(p => p.id === projectId || p.fullPath === projectId);
    
    if (!project) {
      await bot.sendMessage(msg.chat.id, `Project "${projectId}" not found in your GitLab. Use /projects to see available projects.`);
      return;
    }
    
    // Store as default in a simple cache file
    const defaultProjectFile = path.join(__dirname, '..', '.default-project');
    fs.writeFileSync(defaultProjectFile, project.fullPath);
    
    await bot.sendMessage(msg.chat.id, 
      `Default project set to: **${project.name}**\nRepo: \`${project.fullPath}\``,
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
