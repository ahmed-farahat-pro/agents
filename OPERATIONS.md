# Nigents Operations Guide

> Daily operations, updates, and troubleshooting on EC2

---

## Quick Reference

```bash
# SSH into EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# EDIT ENVIRONMENT VARIABLES
nano /home/ubuntu/nightowl/.env
pm2 restart all

# PULL UPDATES FROM GITHUB
cd /home/ubuntu/nightowl
git pull origin feature/custom-mcp-servers
npm install
pm2 restart all

# RESTART SERVICES
pm2 restart all

# CHECK LOGS
pm2 logs --lines 50
```

---

## Edit Environment Variables on EC2

### Step 1: SSH into your EC2 instance

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
```

### Step 2: Navigate to project and edit .env

```bash
cd /home/ubuntu/nightowl
nano .env
```

### Step 3: Edit the variables you need

Common variables to edit:
```bash
# Telegram (from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# AI Provider (pick at least one)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
ZHIPU_API_KEY=your.zhipu.api.key.here
MOONSHOT_API_KEY=sk-your-moonshot-key-here

# GitLab (CRITICAL for repos to work!)
GITLAB_TOKEN=glpat-your_gitlab-token-here
GITLAB_NAMESPACE=your_gitlab_username
GITLAB_URL=https://gitlab.com

# OpenAI (for voice processing)
OPENAI_API_KEY=sk-your-openai-key-here

# Dashboard
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=your_secure_password

# Feature flags
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=true
```

### Step 4: Save and restart

In nano editor:
- Press `Ctrl+X` to exit
- Press `Y` to confirm save
- Press `Enter` to confirm filename

Then restart services:
```bash
pm2 restart all
```

---

## Pull Updates from GitHub

### One-Command Update

Run this from your local laptop:

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP << 'EOF'
cd /home/ubuntu/nightowl
echo "Pulling updates..."
git pull origin feature/custom-mcp-servers
echo "Installing dependencies..."
npm install
echo "Building MCP servers..."
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..
echo "Restarting services..."
pm2 restart all
echo "✅ Update complete!"
EOF
```

### Step-by-Step Update (On EC2)

```bash
# 1. SSH into EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# 2. Go to project directory
cd /home/ubuntu/nightowl

# 3. Pull latest changes
git pull origin feature/custom-mcp-servers

# 4. If you have local changes that conflict:
git stash          # Save your local changes
git pull origin feature/custom-mcp-servers
git stash pop      # Restore your local changes

# 5. Install any new dependencies
npm install

# 6. Rebuild MCP servers if needed
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..

# 7. Restart all services
pm2 restart all

# 8. Check status
pm2 status
pm2 logs --lines 20
```

---

## GitLab Connection Fix (Repos Not Showing)

### The Problem

Even with SSH key set up, repos don't show in dashboard because **Nigents uses GitLab API Token, not just SSH!**

### The Solution

#### Step 1: Generate GitLab Personal Access Token

1. Go to **GitLab.com**
2. Click your **profile avatar** (top right)
3. Click **Edit Profile**
4. In left sidebar, click **Access Tokens**
5. Click **"Add new token"** button
6. Fill in:
   - **Token name:** `Nigents`
   - **Expiration date:** 1 year from now
   - **Scopes:** Check ALL of these:
     - [x] `api` (Full API access)
     - [x] `read_repository`
     - [x] `write_repository`
     - [x] `read_user`
7. Click **"Create personal access token"**
8. **COPY THE TOKEN IMMEDIATELY!** (You can't see it again)
   - Looks like: `glpat-xxxxxxxxxxxxxxxxxxxx`

#### Step 2: Add Token to .env

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Edit .env
nano /home/ubuntu/nightowl/.env

# Add these lines:
GITLAB_TOKEN=glpat-your-token-here
GITLAB_NAMESPACE=your_gitlab_username_or_group
GITLAB_URL=https://gitlab.com

# Save: Ctrl+X, Y, Enter
```

#### Step 3: Restart Services

```bash
pm2 restart all
```

#### Step 4: Test Connection

```bash
# Test API access
curl --header "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  "https://gitlab.com/api/v4/user"

# Should return your user info
```

#### Step 5: Configure Repositories

**Via Dashboard (Easiest):**
1. Open: `http://YOUR_EC2_IP:4000`
2. Go to **Settings**
3. Enter GitLab Token and Namespace
4. Click **"Save GitLab Settings"**
5. Go to **GitLab Repos** in sidebar
6. Click **"Refresh"** to fetch repos

**Or via config file:**
```bash
nano /home/ubuntu/nightowl/config/projects.json
```

Add your repos:
```json
{
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "gitlabRepo": "username/repo-name",
      "stack": {
        "backend": "Node.js",
        "frontend": "React"
      },
      "defaultBranch": "main"
    }
  ]
}
```

---

## Common Commands

### Service Management

```bash
# View all running services
pm2 status

# View logs
pm2 logs                    # All services
pm2 logs nigents-bot        # Bot only
pm2 logs nigents-dashboard  # Dashboard only

# Restart services
pm2 restart all             # Restart everything
pm2 restart nigents-bot     # Restart bot only
pm2 restart nigents-dashboard  # Restart dashboard only

# Stop services
pm2 stop all

# Start services
pm2 start all

# Real-time monitoring
pm2 monit

# View startup script
pm2 startup
```

### File Editing

```bash
# Edit environment variables
nano /home/ubuntu/nightowl/.env

# Edit agent configuration
nano /home/ubuntu/nightowl/config/agents.json

# Edit project configuration
nano /home/ubuntu/nightowl/config/projects.json

# View log files
tail -f /home/ubuntu/nightowl/logs/app.log
```

### Git Operations

```bash
# Check git status
cd /home/ubuntu/nightowl
git status

# View current branch
git branch

# View recent commits
git log --oneline -5

# Force pull (overwrite local changes)
git fetch origin
git reset --hard origin/feature/custom-mcp-servers
```

---

## Troubleshooting

### Dashboard Not Accessible

```bash
# Check if running
pm2 status

# Check if port is listening
sudo netstat -tlnp | grep 4000

# Check firewall
sudo ufw status
sudo ufw allow from YOUR_IP to any port 4000

# Check AWS Security Group
# AWS Console → EC2 → Security Groups → Must have port 4000 open
```

### GitLab Repos Not Showing

```bash
# 1. Check token is set
grep GITLAB_TOKEN /home/ubuntu/nightowl/.env

# 2. Test API manually
curl -H "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  https://gitlab.com/api/v4/projects

# 3. Check logs for errors
pm2 logs | grep -i gitlab

# 4. Verify namespace is correct
grep GITLAB_NAMESPACE /home/ubuntu/nightowl/.env
```

### Bot Not Responding to Telegram

```bash
# Check if bot is running
pm2 status nigents-bot

# Check Telegram token
grep TELEGRAM_BOT_TOKEN /home/ubuntu/nightowl/.env

# Test Telegram API
curl "https://api.telegram.org/botYOUR_TOKEN/getMe"

# View bot logs
pm2 logs nigents-bot --lines 50
```

### After Update, App is Broken

```bash
# Check error logs
pm2 logs --lines 100

# Reinstall all dependencies
rm -rf node_modules
npm install

# Rebuild all MCP servers
cd /home/ubuntu/nightowl
cd mcp-servers/arabic-rtl-auditor && npm install && npm run build && cd ../..
cd mcp-servers/task-splitter && npm install && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm install && npm run build && cd ../..

# Restart everything
pm2 restart all
```

### Out of Memory / Disk Space

```bash
# Check disk usage
df -h

# Check memory usage
free -h

# Clean npm cache
npm cache clean --force

# Clear PM2 logs
pm2 flush

# Clean Docker
docker system prune -f

# Add swap space if needed
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## Quick Fix Cheat Sheet

| Problem | Quick Fix |
|---------|-----------|
| Can't access dashboard | Check AWS Security Group + UFW firewall |
| Repos not showing | Add `GITLAB_TOKEN` to .env |
| Bot not responding | Check `TELEGRAM_BOT_TOKEN` |
| Changes not applied | Run `pm2 restart all` |
| Need to update code | `git pull origin feature/custom-mcp-servers` |
| Full restart | `pm2 restart all` |
| View errors | `pm2 logs --lines 100` |

---

**Last Updated:** 2025
**Branch:** `feature/custom-mcp-servers`
