# 🚀 Nigents Complete Deployment Guide

> Step-by-step guide to deploy Nigents AI Agent platform to AWS EC2 with GitLab CI/CD

**Repository:** https://gitlab.com/bonyad-tech/nigents  
**Domain:** nigents.com  
**Stack:** Node.js 20, Express, Socket.io, PM2, Nginx, Let's Encrypt

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Configure GitLab CI/CD](#step-1-configure-gitlab-cicd)
3. [Step 2: Setup AWS EC2](#step-2-setup-aws-ec2)
4. [Step 3: Configure Environment Variables](#step-3-configure-environment-variables)
5. [Step 4: First Deployment](#step-4-first-deployment)
6. [Step 5: Setup HTTPS with Nginx](#step-5-setup-https-with-nginx)
7. [Step 6: Configure Telegram Bot](#step-6-configure-telegram-bot)
8. [Step 7: Configure GitLab Integration](#step-7-configure-gitlab-integration)
9. [Troubleshooting](#troubleshooting)
10. [Useful Commands](#useful-commands)

---

## Prerequisites

Before starting, ensure you have:

- [ ] AWS Account with EC2 access
- [ ] GitLab account with access to `bonyad-tech/nigents`
- [ ] Domain name (nigents.com) managed in Namecheap
- [ ] SSH key pair (openclaw.pem) downloaded
- [ ] Telegram account (for bot notifications)

---

## Step 1: Configure GitLab CI/CD

### 1.1 Access CI/CD Settings

1. Go to https://gitlab.com/bonyad-tech/nigents
2. Click **Settings** → **CI/CD** (in left sidebar)
3. Expand **Variables** section
4. Click **"Add variable"** for each variable below

### 1.2 Add CI/CD Variables

| Variable | Type | Value | Protected | Masked |
|----------|------|-------|-----------|--------|
| `EC2_HOST` | Variable | `3.91.48.123` | ✅ | ❌ |
| `EC2_SSH_KEY` | File | (see below) | ✅ | ❌ |
| `TELEGRAM_BOT_TOKEN` | Variable | (from @BotFather) | ✅ | ✅ |
| `TELEGRAM_CHAT_ID` | Variable | (your chat ID) | ✅ | ❌ |

#### How to set EC2_SSH_KEY:

1. Open your `openclaw.pem` file in a text editor
2. Copy the ENTIRE content including:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   ...
   -----END RSA PRIVATE KEY-----
   ```
3. In GitLab, set:
   - **Type:** File
   - **Key:** `EC2_SSH_KEY`
   - **Value:** Paste the entire PEM content
   - **Protect variable:** ✅ Checked
   - **Mask variable:** ❌ Unchecked

#### How to get TELEGRAM_BOT_TOKEN:

1. Open Telegram, search for `@BotFather`
2. Send `/newbot` command
3. Follow prompts to create bot named "nigents-bot"
4. Copy the token (looks like: `123456789:ABCdefGHIjklMNOpqrSTUvwxyz`)

#### How to get TELEGRAM_CHAT_ID:

1. Open Telegram, search for `@userinfobot`
2. Send any message, it will reply with your ID
3. Copy the numeric ID (looks like: `123456789`)

### 1.3 Enable CI/CD

1. In GitLab, go to **Settings** → **General** → **Visibility**
2. Ensure **Pipelines** is visible
3. Go to **CI/CD** → **General pipelines**
4. Ensure **Default Git strategy** is set to `fetch`
5. **Save changes**

---

## Step 2: Setup AWS EC2

### 2.1 Launch EC2 Instance

1. **AWS Console** → **EC2** → **Launch Instance**
2. **Name:** `nigents-prod`
3. **AMI:** Ubuntu Server 22.04 LTS
4. **Instance Type:** t3.large (2 vCPU, 8GB RAM)
5. **Key Pair:** Select or create `openclaw`
6. **Network Settings:**
   - VPC: Default
   - Auto-assign public IP: Enable
   - Firewall: Create security group
7. **Security Group Rules:**

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | My IP | SSH access |
| HTTPS | TCP | 443 | Anywhere | Secure web |
| HTTP | TCP | 80 | Anywhere | HTTP redirect |
| Custom TCP | TCP | 4000 | My IP | Dashboard (temp) |

8. **Storage:** 20GB gp3
9. Click **Launch Instance**

### 2.2 Connect to EC2

```bash
# From your laptop
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Update system
sudo apt-get update && sudo apt-get upgrade -y
```

### 2.3 Install Node.js 20

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### 2.4 Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Setup PM2 startup script
pm2 startup systemd

# Run the command it outputs (example):
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 2.5 Install Nginx

```bash
# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2.6 Install Git and Clone Repository

```bash
# Install git
sudo apt-get install -y git

# Configure git
git config --global user.email "deploy@nigents.com"
git config --global user.name "Nigents Deploy"

# Create app directory
sudo mkdir -p /home/ubuntu/nightowl
sudo chown ubuntu:ubuntu /home/ubuntu/nightowl

# Clone repository
cd /home/ubuntu
git clone https://gitlab.com/bonyad-tech/nigents.git nightowl

# Enter directory
cd nightowl
```

### 2.7 Install Dependencies

```bash
cd /home/ubuntu/nightowl

# Install main dependencies
npm ci

# Install and build MCP servers
cd mcp-servers/arabic-rtl-auditor && npm ci && npm run build && cd ../..
cd mcp-servers/task-splitter && npm ci && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm ci && npm run build && cd ../..
```

---

## Step 3: Configure Environment Variables

### 3.1 Create .env File

```bash
# Create .env file
nano /home/ubuntu/nightowl/.env
```

### 3.2 Add Environment Variables

Paste this content (replace with your actual values):

```env
# =============================================================================
# REQUIRED - Telegram Bot (from @BotFather)
# =============================================================================
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyz
TELEGRAM_CHAT_ID=123456789

# =============================================================================
# REQUIRED - AI Provider API Keys (pick at least one)
# =============================================================================
# Option 1: Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Option 2: Zhipu AI (Chinese model)
ZHIPU_API_KEY=your.zhipu.api.key.here

# Option 3: Moonshot AI
MOONSHOT_API_KEY=sk-your-moonshot-key-here

# Option 4: DeepSeek
DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# =============================================================================
# REQUIRED - GitLab Integration
# =============================================================================
# GitLab Personal Access Token (from GitLab profile settings)
GITLAB_TOKEN=glpat-your_gitlab_token_here

# Your GitLab namespace (username or group)
GITLAB_NAMESPACE=bonyad-tech

# GitLab URL
GITLAB_URL=https://gitlab.com

# =============================================================================
# OPTIONAL - OpenAI (for voice processing)
# =============================================================================
OPENAI_API_KEY=sk-your-openai-key-here

# =============================================================================
# Dashboard Configuration
# =============================================================================
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=your_secure_password_here
DASHBOARD_URL=https://nigents.com

# =============================================================================
# Feature Flags
# =============================================================================
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=false

# =============================================================================
# Logging
# =============================================================================
LOG_LEVEL=info
```

### 3.3 Secure the .env File

```bash
chmod 600 /home/ubuntu/nightowl/.env
```

---

## Step 4: First Deployment

### 4.1 Start the Application

```bash
cd /home/ubuntu/nightowl

# Start the bot
pm2 start src/bot.js --name nigents-bot

# Start the dashboard
pm2 start src/dashboard/server.js --name nigents-dashboard

# Save PM2 config
pm2 save

# Check status
pm2 status
```

### 4.2 Test Locally

```bash
# Test bot logs
pm2 logs nigents-bot --lines 20

# Test dashboard logs
pm2 logs nigents-dashboard --lines 20

# Test dashboard is running
curl http://localhost:4000
```

### 4.3 Trigger CI/CD Pipeline

From your laptop:

```bash
# Make a small change to trigger deployment
cd /path/to/nightowl
echo "# Deployed $(date)" >> DEPLOYMENT.md
git add DEPLOYMENT.md
git commit -m "chore: trigger deployment"
git push gitlab main
```

### 4.4 Monitor Pipeline

1. Go to https://gitlab.com/bonyad-tech/nigents/-/pipelines
2. Watch the pipeline progress through stages:
   - 🧪 Test
   - 🔨 Build
   - 🚀 Deploy
3. Green checkmark = success!

---

## Step 5: Setup HTTPS with Nginx

### 5.1 Configure Nginx

```bash
# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Create Nginx config
sudo nano /etc/nginx/sites-available/nigents
```

Paste this configuration:

```nginx
# HTTP - Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name nigents.com www.nigents.com;
    
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

### 5.2 Enable Site

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/nigents /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 5.3 Get SSL Certificate

```bash
# Obtain certificate from Let's Encrypt
sudo certbot --nginx -d nigents.com -d www.nigents.com

# Follow prompts:
# - Enter email address
# - Agree to terms (A)
# - Share email with EFF? (N)
# - Redirect HTTP to HTTPS? (Choose 2 - Redirect)
```

### 5.4 Test HTTPS

```bash
# Test SSL
curl -I https://nigents.com

# Should show HTTP/2 200
```

### 5.5 Auto-Renewal

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Check timer
sudo systemctl status certbot.timer
```

---

## Step 6: Configure Telegram Bot

### 6.1 Create Bot with BotFather

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Name it: `Nigents Bot`
4. Username: `nigents_bot` (must end in _bot)
5. Copy the token

### 6.2 Get Your Chat ID

1. Search for `@userinfobot`
2. Send any message
3. Note your ID

### 6.3 Update .env

```bash
nano /home/ubuntu/nightowl/.env

# Update these values:
TELEGRAM_BOT_TOKEN=your_actual_token
TELEGRAM_CHAT_ID=your_actual_chat_id
```

### 6.4 Restart Services

```bash
pm2 restart all
```

### 6.5 Test Bot

1. Open Telegram, search for your bot
2. Send `/start`
3. You should receive a welcome message

---

## Step 7: Configure GitLab Integration

### 7.1 Create GitLab Personal Access Token

1. Go to https://gitlab.com
2. Click your **avatar** → **Edit Profile**
3. Left sidebar → **Access Tokens**
4. Click **"Add new token"**
5. Fill in:
   - **Token name:** `Nigents`
   - **Expiration:** 1 year from now
   - **Scopes:** Check all:
     - [x] `api`
     - [x] `read_repository`
     - [x] `write_repository`
     - [x] `read_user`
6. Click **"Create personal access token"**
7. **COPY TOKEN IMMEDIATELY!** (you can't see it again)

### 7.2 Update .env

```bash
nano /home/ubuntu/nightowl/.env

# Update:
GITLAB_TOKEN=glpat-your_token_here
GITLAB_NAMESPACE=bonyad-tech
```

### 7.3 Restart and Test

```bash
pm2 restart all

# Test API access
curl --header "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  "https://gitlab.com/api/v4/user"
```

### 7.4 Configure Projects

Via Dashboard:
1. Open https://nigents.com
2. Go to **Settings** page
3. Enter GitLab Token and Namespace
4. Click **"Save GitLab Settings"**
5. Go to **GitLab Repos** in sidebar
6. Click **"Refresh"** to fetch repos

---

## Troubleshooting

### Pipeline Fails at SSH Step

```bash
# Test SSH manually
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# If works, check GitLab variable EC2_SSH_KEY includes full PEM content
```

### App Not Starting

```bash
# Check logs
pm2 logs --lines 100

# Common fixes
cd /home/ubuntu/nightowl
npm ci
pm2 restart all
```

### MCP Servers Not Working

```bash
# Rebuild MCPs
cd /home/ubuntu/nightowl
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..
pm2 restart all
```

### HTTPS Not Working

```bash
# Check certificate
sudo certbot certificates

# Renew
sudo certbot renew

# Check Nginx
sudo nginx -t
sudo systemctl status nginx
```

### GitLab Repos Not Showing

```bash
# Test token
grep GITLAB_TOKEN /home/ubuntu/nightowl/.env
curl -H "PRIVATE-TOKEN: glpat-YOUR_TOKEN" https://gitlab.com/api/v4/projects

# Check logs
pm2 logs | grep -i gitlab
```

---

## Useful Commands

### Daily Operations

```bash
# Check status
pm2 status

# View logs
pm2 logs
pm2 logs nigents-bot
pm2 logs nigents-dashboard

# Restart
pm2 restart all
pm2 restart nigents-bot
pm2 restart nigents-dashboard

# Monitor in real-time
pm2 monit
```

### Update Application

```bash
# Automatic (via CI/CD)
git push gitlab main

# Manual
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/nightowl
git pull origin main
npm ci
pm2 restart all
```

### Edit Environment Variables

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
nano /home/ubuntu/nightowl/.env
pm2 restart all
```

---

## Summary Checklist

- [ ] GitLab CI/CD variables configured (EC2_HOST, EC2_SSH_KEY)
- [ ] AWS EC2 instance running (t3.large, Ubuntu 22.04)
- [ ] Security groups allow 22, 80, 443
- [ ] Node.js 20 installed
- [ ] PM2 installed and configured
- [ ] Nginx installed
- [ ] Code cloned from GitLab
- [ ] Dependencies installed
- [ ] MCP servers built
- [ ] .env file created with all variables
- [ ] Application started with PM2
- [ ] Nginx configured
- [ ] SSL certificate obtained
- [ ] Domain DNS pointing to EC2
- [ ] HTTPS working
- [ ] Telegram bot responding
- [ ] GitLab integration working
- [ ] CI/CD pipeline successful

---

**🎉 You're all set! Every push to main will now auto-deploy to https://nigents.com**
