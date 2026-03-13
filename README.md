# 🌙 Nigents — Night Agents for GitLab

> **Send a task on Telegram before you sleep. Wake up to a finished Merge Request.**

Your personal AI development company running on AWS EC2. 7 specialized agents collaborate overnight to plan, code, test, review, and ship features to **GitLab** — while you sleep.

---

## Table of Contents

1. [What is Nigents?](#what-is-nigents)
2. [The 7-Agent Team](#the-7-agent-team)
3. [App Flow & Workflow](#app-flow--workflow)
4. [MCP Servers](#mcp-servers)
5. [Custom MCP Servers We Built](#custom-mcp-servers-we-built)
6. [Telegram Integration](#telegram-integration)
7. [Dashboard Features](#dashboard-features)
8. [Tech Stack](#tech-stack)
9. [Quick Start (Local)](#quick-start-local)
10. [Deploy on AWS EC2](#deploy-on-aws-ec2)
11. [Configuration](#configuration)
12. [Troubleshooting](#troubleshooting)

---

## What is Nigents?

Nigents (Night Agents) is a self-hosted AI agent team that runs 24/7 on your AWS EC2 server. It integrates with **GitLab only** and deploys code automatically through Merge Requests.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| 🤖 **7 AI Agents** | Specialized agents: Orchestrator, Planner, Backend Dev, Frontend Dev, QA Tester, Code Reviewer, Reporter |
| 🎙️ **Voice Commands** | Send voice notes in Arabic or English via Telegram |
| 🛠️ **38 MCP Tools** | 35 standard + 3 custom MCP servers for extended capabilities |
| 📊 **Live Dashboard** | Real-time code streaming and agent activity at `http://EC2_IP:4000` |
| 🌙 **24/7 Operation** | Runs on EC2 with PM2 process manager, never sleeps |
| 🔀 **GitLab Integration** | Automatic MR creation with proper branching |
| 🐳 **Code Sandbox** | OpenHands Docker container for safe code execution |

### How It Works (High Level)

```
You (Telegram/Phone)          EC2 Server (AWS)                GitLab
       │                              │                           │
       │  1. Send voice/text task     │                           │
       │─────────────────────────────>│                           │
       │                              │                           │
       │                              │ 2. Orchestrator analyzes  │
       │                              │    and delegates to agents│
       │                              │                           │
       │                              │ 3. Agents collaborate via │
       │                              │    AutoGen group chat     │
       │                              │                           │
       │                              │ 4. Write code using MCPs  │
       │                              │                           │
       │                              │ 5. Test & review code     │
       │                              │                           │
       │                              │ 6. Push to feature branch │
       │                              │──────────────────────────>│
       │                              │                           │
       │                              │ 7. Create Merge Request   │
       │                              │──────────────────────────>│
       │                              │                           │
       │  8. "MR Ready!" notification │                           │
       │<─────────────────────────────│                           │
       │                              │                           │
    [Next Morning]                [Done!]                    [Review MR]
```

---

## The 7-Agent Team

| Agent | Role | Primary Model | Key Responsibilities |
|-------|------|---------------|---------------------|
| **Orchestrator** | Team Lead & Router | Claude Sonnet | Receives tasks, coordinates all agents, manages workflow |
| **Planner** | Architecture & Planning | Claude Sonnet | Analyzes codebase, creates implementation plans |
| **Backend Dev** | Backend Developer | Claude Sonnet | Writes Spring Boot/Node.js/Python, manages infrastructure |
| **Frontend Dev** | Frontend Developer | Claude Haiku | React/React Native, RTL support, UI/UX |
| **QA Tester** | Quality Assurance | Claude Haiku | Writes tests, runs suites, validates functionality |
| **Code Reviewer** | Code Reviewer | Claude Sonnet | Security audit, quality checks, RTL compliance |
| **Reporter** | Reporter & Communicator | Claude Haiku | Telegram updates, daily reports, cost tracking |

### Agent Communication Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    AUTOGEN GROUP CHAT                        │
│                                                              │
│  User: /plan "Add payment gateway"                          │
│        ↓                                                     │
│  Orchestrator: Delegating to Planner...                     │
│        ↓                                                     │
│  Planner: @Orchestrator Plan ready. Complexity: Medium     │
│           Files: PaymentController.java, OrderService.java  │
│        ↓                                                     │
│  Orchestrator: @BackendDev Please implement this plan      │
│        ↓                                                     │
│  BackendDev: Implementation complete. Committed to branch  │
│        ↓                                                     │
│  Orchestrator: @QATester Please test these changes         │
│        ↓                                                     │
│  QATester: 12/12 tests passed                              │
│        ↓                                                     │
│  Orchestrator: @CodeReviewer Please review for security    │
│        ↓                                                     │
│  CodeReviewer: Approved - no issues                        │
│        ↓                                                     │
│  Orchestrator: Creating MR... Done!                        │
└──────────────────────────────────────────────────────────────┘
```

---

## App Flow & Workflow

### Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTIONS                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Voice Note   │  │ Text Command │  │ Dashboard (Browser)      │  │
│  │ (Arabic/En)  │  │ /plan /start │  │ http://localhost:4000    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│         └─────────────────┼────────────────────────┘                │
│                           ▼                                         │
│              ┌────────────────────────┐                             │
│              │   TELEGRAM BOT         │                             │
│              │   (Node.js + Socket.io)│                             │
│              └──────────┬─────────────┘                             │
└─────────────────────────┼───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR AGENT                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Responsibilities:                                          │   │
│  │  • Parse user intent (Arabic/English)                       │   │
│  │  • Route to appropriate agent                               │   │
│  │  • Monitor all agent activities                             │   │
│  │  • Handle errors and retries                                │   │
│  │  • Create final MR via GitLab API                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│           ┌──────────────────┼──────────────────┐                   │
│           │                  │                  │                   │
│           ▼                  ▼                  ▼                   │
│     ┌──────────┐      ┌──────────┐      ┌──────────┐               │
│     │ PLANNER  │      │ BACKEND  │      │   QA     │               │
│     │  (MCP)   │      │ DEV (MCP)│      │ TESTER   │               │
│     └────┬─────┘      └────┬─────┘      └────┬─────┘               │
│          │                 │                 │                      │
│          │    ┌────────────┴─────────────────┘                      │
│          │    │                                                      │
│          │    ▼                                                      │
│          │  ┌──────────┐      ┌──────────┐                          │
│          │  │ FRONTEND │      │ CODE     │                          │
│          │  │ DEV (MCP)│      │ REVIEWER │                          │
│          │  └──────────┘      └──────────┘                          │
│          │                                                           │
│          └──────────────────┬────────────────────────┐                │
│                             │                        │                │
│                             ▼                        ▼                │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    MCP SERVERS (38 total)                    │   │
│  │                                                              │   │
│  │  Core: filesystem, git, gitlab, postgresql, redis, fetch    │   │
│  │  Custom: arabic-rtl, task-splitter, smart-code-search       │   │
│  │  Infra: terraform, aws, kubernetes, docker                  │   │
│  │  External: brave-search, slack, notion                      │   │
│  │                                                              │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                           │
│                                                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│   │  GITLAB  │    │ OPENHANDS│    │ANTHROPIC│    │  DOCKER  │     │
│   │   API    │    │Sandbox   │    │   AI     │    │  Engine  │     │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Overnight Workflow Example

```
10:00 PM - You send Telegram voice note:
           "Add HyperPay refund webhook to Bonyad"
           
10:01 PM - Orchestrator receives task, starts AutoGen group chat

10:02 PM - Planner analyzes codebase via MCP GitLab
           → Reads PaymentController.java
           → Creates implementation plan
           → Estimates complexity: Medium
           
10:03 PM - Orchestrator sends plan to Telegram for approval

10:04 PM - You reply: /approve

10:05 PM - Orchestrator delegates to Backend Dev via AutoGen

10:06 PM - Backend Dev:
           → MCP git: creates branch nigents/task-xxx
           → MCP filesystem: edits files
           → MCP git: commits changes
           → Reports: "Implementation complete"
           
10:45 PM - Orchestrator delegates to QA Tester

10:46 PM - QA Tester:
           → Reads code via MCP
           → Runs test suite via OpenHands
           → Reports: "12/12 tests passed"
           
11:00 PM - Orchestrator delegates to Code Reviewer

11:05 PM - Code Reviewer:
           → Reviews diff via MCP gitlab
           → Security audit passes
           → Reports: "Approved"
           
11:10 PM - Orchestrator:
           → Creates MR via GitLab API
           → Sends Telegram: "MR !47 ready!"
           
07:00 AM - Reporter sends morning summary with MR links

07:05 AM - You review MR on GitLab, merge, done!
```

---

## MCP Servers

Nigents uses the Model Context Protocol (MCP) to give agents superpowers. MCP servers are tools that agents can call to perform actions.

### Standard MCP Servers (35+)

| Category | MCP Servers |
|----------|-------------|
| **Core Dev** | filesystem, git, gitlab, postgresql, sqlite, redis, fetch, puppeteer, docker |
| **Infrastructure** | terraform, ansible, aws, kubernetes, cloudflare |
| **Data** | mongodb, neo4j, kafka, rabbitmq, mqtt, elasticsearch |
| **External** | brave-search, slack, discord, notion, jira, confluence, google-calendar, google-drive |
| **AI/Reasoning** | memory, sequential-thinking, openapi |
| **Monitoring** | prometheus, grafana, sentry |
| **Deployment** | vercel, netlify, heroku |

---

## Custom MCP Servers We Built

We created 3 custom TypeScript MCP servers specifically for this project:

### 1. Arabic RTL Auditor (`mcp-servers/arabic-rtl-auditor/`)

**Purpose:** Ensure Arabic RTL (Right-to-Left) compliance in code

**Tools:**
- `check_rtl_compliance` - Analyze CSS/HTML for RTL issues
- `suggest_arabic_fixes` - Suggest fixes for RTL problems
- `validate_arabic_text` - Validate Arabic text rendering
- `generate_arabic_tests` - Generate RTL test cases

**Usage Example:**
```typescript
// Agent calls this when reviewing frontend code
const result = await callMCPTool('arabic-rtl-auditor', 'check_rtl_compliance', {
  code: '.button { margin-left: 10px; }',
  language: 'css'
});
// Returns: { issues: ['Physical margin-left breaks RTL'], fixes: ['Use margin-inline-start'] }
```

**Build:**
```bash
cd mcp-servers/arabic-rtl-auditor
npm install
npm run build
# Output: dist/index.js
```

---

### 2. Task Splitter (`mcp-servers/task-splitter/`)

**Purpose:** Intelligently split large tasks across agent team

**Tools:**
- `analyze_task_complexity` - Estimate complexity (S/M/L)
- `split_task` - Break task into subtasks
- `assign_subtasks` - Assign to appropriate agents
- `estimate_timeline` - Estimate completion time

**Usage Example:**
```typescript
// Orchestrator uses this for task planning
const result = await callMCPTool('task-splitter', 'split_task', {
  task: 'Build complete e-commerce checkout',
  team_size: 7
});
// Returns: { subtasks: [...], assignments: [...], timeline: '4 hours' }
```

**Build:**
```bash
cd mcp-servers/task-splitter
npm install
npm run build
```

---

### 3. Smart Code Search (`mcp-servers/smart-code-search/`)

**Purpose:** Semantic code search using embeddings

**Tools:**
- `index_repository` - Index codebase for search
- `semantic_search` - Search by meaning, not just keywords
- `find_similar_code` - Find similar code patterns
- `explain_code` - Get natural language explanation

**Usage Example:**
```typescript
// Planner uses this to understand codebase
const result = await callMCPTool('smart-code-search', 'semantic_search', {
  query: 'where is payment processing handled',
  top_k: 5
});
// Returns: [{ file: 'PaymentService.java', relevance: 0.95, snippet: '...' }, ...]
```

**Build:**
```bash
cd mcp-servers/smart-code-search
npm install
npm run build
```

---

### MCP Server Configuration

All MCP servers are configured in `config/mcp-servers.json`:

```json
{
  "servers": {
    "arabic-rtl-auditor": {
      "command": "node",
      "args": ["mcp-servers/arabic-rtl-auditor/dist/index.js"],
      "enabled": true,
      "description": "RTL compliance checker for Arabic support"
    },
    "task-splitter": {
      "command": "node",
      "args": ["mcp-servers/task-splitter/dist/index.js"],
      "enabled": true,
      "description": "Task splitting across agent team"
    },
    "smart-code-search": {
      "command": "node",
      "args": ["mcp-servers/smart-code-search/dist/index.js"],
      "enabled": true,
      "description": "Semantic code search"
    }
  },
  "agentTools": {
    "orchestrator": ["memory", "sequential-thinking", "task-splitter"],
    "planner": ["smart-code-search", "brave-search", "gitlab"],
    "frontend-dev": ["arabic-rtl-auditor", "puppeteer", "figma"],
    "code-reviewer": ["arabic-rtl-auditor", "sequential-thinking"]
  }
}
```

---

## Telegram Integration

### Setting Up Telegram Bot

#### Step 1: Create Bot with BotFather

```
1. Open Telegram app
2. Search for @BotFather (official Telegram bot creator)
3. Click START or send /start
4. Send /newbot
5. Enter bot name (e.g., "Nigents Dev Team")
6. Enter bot username (must end in 'bot', e.g., 'nigents_bot')
7. BotFather will reply with your token:
   
   "Use this token to access the HTTP API:
    123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
   
   Save this token! You'll need it for TELEGRAM_BOT_TOKEN
```

#### Step 2: Get Your Chat ID

```
1. Search for @userinfobot in Telegram
2. Click START
3. The bot will reply with your info:
   
   @yourusername
   Id: 123456789
   First: YourName
   
   Save the Id number! This is your TELEGRAM_CHAT_ID
```

#### Step 3: Configure Environment

Edit `.env` file:
```bash
# Telegram Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789

# Optional: Group Chat Support
# If using a group chat, add bot to group first
# Then use this API call to get chat ID:
# curl https://api.telegram.org/bot<TOKEN>/getUpdates
```

#### Step 4: Test Connection

```bash
# Test bot token
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Expected response:
# {"ok":true,"result":{"id":123456789,"is_bot":true,"first_name":"Nigents"...}}
```

### Telegram Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Show welcome message and available commands | `/start` |
| `/plan <task>` | Create implementation plan | `/plan Add user authentication API` |
| `/approve` | Approve current plan for execution | `/approve` |
| `/run` | Execute approved plan immediately | `/run` |
| `/ask <question>` | Ask about code or project | `/ask How does the payment flow work?` |
| `/status` | View current queue status | `/status` |
| `/queue` | List all queued tasks | `/queue` |
| `/standup` | Get daily standup report | `/standup` |
| `/meet <agent>` | Chat with specific agent | `/meet backend-dev` |
| `/repos` | List connected GitLab repositories | `/repos` |
| `/costs` | Show API usage costs | `/costs` |
| `/cancel <id>` | Cancel a queued task | `/cancel task-123` |
| `/logs <agent>` | View agent logs | `/logs planner` |

### Voice Commands

Nigents supports voice notes in **Arabic** and **English**:

```
1. Hold the microphone button in Telegram
2. Speak your task in Arabic or English:
   
   Arabic: "أضف ميزة تسجيل الدخول باستخدام رقم الهاتف"
   English: "Add phone number login feature"
   
3. Release to send
4. Nigents will:
   - Transcribe voice using OpenAI Whisper
   - Detect language automatically
   - Process as text command
   - Respond in the same language
   - Send voice response (gTTS)
```

---

## Dashboard Features

The Nigents Dashboard runs at `http://EC2_IP:4000` and provides:

### 1. Real-Time Agent Monitoring
- See which agents are active/idle/busy
- Live task progress bars
- Agent status with color indicators

### 2. AI Provider Management
- Add any AI provider (OpenAI-compatible APIs)
- Configure custom models
- Multi-currency support ($, ¥, €, £, ₹)
- Provider usage stats and cost tracking

### 3. Interactive Charts
- Task completion over time
- Agent distribution (doughnut chart)
- Cost by provider (bar chart)
- Token usage (pie chart)
- Model performance comparison (radar chart)

### 4. Activity Feed
- Real-time agent communication log
- Code edit streaming
- Task queue with status

### 5. Responsive Design
- Works on desktop, tablet, and mobile
- Hamburger menu on mobile
- Touch-friendly interface

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Agent Framework** | Microsoft AutoGen + Custom EventEmitter |
| **AI Models** | Anthropic Claude, Zhipu AI GLM, Moonshot AI Kimi |
| **MCP Protocol** | Model Context Protocol SDK |
| **Backend** | Node.js 20+, Express |
| **Real-time** | Socket.io |
| **Telegram** | node-telegram-bot-api |
| **Voice** | OpenAI Whisper (STT) + gTTS (TTS) |
| **Dashboard UI** | Vanilla JS + Chart.js |
| **Process Manager** | PM2 |
| **Code Sandbox** | OpenHands (Docker) |
| **Version Control** | Simple-git |
| **Deployment** | AWS EC2 t3.large |

---

## Quick Start (Local)

### Prerequisites
```bash
# Check installed versions
node --version    # v20.x.x required
npm --version     # 10.x.x
python3 --version # 3.10+
git --version

# macOS: brew install node python git ffmpeg
# Ubuntu: sudo apt-get install nodejs python3 git ffmpeg
```

### Step 1: Clone and Setup
```bash
git clone https://github.com/ahmed-farahat-pro/agents.git nigents
cd nigents
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
nano .env  # Edit with your API keys

# Required minimum:
# TELEGRAM_BOT_TOKEN=your_token
# TELEGRAM_CHAT_ID=your_chat_id
# ANTHROPIC_API_KEY=your_key (or ZHIPU/MOONSHOT)
# OPENAI_API_KEY=your_key (for voice)
# GITLAB_TOKEN=your_token
# GITLAB_NAMESPACE=your_username
```

### Step 3: Build Custom MCP Servers
```bash
# Build Arabic RTL Auditor
cd mcp-servers/arabic-rtl-auditor
npm install && npm run build
cd ../..

# Build Task Splitter
cd mcp-servers/task-splitter
npm install && npm run build
cd ../..

# Build Smart Code Search
cd mcp-servers/smart-code-search
npm install && npm run build
cd ../..
```

### Step 4: Start Dashboard
```bash
npm run dashboard
# Dashboard: http://localhost:4000
```

### Step 5: Start Bot (New Terminal)
```bash
npm run dev
# Or: node src/bot.js
```

### Step 6: Test
```bash
# Test Telegram
# Send /start to your bot

# Test Dashboard
open http://localhost:4000
```

---

## Deploy on AWS EC2

### Step 1: Launch EC2 Instance

**AWS Console → EC2 → Launch Instance:**
```
Name: nigents-server
OS: Ubuntu 22.04 LTS
Instance: t3.large (2 vCPU, 8GB RAM)
Storage: 30GB gp3
Key Pair: Create new (.pem file)

Security Group Rules:
- SSH (22) - Your IP only
- Custom TCP (4000) - Your IP (Dashboard)
- Custom TCP (3000) - Your IP (OpenHands)
```

Download .pem key and set permissions:
```bash
chmod 400 ~/Downloads/nigents.pem
```

### Step 2: Connect and Install Dependencies

```bash
# SSH into EC2
ssh -i ~/Downloads/nigents.pem ubuntu@YOUR_EC2_IP

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install other dependencies
sudo apt-get install -y python3 python3-pip ffmpeg git

# Install PM2
sudo npm install -g pm2

# Install Docker
sudo apt-get install -y docker.io
sudo usermod -aG docker ubuntu

# Logout and back in for Docker group
exit
ssh -i ~/Downloads/nigents.pem ubuntu@YOUR_EC2_IP
```

### Step 3: Clone Repository

```bash
cd /home/ubuntu
git clone https://github.com/ahmed-farahat-pro/agents.git nigents
cd nigents
```

### Step 4: Install Dependencies

```bash
# Main app
npm install

# Build MCP servers
cd mcp-servers/arabic-rtl-auditor && npm install && npm run build && cd ../..
cd mcp-servers/task-splitter && npm install && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm install && npm run build && cd ../..
```

### Step 5: Configure Environment

```bash
cp .env.example .env
nano .env

# Add your real API keys:
TELEGRAM_BOT_TOKEN=your_real_token
TELEGRAM_CHAT_ID=your_real_chat_id
ANTHROPIC_API_KEY=your_real_key
OPENAI_API_KEY=your_real_key
GITLAB_TOKEN=your_real_token
GITLAB_NAMESPACE=your_gitlab_username
```

### Step 6: Setup OpenHands (Code Sandbox)

```bash
# Pull OpenHands image
docker pull ghcr.io/opendevin/opendevin:latest

# Create systemd service
sudo tee /etc/systemd/system/openhands.service > /dev/null << 'EOF'
[Unit]
Description=OpenHands Code Sandbox
After=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm \
  -p 3000:3000 \
  -v /home/ubuntu/workspace:/workspace \
  ghcr.io/opendevin/opendevin:latest
ExecStop=/usr/bin/docker stop -t 10 $(docker ps -q --filter ancestor=ghcr.io/opendevin/opendevin:latest)

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable openhands
sudo systemctl start openhands
```

### Step 7: Configure GitLab SSH

```bash
# Generate SSH key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "nigents@ec2"

# Show public key
cat ~/.ssh/id_rsa.pub
# Copy this and add to GitLab → Settings → SSH Keys

# Test connection
ssh -T git@gitlab.com
```

### Step 8: Start Services with PM2

```bash
cd /home/ubuntu/nigents

# Start bot
pm2 start src/bot.js --name nigents-bot

# Start dashboard
pm2 start src/dashboard/server.js --name nigents-dashboard

# Save PM2 config
pm2 save

# Setup auto-start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### Step 9: Verify Deployment

```bash
# Check all services
pm2 status

# Check logs
pm2 logs nigents-bot --lines 20
pm2 logs nigents-dashboard --lines 20

# Check ports
netstat -tlnp | grep -E '(:4000|:3000)'

# Access dashboard
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "Dashboard: http://$EC2_IP:4000"
```

### Step 10: Test Telegram Bot

```
1. Open Telegram on your phone
2. Find your bot (the one you created)
3. Send: /start
4. Should receive welcome message
5. Send: /plan Test task
6. Check dashboard to see activity
```

---

## Configuration

### Agent Configuration (`config/agents.json`)

```json
{
  "orchestrator": {
    "name": "orchestrator",
    "role": "Team Lead & Router",
    "model": "claude-3-sonnet-20240229",
    "maxTokens": 4096,
    "systemMessage": "You are the Orchestrator agent..."
  },
  "planner": { ... },
  "backend-dev": { ... },
  "frontend-dev": { ... },
  "qa-tester": { ... },
  "code-reviewer": { ... },
  "reporter": { ... }
}
```

### Project Configuration (`config/projects.json`)

```json
{
  "projects": [
    {
      "id": "myproject",
      "name": "My Project",
      "gitlabRepo": "username/repo",
      "stack": {
        "backend": "Node.js",
        "frontend": "React",
        "database": "PostgreSQL"
      }
    }
  ]
}
```

---

## Troubleshooting

### Bot Not Responding
```bash
pm2 status
pm2 logs nigents-bot
pm2 restart nigents-bot
```

### Dashboard Not Loading
```bash
# Check if running
pm2 logs nigents-dashboard

# Check firewall
sudo ufw allow 4000/tcp

# Check AWS security group (port 4000 open)
```

### MCP Servers Not Working
```bash
# Check builds
ls -la mcp-servers/*/dist/

# Rebuild
cd mcp-servers/arabic-rtl-auditor && npm run build

# Check config
cat config/mcp-servers.json
```

### Out of Memory
```bash
# Increase swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Monitor
pm2 monit
```

---

## API Keys Required

| Key | Source | Purpose |
|-----|--------|---------|
| `TELEGRAM_BOT_TOKEN` | @BotFather | Telegram bot auth |
| `TELEGRAM_CHAT_ID` | @userinfobot | Your Telegram ID |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Claude AI models |
| `ZHIPU_API_KEY` | open.bigmodel.cn | GLM models (optional) |
| `MOONSHOT_API_KEY` | platform.moonshot.cn | Kimi models (optional) |
| `OPENAI_API_KEY` | platform.openai.com | Whisper voice (optional) |
| `GITLAB_TOKEN` | GitLab Settings | GitLab API access |

---

**Nigents** — *Night Agents for GitLab*  
Built with ❤️ for developers who sleep while their code ships.
