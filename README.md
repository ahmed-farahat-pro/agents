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

## API Keys Required

| Key | Source | Purpose |
|-----|--------|---------|
| `TELEGRAM_BOT_TOKEN` | @BotFather | Telegram bot authentication |
| `TELEGRAM_CHAT_ID` | @userinfobot | Your Telegram chat ID |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Claude AI models |
| `OPENAI_API_KEY` | platform.openai.com | Whisper voice transcription |
| `GITLAB_TOKEN` | GitLab → Settings → Access Tokens | GitLab API access |

### Optional Keys

| Key | Source | Purpose |
|-----|--------|---------|
| `BRAVE_API_KEY` | brave.com/search/api | Web search |
| `FIGMA_ACCESS_TOKEN` | Figma → Settings | Design specs |
| `SLACK_BOT_TOKEN` | Slack API | Notifications |
| `NOTION_TOKEN` | Notion integrations | Documentation |

---

**NightOwl — Sleep well. Code better.** 🦉🌙
