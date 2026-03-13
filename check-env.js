#!/usr/bin/env node
/**
 * Debug script to check environment variables
 */

require('dotenv').config();

console.log('=== Environment Variables Check ===\n');

console.log('AI Provider API Keys:');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'SET (' + process.env.ANTHROPIC_API_KEY.substring(0, 10) + '...)' : 'NOT SET');
console.log('  ZHIPU_API_KEY:', process.env.ZHIPU_API_KEY ? 'SET (' + process.env.ZHIPU_API_KEY.substring(0, 10) + '...)' : 'NOT SET');
console.log('  MOONSHOT_API_KEY:', process.env.MOONSHOT_API_KEY ? 'SET (' + process.env.MOONSHOT_API_KEY.substring(0, 10) + '...)' : 'NOT SET');
console.log('  DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? 'SET (' + process.env.DEEPSEEK_API_KEY.substring(0, 10) + '...)' : 'NOT SET');
console.log('  DEFAULT_AI_PROVIDER:', process.env.DEFAULT_AI_PROVIDER || 'anthropic (default)');

console.log('\nGitLab:');
console.log('  GITLAB_TOKEN:', process.env.GITLAB_TOKEN ? 'SET' : 'NOT SET');
console.log('  GITLAB_NAMESPACE:', process.env.GITLAB_NAMESPACE || 'NOT SET');

console.log('\nTelegram:');
console.log('  TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET');
console.log('  TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID || 'NOT SET');

console.log('\nDashboard:');
console.log('  DASHBOARD_PORT:', process.env.DASHBOARD_PORT || '4000 (default)');
console.log('  DASHBOARD_PASSWORD:', process.env.DASHBOARD_PASSWORD ? 'SET' : 'NOT SET');

console.log('\n=== AI Client Status ===\n');

const aiClient = require('./src/utils/ai-client');
const providers = aiClient.getAvailableProviders();

console.log('Available Providers:');
Object.entries(providers).forEach(([key, provider]) => {
  console.log(`  ${key}: ${provider.enabled ? 'ENABLED' : 'DISABLED'} - ${provider.name}`);
});

console.log('\nDefault Provider:', aiClient.defaultProvider);
