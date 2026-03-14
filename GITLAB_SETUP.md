# GitLab Setup & CI/CD Pipeline Guide

> Complete guide to host Nigents on GitLab with auto-deployment to EC2

---

## Table of Contents

1. [Create GitLab Repository](#create-gitlab-repository)
2. [Push Code to GitLab](#push-code-to-gitlab)
3. [Configure CI/CD Variables](#configure-cicd-variables)
4. [Setup EC2 for Deployment](#setup-ec2-for-deployment)
5. [Test the Pipeline](#test-the-pipeline)
6. [Rollback if Needed](#rollback-if-needed)

---

## Create GitLab Repository

### Step 1: Create New Project on GitLab

1. Go to **GitLab.com** → Click **"New Project"**
2. Select **"Create blank project"**
3. Fill in:
   - **Project name:** `nigents`
   - **Project slug:** `nigents`
   - **Visibility:** Private (recommended)
   - **Initialize with README:** Unchecked (we have our own)
4. Click **"Create project"**

### Step 2: Get Repository URL

After creation, copy the repository URL:
```
https://gitlab.com/YOUR_USERNAME/nigents.git
```

Or SSH version:
```
git@gitlab.com:YOUR_USERNAME/nigents.git
```

---

## Push Code to GitLab

### Step 1: Add GitLab Remote

From your local machine or EC2:

```bash
# Navigate to your project
cd /path/to/nightowl

# Check current remotes
git remote -v

# Add GitLab remote (keep GitHub as backup)
git remote add gitlab https://gitlab.com/YOUR_USERNAME/nigents.git

# Or use SSH (recommended):
git remote add gitlab git@gitlab.com:YOUR_USERNAME/nigents.git
```

### Step 2: Push to GitLab

```bash
# Push your feature branch
git push -u gitlab feature/custom-mcp-servers

# Or push main branch when ready
git checkout main
git push -u gitlab main
```

### Step 3: Verify Push

1. Go to GitLab → Your Project
2. Check that files are visible
3. Verify `.gitlab-ci.yml` is in root directory

---

## Configure CI/CD Variables

### Step 1: Access CI/CD Settings

1. In GitLab, go to **Settings** → **CI/CD**
2. Expand **Variables** section
3. Click **"Add variable"** for each below

### Step 2: Add Required Variables

| Variable | Type | Value | Description |
|----------|------|-------|-------------|
| `EC2_HOST` | Variable | `3.91.48.123` | Your EC2 public IP |
| `EC2_SSH_KEY` | File | (upload `openclaw.pem`) | SSH private key |
| `TELEGRAM_BOT_TOKEN` | Variable | `123456:ABC-DEF...` | From @BotFather |
| `TELEGRAM_CHAT_ID` | Variable | `123456789` | Your Telegram ID |

### Step 3: Variable Details

**EC2_HOST:**
- Go to AWS Console → EC2 → Instances
- Copy "Public IPv4 address"

**EC2_SSH_KEY:**
```bash
# On your laptop, copy the content of your PEM file
cat ~/Downloads/openclaw.pem

# In GitLab:
# - Variable type: File
# - Key: EC2_SSH_KEY
# - Value: (paste entire PEM file content)
```

**TELEGRAM_BOT_TOKEN:**
- Message @BotFather on Telegram
- Create new bot or use existing
- Copy the token (starts with numbers, then colon)

**TELEGRAM_CHAT_ID:**
- Message @userinfobot on Telegram
- Copy the ID number

### Step 4: Protect Variables (Important!)

For each variable:
1. Check **"Protect variable"** - only available on protected branches
2. Check **"Mask variable"** - hides value in logs
3. Leave **"Expand variable reference"** unchecked

---

## Setup EC2 for Deployment

### Step 1: Create Deployment User (Recommended)

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Create deploy user (optional but recommended)
sudo adduser deploy
sudo usermod -aG sudo deploy

# Or use existing ubuntu user
# Ensure ubuntu user can run commands without password
```

### Step 2: Prepare Deployment Directory

```bash
# Create directory for the app
sudo mkdir -p /home/ubuntu/nightowl
sudo chown ubuntu:ubuntu /home/ubuntu/nightowl

# Or if using deploy user:
sudo mkdir -p /home/ubuntu/nightowl
sudo chown deploy:deploy /home/ubuntu/nightowl
```

### Step 3: Setup Git

```bash
# Configure git for the user
sudo -u ubuntu git config --global user.email "deploy@nigents.com"
sudo -u ubuntu git config --global user.name "Nigents Deploy"

# Add GitLab to known hosts
sudo -u ubuntu mkdir -p /home/ubuntu/.ssh
ssh-keyscan -H gitlab.com >> /home/ubuntu/.ssh/known_hosts
sudo chown -R ubuntu:ubuntu /home/ubuntu/.ssh
```

### Step 4: Initial Clone

```bash
# Clone repository initially
sudo -u ubuntu bash -c 'cd /home/ubuntu && git clone https://gitlab.com/YOUR_USERNAME/nigents.git nightowl'

# Or if using deploy key:
# sudo -u ubuntu bash -c 'cd /home/ubuntu && git clone git@gitlab.com:YOUR_USERNAME/nigents.git nightowl'
```

### Step 5: Setup PM2 for GitLab User

```bash
# Ensure PM2 is installed globally
sudo npm install -g pm2

# Setup PM2 to start on boot (as ubuntu user)
sudo -u ubuntu bash -c 'pm2 startup systemd'

# Run the command it outputs (example):
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### Step 6: Create .env File

```bash
# Create .env file
sudo -u ubuntu nano /home/ubuntu/nightowl/.env

# Add all your environment variables (see main README)
# Save: Ctrl+X, Y, Enter

# Secure the file
sudo chmod 600 /home/ubuntu/nightowl/.env
sudo chown ubuntu:ubuntu /home/ubuntu/nightowl/.env
```

---

## Test the Pipeline

### Step 1: Trigger Pipeline

Make a small change and push:

```bash
# Make a change
echo "# Test" >> README.md
git add README.md
git commit -m "test: trigger CI/CD pipeline"

# Push to GitLab
git push gitlab main
```

### Step 2: Monitor Pipeline

1. Go to GitLab → Your Project → **CI/CD** → **Pipelines**
2. You should see a pipeline running with stages:
   - 🧪 Test (lint, test-mcp-builds)
   - 🔨 Build (build-mcps)
   - 🚀 Deploy (deploy-to-ec2)
3. Click on the pipeline to see detailed logs

### Step 3: Check Deployment

```bash
# SSH to EC2 and check
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Check PM2 status
pm2 status

# Check logs
pm2 logs --lines 20

# Check Git log
cd /home/ubuntu/nightowl
git log --oneline -3
```

### Step 4: Verify Website

- Visit `https://nigents.com`
- Should show latest changes

---

## Pipeline Stages Explained

```
┌─────────────────────────────────────────────────────────┐
│                    PUSH TO GITLAB                        │
│                      (main branch)                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 1: TEST                                          │
│  ├─ lint: Check code quality                            │
│  └─ test-mcp-builds: Verify MCP servers compile         │
└────────────────────┬────────────────────────────────────┘
                     │ (only if tests pass)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 2: BUILD                                         │
│  └─ build-mcps: Compile all MCP servers                 │
└────────────────────┬────────────────────────────────────┘
                     │ (only if build succeeds)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  STAGE 3: DEPLOY                                        │
│  ├─ deploy-to-ec2: SSH to server and update             │
│  └─ notify-telegram: Send success message               │
└─────────────────────────────────────────────────────────┘
```

---

## Rollback if Needed

### Option 1: GitLab Pipeline Rollback

1. Go to GitLab → CI/CD → Pipelines
2. Find a previous successful pipeline
3. Click the **"Rollback"** button (manual job)

### Option 2: Manual Rollback on EC2

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Navigate to project
cd /home/ubuntu/nightowl

# Rollback to previous commit
git log --oneline -5
git reset --hard HEAD~1

# Rebuild and restart
npm ci
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..
pm2 restart all
```

---

## Troubleshooting Pipeline

### Issue: Pipeline Fails at SSH Step

```bash
# Test SSH manually from your laptop
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# If that works, check GitLab variable:
# EC2_SSH_KEY should be the ENTIRE content of .pem file
# Including -----BEGIN... and -----END... lines
```

### Issue: Permission Denied

```bash
# On EC2, fix permissions
sudo chown -R ubuntu:ubuntu /home/ubuntu/nightowl
sudo chmod 700 /home/ubuntu/.ssh
sudo chmod 600 /home/ubuntu/.ssh/authorized_keys
```

### Issue: Pipeline Stuck

1. Go to GitLab → CI/CD → Pipelines
2. Click the stuck pipeline
3. Click **"Cancel pipeline"**
4. Push a new commit to retry

### Issue: Changes Not Reflecting

```bash
# Check if code was pulled
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/nightowl
git log --oneline -3

# Force restart
pm2 restart all --update-env
```

---

## Pipeline Variables Quick Reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `EC2_HOST` | ✅ | EC2 public IP |
| `EC2_SSH_KEY` | ✅ | SSH private key content |
| `TELEGRAM_BOT_TOKEN` | ❌ | For deployment notifications |
| `TELEGRAM_CHAT_ID` | ❌ | For deployment notifications |

---

## Next Steps After Setup

1. **Test the pipeline** - Make a small change and push
2. **Monitor first deployment** - Watch pipeline logs
3. **Verify auto-deploy** - Check EC2 after push
4. **Setup branch protection** - Protect main branch

---

**Your CI/CD is now ready!** Every push to `main` will automatically deploy to your EC2 server.
