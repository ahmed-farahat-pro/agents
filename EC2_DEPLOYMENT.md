# 🚀 EC2 Deployment Guide - Nigents on AWS

> Complete step-by-step guide to deploy Nigents AI Agent platform to AWS EC2

**Target:** Ubuntu 22.04 LTS on AWS EC2  
**Repository:** https://gitlab.com/bonyad-tech/nigents  
**Domain:** nigents.com

---

## 📋 Pre-Deployment Checklist

Before starting, ensure you have:

- [ ] AWS account with EC2 access
- [ ] GitLab account with access to `bonyad-tech/nigents`
- [ ] SSH key pair (`openclaw.pem`) downloaded
- [ ] Telegram account
- [ ] API keys for at least one AI provider

---

## Step 1: Launch EC2 Instance

### 1.1 Create Instance (AWS Console)

1. **Login to AWS Console** → **EC2** → **Launch Instance**

2. **Configure Instance:**
   ```
   Name: nigents-production
   AMI: Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   Architecture: 64-bit (x86)
   Instance Type: t3.large (2 vCPU, 8GB RAM)
   ```

3. **Key Pair:**
   - Select existing `openclaw` key pair
   - Or create new and download `.pem` file

4. **Network Settings:**
   ```
   VPC: Default VPC
   Subnet: Any availability zone
   Auto-assign public IP: Enable
   ```

5. **Security Group - Create New:**

| Type | Protocol | Port | Source | Description |
|------|----------|------|--------|-------------|
| SSH | TCP | 22 | My IP | SSH access |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Secure web traffic |
| HTTP | TCP | 80 | 0.0.0.0/0 | HTTP redirect |
| Custom TCP | TCP | 4000 | My IP | Dashboard (temporary) |

6. **Storage:**
   ```
   Size: 30 GB
   Type: gp3 (SSD)
   ```

7. Click **Launch Instance**

### 1.2 Get Instance Details

After launch:
1. Go to **EC2** → **Instances**
2. Select your instance
3. Copy **Public IPv4 address** (e.g., `3.91.48.123`)
4. Copy **Public IPv4 DNS** (e.g., `ec2-3-91-48-123.compute-1.amazonaws.com`)

---

## Step 2: Configure GitLab CI/CD Variables

**BEFORE deploying to EC2,** configure these in GitLab:

### 2.1 Access GitLab Settings

1. Go to https://gitlab.com/bonyad-tech/nigents
2. Click **Settings** → **CI/CD** (left sidebar)
3. Expand **Variables**
4. Click **Add variable** for each

### 2.2 Add Required Variables

#### Variable 1: EC2_HOST
```
Key: EC2_HOST
Value: 3.91.48.123 (your EC2 public IP)
Type: Variable
Protect: ✅ Yes
Mask: ❌ No
```

#### Variable 2: EC2_SSH_KEY (CRITICAL!)
```
Key: EC2_SSH_KEY
Value: (paste FULL content of your .pem file)
Type: File
Protect: ✅ Yes
Mask: ❌ No
```

**How to get the value:**
```bash
# On your laptop
cat ~/Downloads/openclaw.pem
# Copy EVERYTHING including:
# -----BEGIN RSA PRIVATE KEY-----
# ...
# -----END RSA PRIVATE KEY-----
```

#### Variable 3: TELEGRAM_BOT_TOKEN (Optional)
```
Key: TELEGRAM_BOT_TOKEN
Value: 123456789:ABCdefGHIjklMNOpqrSTUvwxyz
Type: Variable
Protect: ✅ Yes
Mask: ✅ Yes
```

**How to get:**
1. Open Telegram, search `@BotFather`
2. Send `/newbot`
3. Follow prompts, copy token

#### Variable 4: TELEGRAM_CHAT_ID (Optional)
```
Key: TELEGRAM_CHAT_ID
Value: 123456789
Type: Variable
Protect: ✅ Yes
Mask: ❌ No
```

**How to get:**
1. Open Telegram, search `@userinfobot`
2. Send any message, copy your ID

---

## Step 3: Connect to EC2 & Initial Setup

### 3.1 SSH to EC2

```bash
# Set correct permissions on key
chmod 400 ~/Downloads/openclaw.pem

# SSH to instance (replace with your IP)
ssh -i ~/Downloads/openclaw.pem ubuntu@3.91.48.123
```

### 3.2 Update System

```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Install essential packages
sudo apt-get install -y curl wget git nano htop
```

### 3.3 Install Node.js 20

```bash
# Install NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 3.4 Install PM2 (Process Manager)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Setup PM2 to start on boot
pm2 startup systemd

# Run the command it outputs (example):
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 3.5 Install Nginx & Certbot

```bash
# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default
```

---

## Step 4: Clone Repository & Install

### 4.1 Clone from GitLab

```bash
# Go to home directory
cd /home/ubuntu

# Clone repository
git clone https://gitlab.com/bonyad-tech/nigents.git nightowl

# Enter directory
cd nightowl

# Verify clone
ls -la
```

### 4.2 Install Dependencies

```bash
# Install main application dependencies
npm ci

# Verify installation
ls node_modules | head -10
```

### 4.3 Build MCP Servers

```bash
# Build Arabic RTL Auditor
cd mcp-servers/arabic-rtl-auditor
npm ci
npm run build
cd ../..

# Build Task Splitter
cd mcp-servers/task-splitter
npm ci
npm run build
cd ../..

# Build Smart Code Search
cd mcp-servers/smart-code-search
npm ci
npm run build
cd ../..

# Verify builds
ls mcp-servers/*/dist/
```

---

## Step 5: Environment Variables (.env)

### 5.1 Create .env File

```bash
# Create .env file
nano /home/ubuntu/nightowl/.env
```

### 5.2 Copy & Edit This Template

```bash
# =============================================================================
# REQUIRED: Telegram Bot Configuration
# =============================================================================
# Get from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyz

# Get from @userinfobot on Telegram
TELEGRAM_CHAT_ID=123456789

# =============================================================================
# REQUIRED: AI Provider API Keys (Add at least ONE)
# =============================================================================

# Option 1: Anthropic Claude (Recommended)
# Get from: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Option 2: Zhipu AI (Chinese model, cheaper)
# Get from: https://open.bigmodel.cn/
ZHIPU_API_KEY=your.zhipu.api.key.here

# Option 3: Moonshot AI
# Get from: https://platform.moonshot.cn/
MOONSHOT_API_KEY=sk-your-moonshot-key-here

# Option 4: DeepSeek
# Get from: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# =============================================================================
# REQUIRED: GitLab Integration
# =============================================================================
# Personal Access Token from GitLab
# GitLab → Profile → Access Tokens → Add new token
# Scopes needed: api, read_repository, write_repository
GITLAB_TOKEN=glpat-your_gitlab_token_here

# Your GitLab namespace (username or group)
# Examples: "bonyad-tech", "ahmed-farahat", "mycompany"
GITLAB_NAMESPACE=bonyad-tech

# GitLab URL (change if self-hosted)
GITLAB_URL=https://gitlab.com

# =============================================================================
# OPTIONAL: OpenAI (Required only for voice processing)
# =============================================================================
# Get from: https://platform.openai.com/
OPENAI_API_KEY=sk-your-openai-key-here

# =============================================================================
# Dashboard Configuration
# =============================================================================
# Port for dashboard (default: 4000)
DASHBOARD_PORT=4000

# Password to access dashboard
DASHBOARD_PASSWORD=your_secure_password_here

# Full URL (update after HTTPS setup)
DASHBOARD_URL=https://nigents.com

# =============================================================================
# Feature Flags
# =============================================================================
# Enable voice processing (requires OpenAI key)
ENABLE_VOICE=true

# Enable web dashboard
ENABLE_DASHBOARD=true

# Enable OpenHands code sandbox
ENABLE_OPENHANDS=false

# =============================================================================
# Logging & Debug
# =============================================================================
# Log level: debug, info, warn, error
LOG_LEVEL=info

# =============================================================================
# Optional: External Integrations
# =============================================================================
# Slack webhook for notifications
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Discord webhook
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 5.3 Secure .env File

```bash
# Set restrictive permissions
chmod 600 /home/ubuntu/nightowl/.env

# Verify
ls -la /home/ubuntu/nightowl/.env
# Should show: -rw------- (readable only by owner)
```

---

## Step 6: Start Application

### 6.1 Start with PM2

```bash
cd /home/ubuntu/nightowl

# Start Telegram Bot
pm2 start src/bot.js --name nigents-bot

# Start Dashboard
pm2 start src/dashboard/server.js --name nigents-dashboard

# Save PM2 configuration
pm2 save
```

### 6.2 Verify Services

```bash
# Check status
pm2 status

# Should show:
# ┌─────┬─────────────────────┬─────────┬─────────┬──────────┐
# │ id  │ name                │ status  │ cpu     │ memory   │
# ├─────┼─────────────────────┼─────────┼─────────┼──────────┤
# │ 0   │ nigents-bot         │ online  │ 0%      │ 85mb     │
# │ 1   │ nigents-dashboard   │ online  │ 0%      │ 45mb     │
# └─────┴─────────────────────┴─────────┴─────────┴──────────┘
```

### 6.3 Check Logs

```bash
# View all logs
pm2 logs

# View bot logs only
pm2 logs nigents-bot --lines 50

# View dashboard logs only
pm2 logs nigents-dashboard --lines 50

# Monitor in real-time
pm2 monit
```

### 6.4 Test Dashboard

```bash
# Test locally on EC2
curl http://localhost:4000

# Should return HTML content
```

---

## Step 7: Configure Nginx & HTTPS

### 7.1 Create Nginx Config

```bash
# Create config file
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

    # SSL certificates will be added by Certbot
    
    # Proxy to Node.js dashboard
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        
        # WebSocket support
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

### 7.2 Enable Site

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/nigents /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 7.3 Get SSL Certificate

```bash
# Obtain certificate from Let's Encrypt
sudo certbot --nginx -d nigents.com -d www.nigents.com

# Follow prompts:
# - Enter your email
# - Agree to terms (A)
# - Share email with EFF? (N)
# - Redirect HTTP to HTTPS? (Choose 2 - Redirect)
```

### 7.4 Verify HTTPS

```bash
# Test SSL
curl -I https://nigents.com

# Should show:
# HTTP/2 200
# strict-transport-security: max-age=31536000
```

---

## Step 8: Test CI/CD Pipeline

### 8.1 Trigger Pipeline

From your local machine:

```bash
# Clone if not already
git clone https://gitlab.com/bonyad-tech/nigents.git
cd nigents

# Make a small change
echo "# Deployed $(date)" >> DEPLOYMENT.md
git add DEPLOYMENT.md
git commit -m "chore: test CI/CD pipeline"

# Push to GitLab
git push origin main
```

### 8.2 Monitor Pipeline

1. Go to https://gitlab.com/bonyad-tech/nigents/-/pipelines
2. Watch pipeline progress:
   - 🧪 Test (lint + MCP builds)
   - 🔨 Build (compile MCP servers)
   - 🚀 Deploy (SSH to EC2 + restart)
3. Green checkmark = success!

### 8.3 Verify Auto-Deployment

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@3.91.48.123

# Check Git log
cd /home/ubuntu/nightowl
git log --oneline -3

# Should show your latest commit

# Check PM2 status
pm2 status
```

---

## Step 9: Configure Telegram Bot

### 9.1 Create Bot with BotFather

1. Open Telegram → Search `@BotFather`
2. Send `/newbot`
3. Name: `Nigents Bot`
4. Username: `nigents_bot` (must end in _bot)
5. **Copy the token**

### 9.2 Get Your Chat ID

1. Search `@userinfobot`
2. Send any message
3. **Copy your ID**

### 9.3 Update .env & Restart

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@3.91.48.123

# Edit .env
nano /home/ubuntu/nightowl/.env

# Update:
TELEGRAM_BOT_TOKEN=your_actual_token
TELEGRAM_CHAT_ID=your_actual_chat_id

# Restart
pm2 restart all
```

### 9.4 Test Bot

1. Open Telegram → Search your bot
2. Send `/start`
3. Should receive welcome message

---

## Step 10: Configure GitLab Integration

### 10.1 Create GitLab Personal Access Token

⚠️ **Important:** Use a **Personal Access Token** (not Project Access Token) so Nigents can access multiple repositories.

1. Go to https://gitlab.com
2. Click your **avatar** (top right) → **Edit Profile**
3. Left sidebar → **Access Tokens**
4. Click **"Add new token"**
5. Fill in:
   - **Token name:** Nigents
   - **Expiration date:** 1 year from now
   - **Scopes:** Check ALL of these:
     - [x] `api` (Full API access)
     - [x] `read_repository`
     - [x] `write_repository`
     - [x] `read_user`
6. Click **"Create personal access token"**
7. **COPY TOKEN IMMEDIATELY!** (You cannot see it again)
   - Format: `glpat-xxxxxxxxxxxxxxxxxxxx`

### 10.2 Update .env & Restart

```bash
# SSH to EC2
nano /home/ubuntu/nightowl/.env

# Update:
GITLAB_TOKEN=glpat-your_actual_token
GITLAB_NAMESPACE=bonyad-tech

# Restart
pm2 restart all
```

### 10.3 Test GitLab API

```bash
# Test token
curl --header "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  "https://gitlab.com/api/v4/user"

# Should return your user info
```

### 10.4 Configure via Dashboard

1. Open https://nigents.com
2. Go to **Settings** page
3. Enter GitLab Token and Namespace
4. Click **"Save GitLab Settings"**
5. Go to **GitLab Repos** → Click **"Refresh"**
6. Your repos should appear!

---

## ✅ Final Verification Checklist

- [ ] EC2 instance running (t3.large)
- [ ] Security groups allow 22, 80, 443
- [ ] GitLab CI/CD variables configured
- [ ] Code cloned to `/home/ubuntu/nightowl`
- [ ] Dependencies installed (`npm ci`)
- [ ] MCP servers built
- [ ] `.env` file created with all keys
- [ ] PM2 running (bot + dashboard)
- [ ] Nginx configured
- [ ] SSL certificate obtained
- [ ] Domain DNS pointing to EC2
- [ ] HTTPS working (https://nigents.com)
- [ ] Telegram bot responding
- [ ] GitLab integration working
- [ ] CI/CD pipeline successful

---

## 🚨 Troubleshooting

### Pipeline Fails at SSH Step

```bash
# Test SSH manually
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# If works, check GitLab variable:
# EC2_SSH_KEY should be FULL .pem content
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
# Rebuild all MCPs
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

---

## 📞 Support

**Issues?** Check:
1. [OPERATIONS.md](OPERATIONS.md) - Daily operations guide
2. [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
3. GitLab Issues: https://gitlab.com/bonyad-tech/nigents/-/issues

---

**🎉 Deployment Complete!** Your AI agent team is ready at https://nigents.com
