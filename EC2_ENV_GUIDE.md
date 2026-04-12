# 🖥️ EC2 Environment Variables Guide

## Quick Commands to Edit .env on EC2

### 1. SSH into your EC2 instance

```bash
# Using your key file
ssh -i openclaw.pem ubuntu@your-ec2-ip

# Or if using AWS Session Manager
aws ssm start-session --target i-your-instance-id
```

### 2. Navigate to the app directory

```bash
cd ~/nigents
```

### 3. Edit the .env file

#### Option A: Using nano (easiest for beginners)
```bash
nano .env
```

#### Option B: Using vim
```bash
vim .env
```

#### Option C: Using echo commands (quick single edits)
```bash
# Add a new variable
echo "GITLAB_TOKEN=glpat-your-token" >> .env

# Or use sed to replace existing values
sed -i 's/^GITLAB_TOKEN=.*/GITLAB_TOKEN=glpat-your-new-token/' .env
```

### 4. Example .env file

```bash
# Required: Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id

# Required: GitLab
GITLAB_TOKEN=glpat-your-gitlab-token
GITLAB_NAMESPACE=bonyad-tech
GITLAB_URL=https://gitlab.com

# Required: OpenAI (for Whisper & TTS)
OPENAI_API_KEY=sk-your-openai-key

# Required: Database
DB_HOST=localhost
DB_USER=nightowl
DB_PASSWORD=your-db-password
DB_NAME=nightowl

# Optional: AI Providers (set at least one)
ANTHROPIC_API_KEY=sk-ant-your-key
ZHIPU_API_KEY=your-zhipu-key
MOONSHOT_API_KEY=your-moonshot-key

# Optional: GitHub
GITHUB_TOKEN=ghp-your-token

# Optional: Features
ENABLE_VOICE=true
NODE_ENV=production
```

### 5. Restart the bot after editing .env

```bash
# Using PM2
pm2 restart ecosystem.config.js

# Or restart specific app
pm2 restart nigents-bot

# Check status
pm2 status
pm2 logs nigents-bot --lines 50
```

---

## 🔧 Alternative: Set via Bot Commands (Recommended for API Keys)

Instead of editing .env, you can configure many settings via Telegram:

### Set AI Providers
```
/setallagents zhipu glm-5
/setagent backend-dev zhipu glm-5
```

### Add Custom AI Models
```
/addglm your-api-key glm-5
/addmoonshot your-api-key moonshot-v1-8k
/addopenai
(addopenai Grok|xai-key|https://api.x.ai/v1|grok-2)
```

### Test Configuration
```
/testmcp          # Test MCP servers & GitLab
/mymodels         # List AI models
/status           # Check system status
```

---

## 📁 Where Files Are Located on EC2

| File/Directory | Path |
|----------------|------|
| App code | `~/nigents` or `/home/ubuntu/nigents` |
| .env file | `~/nigents/.env` |
| Logs | `~/nigents/logs/` |
| Data | `~/nigents/data/` |
| PM2 config | `~/nigents/ecosystem.config.js` |
| Shared config | `~/nigents/data/shared-config.json` |

---

## 🔍 Useful Commands on EC2

```bash
# View logs in real-time
pm2 logs nigents-bot

# View last 100 lines
tail -f ~/nigents/logs/bot.log

# Check if env vars are loaded
pm2 env nigents-bot

# Edit env and reload
nano ~/nigents/.env
pm2 restart nigents-bot --update-env

# Check disk space
df -h

# Check memory
free -h

# Check running processes
pm2 status
ps aux | grep node
```

---

## ⚡ Quick Fix Script

If you need to quickly update the .env and restart:

```bash
#!/bin/bash
cd ~/nigents

# Backup old .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Edit .env
nano .env

# Reload PM2 with new env
pm2 restart ecosystem.config.js --update-env

# Check logs
pm2 logs nigents-bot --lines 20
```

Save this as `~/reload-env.sh` and run `bash ~/reload-env.sh`
