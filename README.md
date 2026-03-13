# 🌙 Nigents — Night Agents for GitLab

> **Send a task on Telegram before you sleep. Wake up to a finished Merge Request.**

Your personal AI development company running on AWS EC2. 7 specialized agents collaborate overnight to plan, code, test, review, and ship features to **GitLab** — while you sleep.

---

## Table of Contents

1. [What is Nigents?](#what-is-nigents)
2. [What is OpenHands?](#what-is-openhands)
3. [The 7-Agent Team](#the-7-agent-team)
4. [App Flow & Workflow](#app-flow--workflow)
5. [MCP Servers](#mcp-servers)
6. [Custom MCP Servers We Built](#custom-mcp-servers-we-built)
7. [Telegram Integration](#telegram-integration)
8. [Dashboard Features](#dashboard-features)
9. [Tech Stack](#tech-stack)
10. [Quick Start (Local)](#quick-start-local)
11. [Deploy on AWS EC2](#deploy-on-aws-ec2)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

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

## What is OpenHands?

**OpenHands** is a code sandbox that runs inside a Docker container. It provides a safe, isolated environment where agents can:

| Function | Description |
|----------|-------------|
| 📝 **Write Code** | Create and edit files in a controlled workspace |
| 🔧 **Run Commands** | Execute shell commands, npm, git, etc. |
| 🧪 **Run Tests** | Execute test suites safely |
| 🔒 **Stay Isolated** | Cannot break your main server or system |

**Why OpenHands is Needed:**

```
Without OpenHands (Dangerous):
┌─────────────────────────────────────┐
│  Agent writes code directly to      │
│  /home/ubuntu/nightowl/src/        │
│                                     │
│  Risk: Could accidentally delete    │
│  critical files or break the app   │
└─────────────────────────────────────┘

With OpenHands (Safe):
┌─────────────────────────────────────┐
│  Agent writes code to:              │
│  Docker Container → /workspace      │
│                                     │
│  Safe: If something breaks, only    │
│  the container is affected          │
│  Main server stays protected        │
└─────────────────────────────────────┘
```

**How OpenHands Fits in the Workflow:**

```
1. Backend Dev Agent receives task
         ↓
2. Needs to create new API endpoint
         ↓
3. Calls OpenHands MCP tool:
   "Create file /workspace/PaymentController.java"
         ↓
4. OpenHands writes file in container
         ↓
5. Agent tests the code in container
         ↓
6. If tests pass → Git commit from container
         ↓
7. Changes pushed to GitLab
```

**OpenHands Runs On:**
- **Port 3000** inside EC2
- **Docker container** with isolated filesystem
- **Mounted volume** `/home/ubuntu/workspace` for persistence
- **Separate from main app** - crash won't affect Nigents

**Example Usage in Code:**
```javascript
// Backend Dev agent uses OpenHands via MCP
await openhands.execute({
  action: 'write_file',
  path: '/workspace/src/PaymentController.java',
  content: 'public class PaymentController { ... }'
});

// Run tests safely
await openhands.execute({
  action: 'run_command',
  command: 'mvn test'
});
```

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

## GitLab Repository Setup

### How Agents Know Which Repo to Work On

Nigents can work on **multiple GitLab repositories**. You configure which repos are available, and agents will use the selected one:

```
Dashboard → GitLab Repos → Select Repository
         ↓
   All tasks will target this repo
         ↓
   Agents create branches here
         ↓
   MRs are created in this repo
```

### Step 1: Add Repositories in Dashboard

1. Open Dashboard → **GitLab Repos** (in sidebar)
2. Click **Settings** (gear icon)
3. Add your repositories:

```javascript
// In Dashboard Settings, add repos like:
[
  {
    "id": "my-backend",
    "name": "backend-api",
    "namespace": "yourusername",
    "url": "https://gitlab.com/yourusername/backend-api",
    "defaultBranch": "main"
  },
  {
    "id": "my-frontend", 
    "name": "frontend-app",
    "namespace": "yourusername",
    "url": "https://gitlab.com/yourusername/frontend-app",
    "defaultBranch": "main"
  }
]
```

### Step 2: Select Active Repository

1. Go to **GitLab Repos** in dashboard
2. Click on the repository you want to work on
3. It will show "Selected" badge
4. All new tasks will target this repo

### Step 3: Configure GitLab Token

**Get your token:**
1. Go to GitLab.com → User Settings → Access Tokens
2. Click "Add new token"
3. Name: "Nigents"
4. Scopes: `api`, `read_repository`, `write_repository`
5. Copy the token

**Add to dashboard:**
1. Dashboard → Settings
2. Paste token in "GitLab Token" field
3. Set your GitLab username in "Default Namespace"
4. Click Save

### Step 4: Test Repository Access

From your EC2 server:
```bash
# Test GitLab connection
ssh -T git@gitlab.com

# Should see: "Welcome to GitLab, @username!"
```

### How Task Creation Works

**From Dashboard:**
```
1. Click "+ New Task"
2. Select repository from dropdown
3. Enter task description
4. Choose priority
5. Submit → Task queued
```

**From Telegram:**
```
Send: /plan Add login feature

Bot replies:
"Which repository? 
1. backend-api
2. frontend-app
Reply with number..."

You reply: 1
Bot: "Working on backend-api..."
```

### Repository Branch Structure

Agents create branches like:
```
main
  └── nigents/task-1709901234567-add-login-feature
       └── [code changes]
              └── MR created → main
```

### Multiple Projects

You can configure **multiple projects** and switch between them:

| Project | Use Case |
|---------|----------|
| Backend API | Spring Boot, Node.js, Python APIs |
| Frontend App | React, React Native, Vue |
| Infrastructure | Terraform, Docker, K8s |
| Mobile App | iOS, Android, Flutter |

**Switch projects anytime:**
- Dashboard: Click different repo
- Telegram: Bot will ask which repo

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
# Nigents Operations Guide

> Daily operations, updates, and troubleshooting on EC2

---

## Table of Contents

1. [Edit Environment Variables](#edit-environment-variables)
2. [Pull Updates & Restart](#pull-updates--restart)
3. [GitLab Connection Fix](#gitlab-connection-fix)
4. [Common Commands](#common-commands)
5. [Troubleshooting](#troubleshooting)

---

## Edit Environment Variables

### Step 1: SSH into EC2

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
```

### Step 2: Edit .env File

```bash
cd /home/ubuntu/nightowl
nano .env
```

### Step 3: Common .env Variables

```bash
# Required - Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_chat_id

# Required - AI Provider (pick at least one)
ANTHROPIC_API_KEY=sk-ant-api03-your-key
ZHIPU_API_KEY=your.zhipu.key
MOONSHOT_API_KEY=sk-your-moonshot-key

# Required - GitLab
GITLAB_TOKEN=glpat-your_gitlab_token
GITLAB_NAMESPACE=your_gitlab_username
GITLAB_URL=https://gitlab.com

# Required - OpenAI (for voice)
OPENAI_API_KEY=sk-your-openai-key

# Dashboard
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=your_secure_password

# Feature Flags
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=true
```

### Step 4: Save & Restart

```bash
# Save file in nano: Ctrl+X, then Y, then Enter

# Restart services
pm2 restart all

# Check logs
pm2 logs
```

---

## Pull Updates & Restart

### Quick Update Script

```bash
# SSH into EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Go to project
cd /home/ubuntu/nightowl

# Pull latest changes
git pull origin feature/custom-mcp-servers

# If you get merge conflicts:
git stash          # Save local changes
git pull origin feature/custom-mcp-servers
git stash pop      # Restore local changes

# Install new dependencies (if package.json changed)
npm install

# Rebuild MCP servers (if needed)
cd mcp-servers/arabic-rtl-auditor && npm run build && cd ../..
cd mcp-servers/task-splitter && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm run build && cd ../..

# Restart all services
pm2 restart all

# Check status
pm2 status
pm2 logs --lines 20
```

### One-Command Update

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP << 'EOF'
cd /home/ubuntu/nightowl
git pull origin feature/custom-mcp-servers
npm install
pm2 restart all
echo "✅ Update complete!"
EOF
```

---

## GitLab Connection Fix

### Problem: Repos Not Showing

Even with SSH key set up, repos may not appear in dashboard. Here's the fix:

### Step 1: Verify GitLab Token (Not SSH)

**Nigents uses TOKEN-based API access, not just SSH!**

```bash
# Check if token is set
grep GITLAB_TOKEN /home/ubuntu/nightowl/.env

# Should show: GITLAB_TOKEN=glpat-xxxxxxxx
```

### Step 2: Generate GitLab Token

1. Go to **GitLab.com** → Click your avatar → **Edit Profile**
2. Left sidebar → **Access Tokens**
3. Click **"Add new token"**
4. Fill in:
   - **Token name:** Nigents
   - **Expiration:** 1 year from now
   - **Scopes:** Check ALL these:
     - [x] api (Full API access)
     - [x] read_repository
     - [x] write_repository
     - [x] read_user
5. Click **"Create personal access token"**
6. **COPY THE TOKEN IMMEDIATELY** (you can't see it again!)

### Step 3: Add Token to .env

```bash
# On EC2
nano /home/ubuntu/nightowl/.env

# Add or update:
GITLAB_TOKEN=glpat-YOUR_TOKEN_HERE
GITLAB_NAMESPACE=your_gitlab_username
GITLAB_URL=https://gitlab.com

# Save: Ctrl+X, Y, Enter
```

### Step 4: Configure Repositories

**Option A: Via Dashboard (Easiest)**

1. Open dashboard: `http://YOUR_EC2_IP:4000`
2. Go to **Settings**
3. Scroll to "GitLab Configuration"
4. Enter:
   - GitLab URL: `https://gitlab.com`
   - GitLab Token: `glpat-xxxxxxxx`
   - Namespace: `yourusername`
5. Click "Save GitLab Settings"
6. Go to **GitLab Repos** menu
7. Click "Refresh" to fetch repos

**Option B: Via Config File**

```bash
# Edit projects config
nano /home/ubuntu/nightowl/config/projects.json
```

Add your repos:
```json
{
  "projects": [
    {
      "id": "my-backend",
      "name": "backend-api",
      "gitlabRepo": "yourusername/backend-api",
      "stack": {
        "backend": "Node.js",
        "database": "PostgreSQL"
      },
      "defaultBranch": "main"
    },
    {
      "id": "my-frontend",
      "name": "frontend-app",
      "gitlabRepo": "yourusername/frontend-app",
      "stack": {
        "frontend": "React"
      },
      "defaultBranch": "main"
    }
  ],
  "defaultProject": "my-backend"
}
```

### Step 5: Test Connection

```bash
# On EC2, test API access
curl --header "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  "https://gitlab.com/api/v4/user"

# Should return your user info
```

### Step 6: Restart & Verify

```bash
# Restart services
pm2 restart all

# Check logs for GitLab connection
pm2 logs nigents-bot --lines 50

# Look for:
# "GitLab connection successful"
# "Loaded X repositories"
```

---

## Common Commands

### Daily Operations

```bash
# View all services
pm2 status

# View logs
pm2 logs                    # All logs
pm2 logs nigents-bot        # Bot only
pm2 logs nigents-dashboard  # Dashboard only

# Restart services
pm2 restart all
pm2 restart nigents-bot
pm2 restart nigents-dashboard

# Stop services
pm2 stop all

# Start services
pm2 start all

# Monitor in real-time
pm2 monit
```

### File Operations

```bash
# Edit .env
nano /home/ubuntu/nightowl/.env

# Edit agent config
nano /home/ubuntu/nightowl/config/agents.json

# Edit projects
nano /home/ubuntu/nightowl/config/projects.json

# View logs file
tail -f /home/ubuntu/nightowl/logs/app.log
```

### Git Operations

```bash
# Check status
cd /home/ubuntu/nightowl
git status

# Pull updates
git pull origin feature/custom-mcp-servers

# Check branch
git branch

# View recent commits
git log --oneline -5
```

---

## Troubleshooting

### Issue: Dashboard Not Accessible

```bash
# 1. Check if running
pm2 status

# 2. Check port
sudo netstat -tlnp | grep 4000

# 3. Check firewall
sudo ufw status
sudo ufw allow from YOUR_IP to any port 4000

# 4. Check AWS Security Group
# AWS Console → EC2 → Security Groups → Inbound rules
# Must have: Custom TCP 4000 from YOUR_IP/32
```

### Issue: GitLab Repos Not Showing

```bash
# 1. Check token is set
grep GITLAB_TOKEN .env

# 2. Test API manually
curl -H "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  https://gitlab.com/api/v4/projects

# 3. Check logs for errors
pm2 logs --lines 100 | grep -i gitlab

# 4. Verify namespace
grep GITLAB_NAMESPACE .env
```

### Issue: Bot Not Responding

```bash
# 1. Check bot is running
pm2 status nigents-bot

# 2. Check Telegram token
grep TELEGRAM_BOT_TOKEN .env

# 3. Test Telegram API
curl "https://api.telegram.org/botYOUR_TOKEN/getMe"

# 4. Check logs
pm2 logs nigents-bot --lines 50
```

### Issue: After Pull, App Broken

```bash
# 1. Check for errors
pm2 logs --lines 100

# 2. Reinstall dependencies
rm -rf node_modules
npm install

# 3. Rebuild MCPs
cd mcp-servers/arabic-rtl-auditor && npm install && npm run build && cd ../..
cd mcp-servers/task-splitter && npm install && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm install && npm run build && cd ../..

# 4. Restart
pm2 restart all
```

### Issue: Out of Disk Space

```bash
# Check disk usage
df -h

# Clean npm cache
npm cache clean --force

# Remove old logs
pm2 flush

# Check Docker images
docker system prune -f
```

---

## Quick Reference Card

```bash
# CONNECT
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# UPDATE
cd /home/ubuntu/nightowl
git pull origin feature/custom-mcp-servers
pm2 restart all

# EDIT ENV
nano /home/ubuntu/nightowl/.env
pm2 restart all

# CHECK LOGS
pm2 logs --lines 50

# RESTART
pm2 restart all

# GITLAB FIX
# 1. Get token: GitLab → Profile → Access Tokens
# 2. nano .env → Add GITLAB_TOKEN=glpat-xxx
# 3. pm2 restart all
```

---

**Need more help?** Check the main README.md or create an issue on GitHub.
