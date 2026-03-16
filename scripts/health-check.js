#!/usr/bin/env node
/**
 * 🦉 Nigents - Health Check Script
 * Tests all API connections and configurations
 */

require('dotenv').config();

// ANSI colors (no extra dependency)
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  boldCyan: (s) => `\x1b[1m\x1b[36m${s}\x1b[0m`,
  boldMagenta: (s) => `\x1b[1m\x1b[35m${s}\x1b[0m`,
};

const log = {
  success: (msg) => console.log(c.green('✅'), msg),
  error: (msg) => console.log(c.red('❌'), msg),
  warning: (msg) => console.log(c.yellow('⚠️'), msg),
  info: (msg) => console.log(c.blue('ℹ️'), msg),
  section: (msg) => console.log(c.boldCyan('\n' + msg)),
};

async function checkTelegram() {
  log.section('Telegram Bot');
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      log.error('TELEGRAM_BOT_TOKEN not set');
      return false;
    }

    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    
    log.success(`Bot connected: @${me.username}`);
    log.info(`Bot name: ${me.first_name}`);
    
    if (process.env.TELEGRAM_CHAT_ID) {
      log.success(`Chat ID configured: ${process.env.TELEGRAM_CHAT_ID}`);
    } else {
      log.error('TELEGRAM_CHAT_ID not set');
    }
    
    return true;
  } catch (error) {
    log.error(`Telegram connection failed: ${error.message}`);
    return false;
  }
}

async function checkClaude() {
  log.section('Claude API (Anthropic)');
  try {
    const { Anthropic } = require('@anthropic-ai/sdk');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      log.error('ANTHROPIC_API_KEY not set');
      return false;
    }

    const anthropic = new Anthropic({ apiKey });
    
    // Test with a simple completion
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say "Nigents is ready"' }],
    });

    log.success('Claude API connected');
    log.info(`Response: "${response.content[0].text.substring(0, 50)}..."`);
    return true;
  } catch (error) {
    log.error(`Claude API failed: ${error.message}`);
    return false;
  }
}

async function checkOpenAI() {
  log.section('OpenAI API (Whisper)');
  try {
    const { OpenAI } = require('openai');
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      log.error('OPENAI_API_KEY not set');
      return false;
    }

    const openai = new OpenAI({ apiKey });
    
    // Test by listing models
    const models = await openai.models.list();
    const whisperModel = models.data.find(m => m.id.includes('whisper'));
    
    if (whisperModel) {
      log.success('OpenAI API connected');
      log.info(`Whisper model available: ${whisperModel.id}`);
    } else {
      log.warning('OpenAI connected but Whisper model not found in list');
    }
    
    return true;
  } catch (error) {
    log.error(`OpenAI API failed: ${error.message}`);
    return false;
  }
}

async function checkGitLab() {
  log.section('GitLab API');
  try {
    const gitlab = require('../src/tools/gitlab');
    const result = await gitlab.testConnection();
    
    if (result.success) {
      log.success(`GitLab connected: @${result.user}`);
      log.info(`Name: ${result.name}`);
      
      if (process.env.GITLAB_NAMESPACE) {
        log.success(`Namespace: ${process.env.GITLAB_NAMESPACE}`);
      } else {
        log.error('GITLAB_NAMESPACE not set');
      }
      
      return true;
    } else {
      log.error(`GitLab connection failed: ${result.error}`);
      return false;
    }
  } catch (error) {
    log.error(`GitLab check failed: ${error.message}`);
    return false;
  }
}

async function checkOpenHands() {
  log.section('OpenHands');
  const openhandsUrl = process.env.OPENHANDS_URL || 'http://localhost:3000';
  const isExplicit = process.env.OPENHANDS_URL && process.env.OPENHANDS_URL !== 'http://localhost:3000';

  try {
    const openhands = require('../src/tools/openhands');
    const result = await openhands.healthCheck();

    if (result.available) {
      log.success('OpenHands is available');
      return true;
    }
    // Optional: no warning when using default URL (nothing running on 3000 is expected)
    if (isExplicit) {
      log.warning(`OpenHands not reachable at ${openhandsUrl}: ${result.error}`);
      log.info('Backend Dev will use AI fallback. Start OpenHands if you need sandbox execution.');
    } else {
      log.info('OpenHands not running (optional). Backend Dev uses AI fallback. Set OPENHANDS_URL and run the service to enable sandbox.');
    }
    return true; // Not a failure
  } catch (error) {
    if (isExplicit) {
      log.warning(`OpenHands check failed: ${error.message}`);
    } else {
      log.info('OpenHands not running (optional). Backend Dev uses AI fallback.');
    }
    return true;
  }
}

async function checkConfig() {
  log.section('Configuration Files');
  
  const fs = require('fs');
  const path = require('path');
  
  const files = [
    'config/agents.json',
    'config/projects.json',
    '.env',
  ];
  
  let allExist = true;
  files.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      log.success(`${file} exists`);
    } else {
      log.error(`${file} not found`);
      allExist = false;
    }
  });
  
  return allExist;
}

async function main() {
  console.log(c.boldMagenta('\n🦉 Nigents Health Check\n'));
  
  const results = {
    telegram: await checkTelegram(),
    claude: await checkClaude(),
    openai: await checkOpenAI(),
    gitlab: await checkGitLab(),
    openhands: await checkOpenHands(),
    config: await checkConfig(),
  };

  log.section('Summary');
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  if (passed === total) {
    console.log(c.green('\n✅ All checks passed! Nigents is ready to fly.\n'));
    process.exit(0);
  } else {
    console.log(c.yellow(`\n⚠️  ${passed}/${total} checks passed. Some features may not work.\n`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(c.red('Health check failed:'), error);
  process.exit(1);
});
