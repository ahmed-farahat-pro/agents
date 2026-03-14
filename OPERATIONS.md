# Nigents Operations Guide

> Daily operations, updates, and troubleshooting on EC2

---

## Table of Contents

1. [CI/CD Pipeline (Auto-Deploy)](#cicd-pipeline-auto-deploy)
2. [Quick Reference](#quick-reference)
2. [HTTPS Setup with Namecheap Domain](#https-setup-with-namecheap-domain)
3. [Edit Environment Variables](#edit-environment-variables)
4. [Pull Updates & Restart](#pull-updates--restart)
5. [Restart Individual Components](#restart-individual-components)
6. [GitLab Connection Fix](#gitlab-connection-fix)
7. [Common Commands](#common-commands)
8. [Troubleshooting](#troubleshooting)

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

# RESTART EVERYTHING
pm2 restart all

# CHECK LOGS
pm2 logs --lines 50

# HTTPS SETUP (see full guide below)
sudo certbot --nginx -d nigents.com -d www.nigents.com
```

---

## HTTPS Setup with Namecheap Domain

### Step 1: Point Domain to EC2 in Namecheap

1. Log in to **Namecheap.com**
2. Go to **Domain List** → Find `nigents.com` → Click **Manage**
3. Click **Advanced DNS** tab
4. Delete any existing A records
5. Add new **A Records**:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | @ | YOUR_EC2_IP | Automatic |
| A Record | www | YOUR_EC2_IP | Automatic |
| A Record | dashboard | YOUR_EC2_IP | Automatic |

**Example:**
```
A Record @ 3.91.48.123 Automatic
A Record www 3.91.48.123 Automatic
```

6. Click **Save All Changes**
7. Wait 10-30 minutes for DNS to propagate

**Test DNS:**
```bash
# From your laptop
nslookup nigents.com
# Should show your EC2 IP
```

---

### Step 2: Install Nginx & Certbot (On EC2)

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Update system
sudo apt-get update

# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx

# Remove default Nginx site
sudo rm /etc/nginx/sites-enabled/default

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

### Step 3: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/nigents
```

Paste this configuration:

```nginx
# HTTP - Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name nigents.com www.nigents.com dashboard.nigents.com;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS - Main Dashboard
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nigents.com www.nigents.com;

    # SSL will be configured by Certbot
    
    # Proxy to Node.js dashboard
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        
        # WebSocket support for real-time updates
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/nigents /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 4: Get Free SSL Certificate

```bash
sudo certbot --nginx -d nigents.com -d www.nigents.com

# Follow the prompts:
# - Enter your email address
# - Agree to terms of service (A)
# - Share email with EFF? (Y or N)
# - Redirect HTTP to HTTPS? (Choose 2 - Redirect)
```

**Success message:**
```
Congratulations! You have successfully enabled
https://nigents.com and https://www.nigents.com
```

---

### Step 5: Update AWS Security Group

**AWS Console → EC2 → Security Groups → Your Instance's Security Group → Edit Inbound Rules:**

Remove or modify:
- Delete port 4000 rule (or restrict to My IP only)

Add:
| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | My IP | SSH access |
| HTTPS | TCP | 443 | Anywhere | Secure dashboard |
| HTTP | TCP | 80 | Anywhere | HTTP redirect |

---

### Step 6: Update .env with Domain

```bash
nano /home/ubuntu/nightowl/.env

# Add or update:
DASHBOARD_URL=https://nigents.com
DASHBOARD_PORT=4000
DOMAIN=nigents.com

# Save and restart
pm2 restart all
```

---

### Step 7: Test HTTPS

```bash
# Test SSL certificate
curl -I https://nigents.com

# Should show:
# HTTP/2 200
# strict-transport-security: max-age=31536000
```

Open in browser:
```
https://nigents.com
```

✅ Should show green lock icon!

---

### Step 8: Auto-Renewal (Already Set Up)

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Check renewal timer
sudo systemctl status certbot.timer

# Certificates auto-renew every 90 days
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
DASHBOARD_URL=https://nigents.com

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

## Restart Individual Components

### Restart Everything

```bash
pm2 restart all
```

### Restart Only Frontend (Dashboard)

```bash
pm2 restart nigents-dashboard

# Or stop and start:
pm2 stop nigents-dashboard
pm2 start src/dashboard/server.js --name nigents-dashboard
```

### Restart Only Backend (Bot)

```bash
pm2 restart nigents-bot

# Or stop and start:
pm2 stop nigents-bot
pm2 start src/bot.js --name nigents-bot
```

### Restart Only MCP Servers

MCP servers run as child processes, so they restart with the main app. But to fully rebuild them:

```bash
cd /home/ubuntu/nightowl

# Rebuild all MCPs
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..

# Then restart main app
pm2 restart all
```

### Restart Individual MCP Server

```bash
# Find MCP process
ps aux | grep arabic-rtl-auditor

# Kill it (it will auto-restart with next task)
kill <PID>

# Or rebuild specifically:
cd mcp-servers/arabic-rtl-auditor
npm run build
cd /home/ubuntu/nightowl
```

### Restart Nginx (Web Server)

```bash
# Test config first
sudo nginx -t

# Reload (no downtime)
sudo systemctl reload nginx

# Or hard restart
sudo systemctl restart nginx

# Check status
sudo systemctl status nginx
```

### Restart OpenHands (Code Sandbox)

```bash
# If using systemd
sudo systemctl restart openhands

# Or manually
docker stop $(docker ps -q --filter ancestor=ghcr.io/opendevin/opendevin)
docker run -d -p 3000:3000 -v /home/ubuntu/workspace:/workspace ghcr.io/opendevin/opendevin
```

### Full System Restart Sequence

```bash
# 1. Nginx (web server)
sudo systemctl reload nginx

# 2. Main application (includes MCPs)
pm2 restart all

# 3. OpenHands (if using)
sudo systemctl restart openhands

# 4. Verify all running
pm2 status
sudo systemctl status nginx
sudo systemctl status openhands
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
1. Open: `https://nigents.com`
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

### HTTPS Not Working

```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew

# Check Nginx config
sudo nginx -t

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log

# Test SSL
openssl s_client -connect nigents.com:443
```

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
# AWS Console → EC2 → Security Groups → Must have port 443 open
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
| HTTPS not working | Run `sudo certbot --nginx -d nigents.com` |
| Repos not showing | Add `GITLAB_TOKEN` to .env |
| Bot not responding | Check `TELEGRAM_BOT_TOKEN` |
| Changes not applied | Run `pm2 restart all` |
| Need to update code | `git pull origin feature/custom-mcp-servers` |
| Restart frontend only | `pm2 restart nigents-dashboard` |
| Restart backend only | `pm2 restart nigents-bot` |
| Restart MCP servers | Rebuild them, then `pm2 restart all` |
| View errors | `pm2 logs --lines 100` |

---

**Last Updated:** 2025
**Branch:** `feature/custom-mcp-servers`
**Domain:** nigents.com

---

## CI/CD Pipeline (Auto-Deploy)

Nigents uses GitLab CI/CD for automatic deployment to EC2. Every push to `main` triggers the pipeline.

### Pipeline Stages

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    TEST     │ →  │    BUILD    │ →  │   DEPLOY    │
│             │    │             │    │             │
│ • Lint code │    │ • Build MCP │    │ • SSH to EC2│
│ • Test MCP  │    │   servers   │    │ • Git pull  │
│   builds    │    │             │    │ • npm ci    │
│             │    │             │    │ • pm2 reload│
└─────────────┘    └─────────────┘    └─────────────┘
```

### Trigger Deployment

Simply push to GitLab:

```bash
# Push to main triggers deployment
git push gitlab main

# Or merge a feature branch to main
git checkout main
git merge feature/my-feature
git push gitlab main
```

### Monitor Pipeline

1. Go to **GitLab** → Your Project → **CI/CD** → **Pipelines**
2. Watch pipeline progress
3. Green checkmark = deployed successfully
4. Red X = check logs for errors

### Setup CI/CD (First Time)

See [GITLAB_SETUP.md](GITLAB_SETUP.md) for complete setup instructions.

### Required CI/CD Variables

Configure these in GitLab → Settings → CI/CD → Variables:

| Variable | Type | Description |
|----------|------|-------------|
| `EC2_HOST` | Variable | EC2 public IP (e.g., 3.91.48.123) |
| `EC2_SSH_KEY` | File | SSH private key (content of .pem file) |
| `TELEGRAM_BOT_TOKEN` | Variable | (Optional) For deployment notifications |
| `TELEGRAM_CHAT_ID` | Variable | (Optional) Telegram chat ID |

### Manual Deployment (If CI/CD Fails)

If automatic deployment fails, deploy manually:

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Navigate and update
cd /home/ubuntu/nightowl
git pull origin main
npm ci --production

# Rebuild MCP servers
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..

# Restart services
pm2 restart all

# Verify
pm2 status
```

### Rollback Deployment

If a deployment breaks something:

**Via GitLab (Recommended):**
1. Go to GitLab → CI/CD → Pipelines
2. Find previous successful pipeline
3. Click "Rollback" job (manual trigger)

**Manual Rollback:**
```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/nightowl
git reset --hard HEAD~1
npm ci --production
pm2 restart all
```

---
