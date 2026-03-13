# 🦉 NightOwl — AI Agent Development Team for GitLab

> **Send a task on Telegram before you sleep. Wake up to a finished Merge Request.**

Your personal AI development company running on AWS EC2. 7 specialized agents collaborate overnight to plan, code, test, review, and ship features to **GitLab** — while you sleep.

---

## Table of Contents

1. [Overview](#overview)
2. [The 7-Agent Team](#the-7-agent-team)
3. [System Architecture](#system-architecture)
4. [Project Structure](#project-structure)
5. [Configuration Files](#configuration-files)
6. [Overnight Workflow Scenarios](#overnight-workflow-scenarios)
7. [35+ MCP Integrations](#35-mcp-integrations)
8. [Tech Stack](#tech-stack)
9. [Quick Start](#quick-start)
10. [GitLab Pipeline & EC2 Deployment](#gitlab-pipeline--ec2-deployment)
11. [Telegram Commands](#telegram-commands)
12. [Web Dashboard](#web-dashboard)
13. [Dashboard API](#dashboard-api)
14. [Voice Processing](#voice-processing)
15. [AutoGen Group Chat](#autogen-group-chat)
16. [Troubleshooting](#troubleshooting)
17. [API Keys Required](#api-keys-required)

---

## Overview

NightOwl is a self-hosted AI agent team that runs on your AWS EC2 server and deploys to **GitLab only**. You interact via:

- **Telegram** — voice notes and text commands, Arabic or English
- **Web Dashboard** — real-time agent activity, streaming code edits, agent communication

### Key Features

| Feature | Description |
|---------|-------------|
| 🌙 **24/7 Operation** | Runs on EC2 with PM2 process manager |
| 🎙️ **Voice Commands** | Send voice notes in Arabic or English |
| 🤖 **7 AI Agents** | Specialized agents for planning, coding, testing, reviewing |
| 🔗 **AutoGen Coordination** | Microsoft AutoGen for agent-to-agent communication |
| 🛠️ **35+ MCP Tools** | Model Context Protocol for extended capabilities |
| 📊 **Live Dashboard** | Real-time code streaming and agent activity |
| 🔀 **GitLab Integration** | Automatic MR creation on GitLab |
| 🐳 **Docker Ready** | Complete Docker setup with OpenHands sandbox |

### System Flow Diagram

```
                    ┌─────────────────────────────────┐
                    │           YOU                    │
                    │  Phone (Telegram) or Browser     │
                    └────────────┬─────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │                  │                       │
              ▼                  ▼                       ▼
      Voice Note           Text Command          Web Dashboard
    (Arabic/English)      /plan /approve        (Live streaming)
              │                  │                       │
              └──────────────────┼───────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    Telegram Bot         │
                    │    (Node.js + pm2)      │
                    └────────────┬───────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   ORCHESTRATOR          │
                    │   Claude Sonnet 4       │
                    │   AutoGen Group Chat    │
                    └──┬──┬──┬──┬──┬─────────┘
                       │  │  │  │  │
          ┌────────────┘  │  │  │  └────────────────┐
          │               │  │  │                    │
          ▼               ▼  │  ▼                    ▼
    ┌─────────┐    ┌────────┐│┌───────┐      ┌──────────┐
    │ PLANNER │    │BACKEND │││  QA   │      │ REPORTER │
    │  (MCP)  │    │  (MCP) │││ (MCP) │      │  (MCP)   │
    └────┬────┘    └───┬────┘│└───┬───┘      └────┬─────┘
         │             │     │    │               │
         │             │     │    └───────────────┘
         │             │     │
         │        ┌────┴─────┴──┐
         │        │             │
         │        ▼             ▼
         │   ┌────────┐   ┌──────────┐
         │   │FRONTEND│   │ REVIEWER │
         │   │ (MCP)  │   │  (MCP)   │
         │   └────────┘   └──────────┘
         │
         ▼
   ┌─────────────────────────────────────────┐
   │        MCP SERVERS (35+)                │
   │  GitLab, PostgreSQL, Redis, Docker,     │
   │  Terraform, AWS, Kafka, MongoDB, etc.   │
   └─────────────────────────────────────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │    GITLAB      │
                        │   (MR Created) │
                        └────────────────┘
```

---

## The 7-Agent Team

| Agent | Model | Role | MCP Tools |
|-------|-------|------|-----------|
| **Orchestrator** | Claude Sonnet 4 | Team lead, coordinates all agents via AutoGen | memory, sequential-thinking, fetch, gitlab, redis |
| **Planner** | Claude Sonnet 4 | Analyzes codebase, creates implementation plans | filesystem, git, gitlab, brave-search, openapi, obsidian |
| **Backend Dev** | Claude Sonnet 4 | Writes Spring Boot/Node/Python, manages infra | filesystem, git, gitlab, postgresql, redis, mongodb, docker, terraform, kafka, rabbitmq |
| **Frontend Dev** | Claude Haiku | React/React Native, RTL support, UI/UX | filesystem, git, gitlab, puppeteer, figma, vercel, cloudflare |
| **QA Tester** | Claude Haiku | Writes tests, runs suites, validates | filesystem, git, gitlab, postgresql, puppeteer, docker, prometheus |
| **Code Reviewer** | Claude Sonnet 4 | Security audit, quality, RTL compliance | filesystem, git, gitlab, github, sequential-thinking, openapi |
| **Reporter** | Claude Haiku | Telegram updates, daily reports | slack, discord, filesystem, notion, jira, confluence |

### Agent Details

#### 1. Orchestrator Agent
- **Location:** `src/orchestrator.js`
- **Purpose:** Central coordinator that routes tasks and manages workflow
- **Key Methods:**
  - `processCommand()` - Parse and route user commands
  - `handlePlanTask()` - Delegate planning to Planner
  - `executeWithAutoGen()` - Coordinate multi-agent execution
  - `createMergeRequest()` - Final MR creation

#### 2. Planner Agent
- **Location:** `src/agents/planner.js`
- **Purpose:** Creates detailed implementation plans
- **Capabilities:**
  - Codebase analysis via GitLab API
  - Complexity estimation (S/M/L)
  - Step-by-step implementation guides
  - File change identification

#### 3. Backend Developer Agent
- **Location:** `src/agents/backend-dev.js`
- **Purpose:** Implements backend features
- **Supports:** Spring Boot, Node.js, Python/FastAPI
- **Integrations:** HyperPay, Nafath, MQTT, PostgreSQL

#### 4. Frontend Developer Agent
- **Location:** `src/agents/frontend-dev.js`
- **Purpose:** Implements UI components
- **Supports:** React, React Native
- **Specialty:** Arabic RTL support, dark mode, responsive design

#### 5. QA Tester Agent
- **Location:** `src/agents/qa-tester.js`
- **Purpose:** Testing and validation
- **Capabilities:**
  - Unit test generation
  - Integration testing
  - Test suite execution
  - Failure reporting with line numbers

#### 6. Code Reviewer Agent
- **Location:** `src/agents/code-reviewer.js`
- **Purpose:** Security and quality review
- **Checks:**
  - Security vulnerabilities
  - Code quality
  - RTL/Arabic compliance
  - Performance issues

#### 7. Reporter Agent
- **Location:** `src/agents/reporter.js`
- **Purpose:** Communication hub
- **Features:**
  - Telegram message sending
  - Voice message generation (gTTS)
  - Daily standup reports
  - Cost tracking

---

## System Architecture

```
╔══════════════════════════════════════════════════════════════════════╗
║                     AWS EC2 SERVER (Ubuntu 22.04)                    ║
║                    t3.large · 8GB RAM · Always On                   ║
║                                                                       ║
║  ┌─────────────────────┐    ┌──────────────────────────────────────┐ ║
║  │   TELEGRAM BOT      │    │        WEB DASHBOARD                 │ ║
║  │   Node.js + pm2     │    │   Express + Socket.io · Port 4000   │ ║
║  │   Voice/Text Input  │    │   Streaming Code + Agent Comm        │ ║
║  └──────────┬──────────┘    └──────────────┬───────────────────────┘ ║
║             │                               │                         ║
║             └───────────────┬───────────────┘                         ║
║                             │                                         ║
║             ┌───────────────▼───────────────┐                         ║
║             │      ORCHESTRATOR (AutoGen)    │                         ║
║             │   - Group Chat Manager          │                         ║
║             │   - Agent Delegation            │                         ║
║             │   - Error Recovery              │                         ║
║             └──┬────┬────┬────┬────┬─────────┘                        ║
║                │    │    │    │    │                                   ║
║       ┌────────┘    │    │    │    └────────┐                          ║
║       │             │    │    │             │                          ║
║       ▼             ▼    │    ▼             ▼                          ║
║  ┌─────────┐   ┌────────┐│┌────────┐  ┌──────────┐                   ║
║  │ PLANNER │   │BACKEND │││   QA   │  │ REPORTER │                   ║
║  └────┬────┘   └───┬────┘│└───┬────┘  └────┬─────┘                   ║
║       │            │     │    │            │                          ║
║       │       ┌────┴─────┴──┐│            │                          ║
║       │       │             ││            │                          ║
║       │       ▼             ▼│            │                          ║
║       │  ┌────────┐   ┌──────────┐        │                          ║
║       │  │FRONTEND│   │ REVIEWER │        │                          ║
║       │  └────────┘   └──────────┘        │                          ║
║       │                                    │                          ║
║       └────────────┬───────────────────────┘                          ║
║                    ▼                                                  ║
║  ┌──────────────────────────────────────────────────────────────┐    ║
║  │                    MCP CLIENT MANAGER                         │    ║
║  │  Connects to 35+ MCP servers for enhanced capabilities       │    ║
║  └──────────────────────────────────────────────────────────────┘    ║
║                    │                                                  ║
║     ┌──────────────┼──────────────┬──────────────┬──────────┐        ║
║     ▼              ▼              ▼              ▼          ▼        ║
║  ┌──────┐    ┌──────────┐   ┌────────┐   ┌──────────┐  ┌────────┐   ║
║  │GitLab│    │PostgreSQL│   │ Redis  │   │  Docker  │  │  AWS   │   ║
║  │      │    │          │   │        │   │          │  │        │   ║
║  └──────┘    └──────────┘   └────────┘   └──────────┘  └────────┘   ║
║                                                                       ║
║  ┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐  ║
║  │   GITLAB API     │   │   OPENHANDS      │   │  AUTO-GEN CHAT   │  ║
║  │   - Read repos   │   │   Docker:3000    │   │  Group Manager   │  ║
║  │   - Create MRs   │   │   Code sandbox   │   │  Agent-to-Agent  │  ║
║  │   - Get commits  │   │   Git operations │   │  Communication   │  ║
║  └──────────────────┘   └─────────────────┘   └──────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝
                │                    │
                ▼                    ▼
      ┌─────────────────┐    ┌─────────────────┐
      │    GITLAB       │    │  TELEGRAM APP   │
      │  MR Created     │    │  (Your Phone)   │
      └─────────────────┘    └─────────────────┘
```

---

## Project Structure

```
nightowl/
├── 📁 src/
│   ├── 📁 agents/                 # AI Agent implementations
│   │   ├── base-agent.js         # Base class for all agents
│   │   ├── orchestrator.js       # Main coordinator agent
│   │   ├── planner.js            # Planning agent
│   │   ├── backend-dev.js        # Backend developer agent
│   │   ├── frontend-dev.js       # Frontend developer agent
│   │   ├── qa-tester.js          # QA testing agent
│   │   ├── code-reviewer.js      # Code review agent
│   │   ├── reporter.js           # Telegram reporter agent
│   │   └── index.js              # Agent exports
│   │
│   ├── 📁 autogen/                # Microsoft AutoGen integration
│   │   ├── group-chat.js         # Multi-agent chat system
│   │   └── index.js              # AutoGen exports
│   │
│   ├── 📁 mcp/                    # Model Context Protocol
│   │   ├── mcp-client.js         # MCP client manager
│   │   ├── agent-mcp-wrapper.js  # Agent-MCP bridge
│   │   └── index.js              # MCP exports
│   │
│   ├── 📁 tools/                  # External tool integrations
│   │   ├── gitlab.js             # GitLab API integration
│   │   ├── openhands.js          # OpenHands sandbox
│   │   └── voice.js              # Voice processing (Whisper/gTTS)
│   │
│   ├── 📁 utils/                  # Utility functions
│   │   └── logger.js             # Winston logger configuration
│   │
│   ├── 📁 dashboard/              # Web dashboard
│   │   ├── server.js             # Express + Socket.io server
│   │   └── 📁 public/
│   │       └── index.html        # Dashboard UI
│   │
│   ├── bot.js                    # Telegram bot entry point
│   └── orchestrator.js           # Main orchestrator (legacy)
│
├── 📁 config/                     # Configuration files
│   ├── agents.json               # Agent configurations
│   ├── mcp-servers.json          # MCP server definitions
│   └── projects.json             # Project definitions
│
├── 📁 scripts/                    # Utility scripts
│   ├── ec2-bootstrap.sh          # EC2 setup script
│   └── health-check.js           # Health check script
│
├── 📁 data/                       # Data storage
│   └── reports/                  # Generated reports
│
├── 📁 logs/                       # Log files
│
├── .env.example                   # Environment variables template
├── .env                          # Your environment variables (gitignored)
├── .gitignore                    # Git ignore rules
├── .gitlab-ci.yml                # GitLab CI/CD pipeline
├── docker-compose.yml            # Docker composition
├── Dockerfile                    # Docker image definition
├── package.json                  # Node.js dependencies
├── pm2.config.js                 # PM2 process configuration
├── requirements.txt              # Python dependencies
└── README.md                     # This file
```

---

## Configuration Files

### 1. Agent Configuration (`config/agents.json`)

Defines the 7 agents with their models, system messages, and capabilities.

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

### 2. MCP Servers (`config/mcp-servers.json`)

Defines 35+ MCP servers with their configuration:

```json
{
  "servers": {
    "filesystem": { "enabled": true, ... },
    "git": { "enabled": true, ... },
    "gitlab": { "enabled": true, ... },
    "postgresql": { "enabled": true, ... },
    ...
  },
  "agentTools": {
    "orchestrator": ["memory", "sequential-thinking", "fetch", ...],
    "planner": ["filesystem", "git", "gitlab", "brave-search", ...],
    ...
  }
}
```

### 3. Project Configuration (`config/projects.json`)

Defines the projects NightOwl can work on:

```json
{
  "projects": [
    {
      "id": "bonyad",
      "name": "Bonyad",
      "gitlabRepo": "bonyad/backend",
      "stack": {
        "backend": "Spring Boot",
        "database": "PostgreSQL"
      }
    }
  ],
  "defaultProject": "bonyad"
}
```

---

## Overnight Workflow Scenarios

### Scenario 1: Happy Path — Everything Succeeds

```
10:00 PM  YOU: /plan "Add HyperPay refund webhook to Bonyad"
          ↓
10:01 PM  ORCHESTRATOR: Delegates to PLANNER via AutoGen
          ↓
10:02 PM  PLANNER: 
          - Uses MCP gitlab to read PaymentController.java
          - Uses MCP filesystem to understand structure
          - Creates implementation plan (Complexity: M)
          → Reports to ORCHESTRATOR
          ↓
10:03 PM  ORCHESTRATOR: Sends plan to Telegram
          ↓
10:04 PM  YOU: /approve
          ↓
10:05 PM  ORCHESTRATOR (AutoGen group chat):
          "@backend-dev Please implement this plan"
          ↓
10:06 PM  BACKEND DEV:
          - MCP git: creates branch nightowl/task-xxx
          - MCP filesystem: edits PaymentController.java
          - MCP git: commits changes
          → Reports: "Implementation complete"
          ↓
10:45 PM  ORCHESTRATOR (AutoGen):
          "@qa-tester Please test backend-dev's changes"
          ↓
10:46 PM  QA TESTER:
          - MCP filesystem: reads new code
          - MCP postgresql: verifies DB changes
          - Runs test suite via OpenHands
          → Reports: "12/12 tests passed"
          ↓
11:00 PM  ORCHESTRATOR (AutoGen):
          "@code-reviewer Please review changes"
          ↓
11:05 PM  CODE REVIEWER:
          - MCP gitlab: gets diff
          - MCP sequential-thinking: analyzes security
          → Reports: "Approved - no issues found"
          ↓
11:10 PM  ORCHESTRATOR:
          - Uses GitLab API to create MR !47
          → Telegram: "MR created, sleep well!"
          ↓
07:00 AM  REPORTER: Morning summary with MR link
          ↓
07:05 AM  YOU: Review MR on GitLab → Merge → Done
```

### Scenario 2: Tests Fail — Auto-Recovery

```
10:00 PM  Task started as normal...
          ↓
11:00 PM  QA TESTER: Runs tests → 3/12 FAILED
          - Uses MCP to read test output
          - Identifies issues in PaymentService.java
          ↓
11:05 PM  QA TESTER (AutoGen group chat):
          "@backend-dev Tests failed:
           - testRefundValidation: NullPointerException line 45
           - testWebhookResponse: Expected 200, got 500
           Please fix these issues"
          ↓
11:06 PM  BACKEND DEV:
          - Receives failure report via AutoGen
          - Uses MCP filesystem: reads test files
          - Fixes issues in code
          - MCP git: commits fixes
          → Reports: "Issues fixed, ready for re-test"
          ↓
11:30 PM  ORCHESTRATOR (AutoGen):
          "@qa-tester Please re-test backend-dev's fixes"
          ↓
11:35 PM  QA TESTER: Re-runs tests → 12/12 PASSED
          → Reports: "All tests passing now"
          ↓
11:40 PM  Continues to CODE REVIEWER → MR created
          ↓
07:00 AM  You wake up to successful MR
```

### Scenario 3: Security Issue Found

```
10:00 PM  Task started...
          ↓
11:30 PM  CODE REVIEWER: Reviewing code via MCP gitlab
          - Detects: Hardcoded API key in config.java
          - Severity: CRITICAL
          ↓
11:35 PM  CODE REVIEWER (AutoGen group chat):
          "@orchestrator CRITICAL security issue found:
           Hardcoded API key detected in config.java:15
           @backend-dev Please fix immediately"
          ↓
11:36 PM  ORCHESTRATOR:
          - Logs critical issue
          - Notifies REPORTER to alert user
          - Stops MR creation
          ↓
11:37 PM  BACKEND DEV:
          - Receives security report
          - Uses MCP sequential-thinking: designs fix
          - Moves API key to environment variable
          - MCP git: commits fix
          → Reports: "Security issue resolved"
          ↓
11:50 PM  CODE REVIEWER: Re-reviews → Approves
          ↓
12:00 AM  MR created
          ↓
07:00 AM  Morning report includes security fix note
```

---

## 35+ MCP Integrations

NightOwl uses the Model Context Protocol (MCP) to give agents superpowers:

### Core Development MCPs (Always Enabled)
| MCP | Purpose | Used By |
|-----|---------|---------|
| filesystem | Read/write files | All agents |
| git | Branch, commit, diff | All agents |
| gitlab | MRs, issues, repos | All agents |
| postgresql | Database queries | Backend, QA |
| sqlite | Local storage | All agents |
| redis | Caching | Backend, Orchestrator |
| fetch | HTTP requests | All agents |
| puppeteer | Browser automation | Frontend, QA |
| docker | Container management | Backend, QA |

### Infrastructure MCPs
| MCP | Purpose |
|-----|---------|
| terraform | Infrastructure as code |
| ansible | Configuration management |
| aws | AWS services |
| kubernetes | K8s cluster management |
| cloudflare | DNS and Workers |

### Data & Messaging MCPs
| MCP | Purpose |
|-----|---------|
| mongodb | NoSQL database |
| neo4j | Graph database |
| kafka | Event streaming |
| rabbitmq | Message queue |
| mqtt | IoT messaging |
| elasticsearch | Search & analytics |

### External Service MCPs
| MCP | Purpose |
|-----|---------|
| brave-search | Web search |
| slack | Team notifications |
| discord | Community notifications |
| notion | Documentation |
| jira | Project tracking |
| confluence | Wiki pages |
| google-calendar | Scheduling |
| google-drive | File storage |

### Design & Content MCPs
| MCP | Purpose |
|-----|---------|
| figma | Design specs |
| miro | Whiteboards |
| obsidian | Knowledge base |
| pdf | Document reading |
| excel | Spreadsheets |
| csv | Data files |

### AI & Reasoning MCPs
| MCP | Purpose |
|-----|---------|
| memory | Persistent memory |
| sequential-thinking | Complex reasoning |
| openapi | API specifications |

### Monitoring MCPs
| MCP | Purpose |
|-----|---------|
| prometheus | Metrics |
| grafana | Dashboards |
| sentry | Error tracking |

### Deployment MCPs
| MCP | Purpose |
|-----|---------|
| vercel | Frontend deployment |
| netlify | Static hosting |
| heroku | App platform |
| stripe | Payments (if needed) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Agent Framework** | AutoGen (Microsoft) + Custom EventEmitter |
| **AI Models** | Claude 3 Sonnet (complex) / Haiku (fast) |
| **MCP Protocol** | Model Context Protocol SDK |
| **Telegram** | node-telegram-bot-api |
| **Voice** | Whisper (in) + gTTS (out) |
| **Dashboard** | Express + Socket.io |
| **Git** | Simple-git + MCP Git |
| **CI/CD** | GitLab CI only |
| **Process Manager** | PM2 |
| **Server** | AWS EC2 t3.large |

---

## Quick Start

```bash
# 1. Clone and setup
git clone <your-gitlab-repo>
cd nightowl
npm install
cp .env.example .env

# 2. Configure environment
# Edit .env with your GitLab token, Telegram bot, Claude API key

# 3. Run health check
node scripts/health-check.js

# 4. Start development
npm run dev        # Bot
npm run dashboard  # Dashboard

# 5. Open dashboard
open http://localhost:4000
```

---

## GitLab Pipeline & EC2 Deployment

### Step 1: Create GitLab Repository

```bash
# On GitLab.com or your GitLab instance:
# 1. Create new project named "nightowl"
# 2. Set to Private
# 3. Note the project ID

# Push code to GitLab
git remote add origin git@gitlab.com:YOUR_USERNAME/nightowl.git
git push -u origin main
```

### Step 2: Configure GitLab CI/CD Variables

Go to: **Project Settings → CI/CD → Variables**

Add these variables:

| Variable | Value | Protected | Masked |
|----------|-------|-----------|--------|
| `EC2_HOST` | Your EC2 IP | Yes | No |
| `EC2_USER` | ubuntu | No | No |
| `EC2_SSH_KEY` | Full PEM key content | Yes | Yes |
| `TELEGRAM_BOT_TOKEN` | From @BotFather | Yes | Yes |
| `TELEGRAM_CHAT_ID` | Your chat ID | No | No |
| `ANTHROPIC_API_KEY` | Claude API key | Yes | Yes |
| `OPENAI_API_KEY` | Whisper API key | Yes | Yes |
| `GITLAB_TOKEN` | GitLab access token | Yes | Yes |
| `GITLAB_NAMESPACE` | Your GitLab username | No | No |
| `GITLAB_URL` | https://gitlab.com | No | No |

### Step 3: Launch EC2 Instance

```bash
# AWS Console → EC2 → Launch Instance
# Configuration:
# - Name: nightowl-server
# - OS: Ubuntu 22.04 LTS
# - Instance: t3.large (8GB RAM)
# - Storage: 30GB
# - Security Group:
#   - Port 22 (SSH) - Your IP only
#   - Port 4000 (Dashboard) - Your IP only
#   - Port 3000 (OpenHands) - Your IP only

# Download .pem key
chmod 400 ~/Downloads/nightowl.pem
```

### Step 4: Bootstrap EC2

```bash
# Copy bootstrap script
scp -i ~/Downloads/nightowl.pem \
  scripts/ec2-bootstrap.sh \
  ubuntu@YOUR_EC2_IP:/home/ubuntu/

# SSH and run
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP
chmod +x ec2-bootstrap.sh
./ec2-bootstrap.sh

# The script will:
# 1. Update system packages
# 2. Install Node.js 20
# 3. Install Python + dependencies
# 4. Install Docker
# 5. Install PM2
# 6. Setup OpenHands container
# 7. Generate SSH key for GitLab
```

### Step 5: Add SSH Key to GitLab

```bash
# On EC2, get the public key
cat ~/.ssh/id_rsa.pub

# Copy and add to GitLab:
# GitLab → User Settings → SSH Keys → Add New Key

# Test connection
ssh -T git@gitlab.com
```

### Step 6: Deploy NightOwl

```bash
# From your local machine:

# 1. Copy .env to EC2
scp -i ~/Downloads/nightowl.pem \
  .env \
  ubuntu@YOUR_EC2_IP:/home/ubuntu/nightowl/.env

# 2. Push to GitLab triggers auto-deploy
# Or manually deploy:
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP << 'EOF'
  cd /home/ubuntu/nightowl
  git pull origin main
  npm ci --production
  pm2 reload nightowl-bot || pm2 start src/bot.js --name nightowl-bot
  pm2 reload nightowl-dashboard || pm2 start src/dashboard/server.js --name nightowl-dashboard
  pm2 save
EOF
```

### Step 7: Verify Deployment

```bash
# Check bot logs
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP "pm2 logs nightowl-bot"

# Check dashboard
open http://YOUR_EC2_IP:4000

# Test Telegram
# Send /start to your bot
```

### GitLab CI/CD Flow

```
You push to main branch
        │
        ▼
┌─────────────────────────────────────────┐
│         GitLab CI Pipeline              │
│                                         │
│  Stage 1: lint                          │
│  ├── npm run lint                      │
│  └── node --check                      │
│       │ passes ✅                       │
│       ▼                                 │
│  Stage 2: build                         │
│  ├── docker build                      │
│  └── docker push registry              │
│       │ pushed ✅                       │
│       ▼                                 │
│  Stage 3: deploy                        │
│  ├── rsync files to EC2                │
│  ├── npm ci --production               │
│  └── pm2 reload                        │
│       │ deployed ✅                     │
│       ▼                                 │
│  Stage 4: notify                        │
│  └── Telegram: "Deployed successfully" │
└─────────────────────────────────────────┘
```

---

## 💻 Local Development Guide (Test Before EC2)

Run NightOwl locally to test everything before deploying to EC2.

### Prerequisites for Local Development

```bash
# Required software:
# - Node.js 20+ 
# - Python 3.10+
# - Git
# - FFmpeg (for voice processing)
# - Docker (optional, for OpenHands)

# Check versions
node --version    # v20.x.x
npm --version     # 10.x.x
python3 --version # 3.10+
git --version

# macOS: Install dependencies
brew install node python git ffmpeg

# Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y nodejs python3 python3-pip git ffmpeg
```

### Step 1: Clone Repository Locally

```bash
# Clone to your local machine
git clone https://github.com/ahmed-farahat-pro/agents.git nightowl-local
cd nightowl-local

# Or if you already have it:
cd /Users/ahmedfarahat/Desktop/ai-agent-poc/nightowl
```

### Step 2: Create Local Environment File

```bash
# Copy example environment file
cp .env.example .env

# Edit with your local settings
nano .env  # or use your editor
```

**Minimal `.env` for local testing:**
```bash
# Telegram (from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# AI Providers (choose at least one)
# Option 1: Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_key

# Option 2: Zhipu AI GLM (Chinese models)
ZHIPU_API_KEY=your_zhipu_key

# Option 3: Moonshot AI Kimi (Chinese models, long context)
MOONSHOT_API_KEY=your_moonshot_key

# Voice Processing (OpenAI Whisper)
OPENAI_API_KEY=your_openai_key

# GitLab (for testing integrations)
GITLAB_TOKEN=your_gitlab_token
GITLAB_NAMESPACE=your_gitlab_username
GITLAB_URL=https://gitlab.com

# Local settings
PORT=4000
NODE_ENV=development
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=local_test_password

# Default AI provider (anthropic|zhipu|moonshot)
DEFAULT_AI_PROVIDER=anthropic

# Feature flags
ENABLE_VOICE=true
ENABLE_OPENHANDS=false  # Set true if you have Docker locally
ENABLE_DASHBOARD=true
LOG_LEVEL=debug
LOG_DIR=./logs
```

### Step 3: Install Dependencies

```bash
# Install main app dependencies
npm install

# Verify installation
ls node_modules | head -10
```

### Step 4: Build Custom MCP Servers (Local)

```bash
# Build all MCP servers locally

echo "🔨 Building Arabic RTL Auditor..."
cd mcp-servers/arabic-rtl-auditor
npm install
npm run build
cd ../..

echo "🔨 Building Task Splitter..."
cd mcp-servers/task-splitter
npm install
npm run build
cd ../..

echo "🔨 Building Smart Code Search..."
cd mcp-servers/smart-code-search
npm install
npm run build
cd ../..

echo "✅ All MCP servers built!"
```

**Verify builds:**
```bash
ls mcp-servers/*/dist/index.js
# Should show all 3 compiled servers
```

### Step 5: Run Health Check

```bash
# Test configuration and connections
node scripts/health-check.js

# Expected output:
# ✅ Environment variables loaded
# ✅ Telegram bot token valid
# ✅ Anthropic API key valid
# ✅ MCP servers configured
```

### Step 6: Start the Dashboard (Local)

```bash
# Terminal 1: Start dashboard
npm run dashboard

# Or directly:
node src/dashboard/server.js

# Expected output:
# 🦉 NightOwl Dashboard running on port 4000
# Dashboard URL: http://localhost:4000
```

**Access dashboard:**
- Open browser: `http://localhost:4000`
- You should see the NightOwl dashboard with agent status

### Step 7: Start the Telegram Bot (Local)

```bash
# Terminal 2: Start bot (in new terminal)
npm run dev

# Or directly:
node src/bot.js

# Expected output:
# 🦉 NightOwl Bot starting...
# 🦉 NightOwl Bot is running!
```

### Step 8: Test Locally

#### Test 1: Dashboard
```bash
# Check dashboard is running
curl http://localhost:4000/api/status

# Expected JSON response with agent status
```

#### Test 2: Telegram Bot
```bash
# In Telegram app:
# 1. Find your bot
# 2. Send: /start
# 3. Should receive welcome message

# Test planning:
# Send: /plan Create a simple login API endpoint
```

#### Test 3: MCP Servers
```bash
# Test Arabic RTL Auditor
curl -X POST http://localhost:4000/api/test-mcp \
  -H "Content-Type: application/json" \
  -d '{
    "server": "arabic-rtl-auditor",
    "tool": "check_rtl_compliance",
    "args": {
      "code": ".button { margin-left: 10px; }",
      "language": "css"
    }
  }'
```

### Step 9: Run Tests (if available)

```bash
# Run unit tests
npm test

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

### Step 10: Local Development Workflow

```bash
# Terminal 1: Dashboard (keep running)
npm run dashboard

# Terminal 2: Bot with auto-reload (keep running)
npm run dev

# Terminal 3: Make changes and test
# Edit files in src/
# Bot will auto-reload on changes

# Terminal 4: MCP development
cd mcp-servers/arabic-rtl-auditor
npm run dev  # Watch mode for TypeScript
```

### Common Local Issues & Fixes

#### Issue: Port 4000 already in use
```bash
# Find what's using port 4000
lsof -i :4000

# Kill the process
kill -9 <PID>

# Or use different port
PORT=4001 npm run dashboard
```

#### Issue: MCP servers not found
```bash
# Check paths in config/mcp-servers.json
cat config/mcp-servers.json | grep arabic-rtl-auditor

# Rebuild MCP servers
cd mcp-servers/arabic-rtl-auditor && npm run build
cd mcp-servers/task-splitter && npm run build
cd mcp-servers/smart-code-search && npm run build
```

#### Issue: Environment variables not loading
```bash
# Check .env file exists
ls -la .env

# Debug environment
node -e "console.log(require('dotenv').config())"

# Load manually
export $(cat .env | xargs)
```

#### Issue: Voice processing not working
```bash
# Check FFmpeg
ffmpeg -version

# Test voice module
node -e "require('./src/tools/voice').speechToText('test.wav').then(console.log)"
```

#### Issue: Cannot connect to Telegram
```bash
# Test internet connection
ping api.telegram.org

# Check bot token
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

### Local Testing Checklist

Before pushing to EC2, verify locally:

- [ ] `npm install` completes without errors
- [ ] All MCP servers build successfully (`npm run build` in each)
- [ ] Dashboard starts and accessible at `http://localhost:4000`
- [ ] Telegram bot responds to `/start`
- [ ] `/plan` command creates implementation plan
- [ ] MCP tools work (check RTL auditor, task splitter)
- [ ] No errors in console logs
- [ ] Dashboard shows agent status correctly
- [ ] Environment variables loaded correctly

### Transition from Local to EC2

Once local testing passes:

```bash
# 1. Commit changes
git add -A
git commit -m "feat: your feature description"

# 2. Push to GitHub (creates PR due to branch protection)
git push origin feature/your-branch

# 3. Create PR and merge on GitHub
# Go to: https://github.com/ahmed-farahat-pro/agents/pulls

# 4. Deploy to EC2 (after merge)
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP
cd /home/ubuntu/nightowl
git pull origin main
npm install
# Build MCP servers on EC2
cd mcp-servers/arabic-rtl-auditor && npm install && npm run build && cd ../..
cd mcp-servers/task-splitter && npm install && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm install && npm run build && cd ../..
pm2 restart all
```

---

## 🚀 Complete EC2 Deployment Guide (Step-by-Step)

This guide walks you through setting up NightOwl on AWS EC2 from scratch, including building custom MCP servers and running the agent dashboard.

### Prerequisites

- AWS account with EC2 access
- GitHub account (for this repo)
- Telegram bot token (from @BotFather)
- API keys: Anthropic (Claude), OpenAI (Whisper), GitLab
- SSH key pair for EC2

---

### Step 1: Launch EC2 Instance

```bash
# AWS Console → EC2 → Launch Instance

# Configuration:
# ┌─────────────────────────────────────────┐
# │ Name: nightowl-server                   │
# │ OS: Ubuntu 22.04 LTS                    │
# │ Instance Type: t3.large (2 vCPU, 8GB)   │
# │ Storage: 30GB gp3                       │
# │ Key Pair: Create new or use existing    │
# └─────────────────────────────────────────┘

# Security Group Rules:
# ┌──────────┬──────────┬──────────────┬─────────────────┐
# │ Type     │ Port     │ Source       │ Purpose         │
# ├──────────┼──────────┼──────────────┼─────────────────┤
# │ SSH      │ 22       │ Your IP      │ SSH access      │
# │ Custom   │ 4000     │ Your IP      │ Dashboard       │
# │ Custom   │ 3000     │ Your IP      │ OpenHands       │
# └──────────┴──────────┴──────────────┴─────────────────┘

# Download .pem key and set permissions:
chmod 400 ~/Downloads/nightowl.pem
```

---

### Step 2: Connect to EC2 & Install Dependencies

```bash
# SSH into your EC2 instance
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install Python and dependencies
sudo apt-get install -y python3 python3-pip ffmpeg

# Install PM2 globally
sudo npm install -g pm2

# Install Docker
sudo apt-get install -y docker.io
sudo usermod -aG docker ubuntu

# Install Git
sudo apt-get install -y git

# Logout and login again for Docker group to take effect
exit
ssh -i ~/Downloads/nightowl.pem ubuntu@YOUR_EC2_IP
```

---

### Step 3: Clone Repository

```bash
# Create workspace directory
mkdir -p /home/ubuntu/workspace
cd /home/ubuntu

# Clone NightOwl repository
git clone https://github.com/ahmed-farahat-pro/agents.git nightowl
cd nightowl

# Verify structure
ls -la
# Should see: src/, config/, mcp-servers/, scripts/, etc.
```

---

### Step 4: Install Dependencies

```bash
cd /home/ubuntu/nightowl

# Install main app dependencies
npm install

# Verify installation
ls -la node_modules/ | head -10
```

---

### Step 5: Build Custom MCP Servers

```bash
cd /home/ubuntu/nightowl

# Build Arabic RTL Auditor MCP
cd mcp-servers/arabic-rtl-auditor
npm install
npm run build

# Verify build
ls -la dist/
# Should see: index.js, index.d.ts, etc.

cd /home/ubuntu/nightowl

# Build Task Splitter MCP
cd mcp-servers/task-splitter
npm install
npm run build

ls -la dist/

cd /home/ubuntu/nightowl

# Build Smart Code Search MCP
cd mcp-servers/smart-code-search
npm install
npm run build

ls -la dist/

cd /home/ubuntu/nightowl

echo "✅ All MCP servers built successfully!"
```

---

### Step 6: Create Environment File

```bash
cd /home/ubuntu/nightowl

# Copy example env
cp .env.example .env

# Edit with your actual values
nano .env

# Required variables to set:
# ─────────────────────────────────────────────────
# TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
# TELEGRAM_CHAT_ID=your_chat_id_from_userinfobot
# ANTHROPIC_API_KEY=your_claude_api_key
# OPENAI_API_KEY=your_openai_api_key_for_whisper
# GITLAB_TOKEN=your_gitlab_personal_access_token
# GITLAB_NAMESPACE=your_gitlab_username
# GITLAB_URL=https://gitlab.com
# DASHBOARD_PORT=4000
# DASHBOARD_PASSWORD=secure_password_here
# ENABLE_VOICE=true
# ENABLE_DASHBOARD=true
# LOG_LEVEL=info
# ─────────────────────────────────────────────────

# Save and exit (Ctrl+X, Y, Enter)
```

---

### Step 7: Setup OpenHands (Code Sandbox)

```bash
# Pull OpenHands Docker image
docker pull ghcr.io/opendevin/opendevin:latest

# Create OpenHands systemd service
sudo tee /etc/systemd/system/openhands.service > /dev/null << 'EOF'
[Unit]
Description=OpenHands Code Sandbox
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm \
  -p 3000:3000 \
  -v /home/ubuntu/workspace:/workspace \
  -e SANDBOX_TYPE=exec \
  -e LLM_MODEL=claude-3-sonnet-20240229 \
  -e LLM_API_KEY=${ANTHROPIC_API_KEY} \
  ghcr.io/opendevin/opendevin:latest
ExecStop=/usr/bin/docker stop -t 10 $(/usr/bin/docker ps -q --filter ancestor=ghcr.io/opendevin/opendevin:latest)

[Install]
WantedBy=multi-user.target
EOF

# Start OpenHands
sudo systemctl daemon-reload
sudo systemctl enable openhands
sudo systemctl start openhands

# Verify OpenHands is running
curl http://localhost:3000
```

---

### Step 8: Configure GitLab SSH Access

```bash
# Generate SSH key for GitLab
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "nightowl@ec2"

# Display public key
cat ~/.ssh/id_rsa.pub
# Copy this key!

# Add to GitLab:
# 1. Go to GitLab → User Settings → SSH Keys
# 2. Paste the key
# 3. Title: "NightOwl EC2"
# 4. Add key

# Test GitLab connection
ssh -T git@gitlab.com
# Should see: "Welcome to GitLab, @username!"
```

---

### Step 9: Start NightOwl Bot

```bash
cd /home/ubuntu/nightowl

# Start bot with PM2
pm2 start src/bot.js --name nightowl-bot

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# Check bot status
pm2 status
pm2 logs nightowl-bot --lines 20
```

**Expected output:**
```
[PM2] Starting nightowl-bot in fork_mode (1 instance)
[PM2] Done.
┌─────┬──────────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id  │ name             │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├─────┼──────────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0   │ nightowl-bot     │ default     │ 1.0.0   │ fork    │ 12345    │ 5s     │ 0    │ online    │ 0.5%     │ 85.2mb   │ ubuntu   │ disabled │
└─────┴──────────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

---

### Step 10: Start NightOwl Dashboard

```bash
cd /home/ubuntu/nightowl

# Start dashboard with PM2
pm2 start src/dashboard/server.js --name nightowl-dashboard

# Save PM2 config
pm2 save

# Check dashboard status
pm2 status nightowl-dashboard
pm2 logs nightowl-dashboard --lines 20
```

**Expected output:**
```
🦉 NightOwl Dashboard running on port 4000
Dashboard URL: http://localhost:4000
```

---

### Step 11: Access the Dashboard

```bash
# Get your EC2 public IP
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "Dashboard URL: http://$EC2_IP:4000"
```

**Open browser:** `http://YOUR_EC2_IP:4000`

**Dashboard Features:**
- Real-time agent activity streaming
- Live code edits with syntax highlighting
- Agent-to-agent communication log
- Task queue with progress bars
- Connection status indicator

---

### Step 12: Test Telegram Bot

1. **Open Telegram** on your phone
2. **Find your bot** (the one you created with @BotFather)
3. **Send:** `/start`
4. **Expected response:**
   ```
   🦉 Welcome to NightOwl!
   
   Your personal AI development team...
   ```

5. **Test voice:** Send a voice note in Arabic or English
6. **Test command:** `/plan Add user authentication to the API`

---

### Step 13: Verify Everything Works

```bash
# Check all services are running
echo "=== PM2 Processes ==="
pm2 status

echo "=== OpenHands Container ==="
docker ps | grep opendevin

echo "=== Ports Listening ==="
netstat -tlnp | grep -E '(:4000|:3000)'

echo "=== Disk Space ==="
df -h

echo "=== Memory Usage ==="
free -h
```

---

### Step 14: Setup Auto-Start on Boot

```bash
# PM2 startup script already created
# Verify it's enabled
sudo systemctl status pm2-ubuntu

# If not enabled:
sudo systemctl enable pm2-ubuntu
sudo systemctl start pm2-ubuntu

# OpenHands already enabled via systemd
sudo systemctl status openhands
```

---

### Daily Operations

```bash
# View logs
pm2 logs nightowl-bot
pm2 logs nightowl-dashboard

# Restart services
pm2 restart nightowl-bot
pm2 restart nightowl-dashboard

# Monitor resources
pm2 monit

# Update code and restart
cd /home/ubuntu/nightowl
git pull origin main
npm install
pm2 restart all
```

---

### Troubleshooting Common Issues

#### Issue: Dashboard not accessible
```bash
# Check firewall
sudo ufw status
sudo ufw allow 4000/tcp

# Check security group in AWS Console
# Ensure port 4000 is open to your IP

# Check if dashboard is listening
netstat -tlnp | grep 4000
```

#### Issue: Bot not responding
```bash
# Check logs
pm2 logs nightowl-bot --lines 50

# Verify environment variables
grep TELEGRAM .env

# Test Telegram connection
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

#### Issue: MCP servers not working
```bash
# Check if built properly
ls -la mcp-servers/*/dist/

# Check paths in config
cat config/mcp-servers.json | grep -A3 "arabic-rtl-auditor"

# Rebuild if needed
cd mcp-servers/arabic-rtl-auditor && npm run build
```

#### Issue: Out of memory
```bash
# Monitor memory
watch -n 2 free -h

# Increase swap
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

### Security Checklist

- [ ] Security Group: Port 22 restricted to your IP only
- [ ] Security Group: Port 4000 restricted to your IP only
- [ ] `.env` file has correct permissions: `chmod 600 .env`
- [ ] Dashboard has password protection
- [ ] SSH key authentication only (no password login)
- [ ] Regular security updates: `sudo apt-get update && sudo apt-get upgrade`

---

### Complete File Structure on EC2

```
/home/ubuntu/
├── nightowl/                    # Main application
│   ├── src/
│   │   ├── bot.js              # Telegram bot entry
│   │   ├── dashboard/          # Web dashboard
│   │   │   └── server.js       # Dashboard server
│   │   ├── agents/             # 7 AI agents
│   │   ├── autogen/            # AutoGen integration
│   │   ├── mcp/                # MCP client manager
│   │   └── tools/              # External tools
│   ├── mcp-servers/            # Custom MCP servers
│   │   ├── arabic-rtl-auditor/
│   │   │   ├── src/index.ts
│   │   │   └── dist/           # Built files
│   │   ├── task-splitter/
│   │   │   └── dist/
│   │   └── smart-code-search/
│   │       └── dist/
│   ├── config/
│   │   ├── agents.json         # Agent configs
│   │   └── mcp-servers.json    # MCP server configs
│   ├── .env                    # Environment variables
│   ├── package.json
│   └── logs/                   # PM2 logs
├── workspace/                  # OpenHands workspace
└── .ssh/
    └── id_rsa                  # GitLab SSH key
```

---

### Next Steps After Deployment

1. **Test your first task:**
   ```
   Telegram: /plan Add a simple API endpoint
   ```

2. **Watch the dashboard:** Open `http://EC2_IP:4000` and see agents work

3. **Review the MR:** Check GitLab for the automatically created Merge Request

4. **Iterate:** Refine your prompts based on results

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Show welcome and commands |
| `/plan <task>` | Create implementation plan |
| `/approve` | Queue plan for overnight |
| `/run` | Start now |
| `/ask <question>` | Ask about code |
| `/status` | View queue |
| `/queue` | List queued tasks |
| `/standup` | Daily report |
| `/meet <agent>` | Chat with agent |
| `/repos` | List GitLab repositories |
| `/costs` | API costs |
| `/cancel <id>` | Cancel task |
| `/logs <agent>` | View agent logs |
| **Voice** | Send voice notes |

---

## Web Dashboard

The NightOwl Dashboard provides real-time visibility into agent activities:

### Features

- **Real-time streaming** - See code being typed line by line
- **Agent communication** - Watch agents talk to each other
- **Code diffs** - See additions (+) and deletions (-)
- **Progress bars** - Track task completion
- **Live status** - Which agent is working on what

### Dashboard UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ NightOwl AI Development Team              ● Connected       │
├───────────────┬───────────────────────────┬─────────────────┤
│               │                           │                 │
│   AGENTS      │    LIVE ACTIVITY          │  AGENT COMM     │
│               │                           │                 │
│ ┌───────────┐ │                           │ Planner ->      │
│ │Orchestratr│ │  [10:05:23] Planner       │ Backend: Task   │
│ │ [WORKING] │ │  Creating plan...         │ delegated       │
│ └───────────┘ │                           │                 │
│ ┌───────────┐ │  [10:06:45] Backend Dev   ├─────────────────┤
│ │Backend Dev│ │  Writing PaymentService   │  TASK QUEUE     │
│ │ [WORKING] │ │                           │                 │
│ └───────────┘ │  [10:07:12] Code Edit:    │ ┌─────────────┐ │
│ ┌───────────┐ │  PaymentController.java   │ │ Add webhook │ │
│ │QA Tester  │ │                           │ │ Status: 75% │ │
│ │ [IDLE]    │ │  + @PostMapping           │ │ ████████░░  │ │
│ └───────────┘ │  + public Response...     │ └─────────────┘ │
│               │                           │                 │
│  Stats:       │  Live Code Stream:        │                 │
│  Active: 2    │  Backend Dev editing      │                 │
│  Done: 5      │  OrderService.java        │                 │
│               │                           │                 │
└───────────────┴───────────────────────────┴─────────────────┘
```

---

## Dashboard API

The dashboard exposes REST endpoints for agent communication:

### Status Endpoints

```
GET  /api/status     # System status overview
GET  /api/agents     # List all agents with status
GET  /api/tasks      # List all tasks
GET  /api/activity   # Recent activity (last 100)
```

### Update Endpoints

```
POST /api/agents/:name/status       # Update agent status
POST /api/code-edit                 # Stream code edit
POST /api/agent-communication       # Log agent message
POST /api/tasks                     # Create new task
PUT  /api/tasks/:id/progress        # Update task progress
```

### Socket.io Events

```javascript
// Client receives
socket.on('init', (state) => {});           // Full state on connect
socket.on('agentStatus', (data) => {});     // Agent status change
socket.on('activity', (data) => {});        // New activity
socket.on('codeEdit', (data) => {});        // Code edit streaming
socket.on('agentCommunication', (data) => {}); // Agent chat
socket.on('task', (data) => {});            // Task update

// Client sends
socket.emit('requestStatus');               // Request full state
socket.emit('chat', { agent, message });    // Send chat message
```

---

## Voice Processing

NightOwl supports voice commands in Arabic and English:

### Voice Flow

```
User sends voice note
        ↓
Telegram Bot downloads OGG
        ↓
FFmpeg converts to WAV
        ↓
OpenAI Whisper transcribes
        ↓
Language detection (ar/en)
        ↓
Text processed as command
        ↓
Response sent as:
  - Text message
  - Voice response (gTTS)
```

### Voice Configuration

```bash
# Enable/disable voice
ENABLE_VOICE=true

# Supported languages
- Arabic (ar)
- English (en)
```

---

## AutoGen Group Chat

NightOwl uses Microsoft AutoGen for multi-agent coordination:

### Group Chat Features

- **Message Routing** - Agents can @mention each other
- **Task Delegation** - Orchestrator delegates to specialists
- **Issue Reporting** - Agents report problems with severity
- **Help Requests** - Agents can ask for clarification
- **Completion Reports** - Agents report task completion

### AutoGen Message Types

```javascript
// Task Delegation
@backend-dev Please implement the payment webhook

// Issue Report
@orchestrator CRITICAL: Security issue found

// Help Request
@planner I need clarification on the API auth flow

// Completion Report
@orchestrator Task completed successfully
```

### Code Location

```
src/autogen/
├── group-chat.js    # Main AutoGen integration
└── index.js         # Exports
```

---

## Troubleshooting

### Bot not responding

```bash
# Check if running
pm2 status

# Check logs
pm2 logs nightowl-bot

# Restart
pm2 restart nightowl-bot
```

### Dashboard not loading

```bash
# Check if port is open
sudo ufw allow 4000

# Check if running
pm2 logs nightowl-dashboard

# Restart
pm2 restart nightowl-dashboard
```

### GitLab connection failed

```bash
# Test connection
node -e "require('./src/tools/gitlab').testConnection().then(console.log)"

# Check SSH key
cat ~/.ssh/id_rsa.pub
# Add to GitLab → Settings → SSH Keys

# Test SSH
ssh -T git@gitlab.com
```

### MCP server errors

```bash
# Check MCP config
cat config/mcp-servers.json

# Restart with MCP debugging
DEBUG=mcp npm run dev
```

### Voice not working

```bash
# Check FFmpeg
ffmpeg -version

# Check OpenAI API key
echo $OPENAI_API_KEY

# Test voice processing
node -e "require('./src/tools/voice').speechToText('test.wav').then(console.log)"
```

### Out of memory

```bash
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory
pm2 monit
```

---

## 🔑 API Keys Required

NightOwl requires several API keys to function. Here's the complete list:

### Required Keys (Choose Your AI Provider)

NightOwl supports multiple AI providers. You need at least **one** AI provider configured:

#### Option 1: Anthropic Claude (Recommended for English)
| Key | Source | Purpose | Get It From |
|-----|--------|---------|-------------|
| **ANTHROPIC_API_KEY** | Anthropic Console | Claude AI models | [console.anthropic.com](https://console.anthropic.com) |

**Models Available:**
- `claude-3-opus` - Most capable, best for complex tasks
- `claude-3-sonnet` - Balanced performance and cost
- `claude-3-haiku` - Fastest, most cost-effective

#### Option 2: Zhipu AI GLM (Best for Chinese)
| Key | Source | Purpose | Get It From |
|-----|--------|---------|-------------|
| **ZHIPU_API_KEY** | Zhipu AI Open Platform | GLM AI models | [open.bigmodel.cn](https://open.bigmodel.cn) |

**Models Available:**
- `glm-4` - General purpose
- `glm-4-plus` - Enhanced capabilities
- `glm-4v` - Vision capabilities
- `glm-5` - Latest generation
- `glm-5-plus` - Most capable GLM model

#### Option 3: Moonshot AI Kimi (Good for Chinese & Long Context)
| Key | Source | Purpose | Get It From |
|-----|--------|---------|-------------|
| **MOONSHOT_API_KEY** | Moonshot Platform | Kimi AI models | [platform.moonshot.cn](https://platform.moonshot.cn) |

**Models Available:**
- `kimi-2.5` - Balanced performance
- `kimi-2.5-32k` - 32K context window
- `kimi-2.5-128k` - 128K context window
- `kimi-k2` - Latest Kimi model
- `kimi-k2-plus` - Enhanced Kimi model

### Required Keys (All Setups)

| Key | Source | Purpose | Get It From |
|-----|--------|---------|-------------|
| **TELEGRAM_BOT_TOKEN** | Telegram BotFather | Bot authentication | Message [@BotFather](https://t.me/BotFather) → `/newbot` |
| **TELEGRAM_CHAT_ID** | Telegram User Info | Your user ID | Message [@userinfobot](https://t.me/userinfobot) |
| **OPENAI_API_KEY** | OpenAI Platform | Whisper voice transcription | [platform.openai.com](https://platform.openai.com) |
| **GITLAB_TOKEN** | GitLab Settings | GitLab API access | GitLab → User Settings → Access Tokens |

### Optional Keys (Enhanced Features)

| Key | Source | Purpose | When Needed |
|-----|--------|---------|-------------|
| **BRAVE_API_KEY** | Brave Search | Web search capability | If using web search MCP |
| **FIGMA_ACCESS_TOKEN** | Figma | Design specs integration | If working with Figma designs |
| **SLACK_BOT_TOKEN** | Slack API | Slack notifications | If using Slack integration |
| **NOTION_TOKEN** | Notion | Documentation export | If using Notion integration |
| **GITHUB_TOKEN** | GitHub | GitHub repo editing | If editing GitHub repos |
| **SENTRY_AUTH_TOKEN** | Sentry | Error tracking | If using Sentry MCP |

### How to Get Each Key

#### 1. Telegram Bot Token
```
1. Open Telegram
2. Search for @BotFather
3. Send /newbot
4. Follow instructions
5. Copy the token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
```

#### 2. Telegram Chat ID
```
1. Open Telegram
2. Search for @userinfobot
3. Start the bot
4. It will reply with your ID (e.g., 123456789)
```

#### 3. Anthropic API Key (Claude)
```
1. Go to https://console.anthropic.com
2. Sign up / Sign in
3. Go to "API Keys"
4. Click "Create Key"
5. Copy the key (starts with sk-ant-)
```

#### 4. OpenAI API Key (Whisper)
```
1. Go to https://platform.openai.com
2. Sign up / Sign in
3. Go to "API Keys"
4. Click "Create new secret key"
5. Copy the key (starts with sk-)
```

#### 5. Zhipu AI API Key (Optional - for GLM models)
```
1. Go to https://open.bigmodel.cn
2. Sign up / Sign in with phone number
3. Go to "API Keys" (API密钥管理)
4. Click "Create API Key" (创建API密钥)
5. Copy the key (starts with your user ID)

Note: Zhipu AI requires Chinese phone verification
Pricing: ¥0.005-0.1 per 1K tokens depending on model
```

#### 6. Moonshot AI API Key (Optional - for Kimi models)
```
1. Go to https://platform.moonshot.cn
2. Sign up / Sign in
3. Go to "API Key Management" (API密钥管理)
4. Click "Create Key" (创建密钥)
5. Copy the key

Note: Moonshot AI requires Chinese phone verification
Pricing: ¥0.012-0.024 per 1K tokens depending on model
```

#### 7. GitLab Token
```
1. Go to GitLab.com
2. Click your avatar → Edit Profile
3. Left sidebar → Access Tokens
4. Click "Add new token"
5. Name: "NightOwl"
6. Scopes: api, read_repository, write_repository
7. Click "Create personal access token"
8. Copy the token immediately!
```

### Environment File Setup

Create `.env` file with all keys:

```bash
# Required - NightOwl won't work without these
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
OPENAI_API_KEY=sk-your_openai_key_here
GITLAB_TOKEN=glpat-your_gitlab_token_here
GITLAB_NAMESPACE=your_gitlab_username
GITLAB_URL=https://gitlab.com

# Server Configuration
PORT=4000
NODE_ENV=development
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=your_secure_password

# Feature Flags
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=true
LOG_LEVEL=info
```

### Cost Estimates

| Service | Free Tier | Paid Usage | Typical Monthly Cost |
|---------|-----------|------------|---------------------|
| **Anthropic Claude** | $5 credit | $3-8 per task | $50-200/month |
| **Zhipu AI GLM** | ¥100 credit | ¥0.005-0.1/1K tokens | $20-80/month |
| **Moonshot AI Kimi** | ¥100 credit | ¥0.012-0.024/1K tokens | $30-100/month |
| **OpenAI Whisper** | $18 credit | $0.006/minute | $5-20/month |
| **GitLab** | Free tier | Free for personal | $0 |
| **Telegram Bot** | Unlimited | Free | $0 |

**Total estimated cost:** 
- Claude only: $55-220/month
- Zhipu AI only: $25-100/month (good for Chinese)
- Moonshot only: $35-120/month (good for long context)
- Mixed usage: $50-200/month

---

## 🎨 Dashboard Features

The NightOwl Dashboard provides comprehensive control over your AI agent team:

### Dashboard Views

| View | Description |
|------|-------------|
| **Dashboard** | Overview with live activity, stats, and system status |
| **Agents** | Grid view of all 7 agents with status and configuration |
| **Agent Detail** | Individual agent settings, model config, MCP tools, statistics |
| **Tasks** | Task queue with filtering (pending, running, completed, failed) |
| **Activity** | Full activity log with filtering and export |
| **MCP Tools** | Status and configuration for all 38 MCP tools |
| **Settings** | General settings, API configuration, feature toggles |
| **Logs** | System logs with level filtering |

### Agent Configuration Panel

Each agent can be configured individually:
- **Model Selection**: Claude Opus/Sonnet/Haiku
- **Max Tokens**: Adjust response length
- **Temperature**: Control creativity (0-1)
- **System Prompt**: Customize agent behavior
- **MCP Tools**: Enable/disable specific tools
- **Statistics**: Tasks completed, API calls, success rate

### MCP Tools Management

View and manage all 38 MCP tools:
- Core: filesystem, git, gitlab, postgresql
- Custom: arabic-rtl-auditor, task-splitter, smart-code-search
- External: brave-search, docker, puppeteer, etc.

---

**NightOwl — Sleep well. Code better.** 🦉🌙
