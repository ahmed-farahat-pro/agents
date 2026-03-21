# 🌙 Nigents — Night Agents for GitLab

> **Send a task on Telegram before you sleep. Wake up to a finished Merge Request.**

Your personal AI development company running on AWS EC2. 7 specialized agents collaborate overnight to plan, code, test, review, and ship features to **GitLab** — while you sleep.

---

## Table of Contents

1. [🚀 Quick Setup](#-quick-setup)
2. [What is Nigents?](#what-is-nigents)
3. [Steps and workflow (current)](#steps-and-workflow-current)
4. [How the app works: repo access, OpenHands, agents, end-to-end](#how-the-app-works-repo-access-openhands-agents-end-to-end)
5. [What is OpenHands?](#what-is-openhands)
6. [The 7-Agent Team](#the-7-agent-team)
7. [App Flow & Workflow](#app-flow--workflow)
8. [MCP Servers](#mcp-servers)
9. [Custom MCP Servers We Built](#custom-mcp-servers-we-built)
10. [Telegram Integration](#telegram-integration)
11. [Dashboard Features](#dashboard-features)
12. [Multi-User Support & Admin](#multi-user-support--admin)
13. [Tech Stack](#tech-stack)
14. [Future work](#future-work)
15. [💰 Nigents Cloud (Coming Soon)](#-nigents-cloud-coming-soon)
16. [Quick Start (Local)](#quick-start-local)
17. [Deploy on AWS EC2](#deploy-on-aws-ec2)
18. [Configuration](#configuration)
19. [MySQL Database Configuration](#mysql-database-configuration)
20. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Setup

Get Nigents running in **5 minutes** with our automated setup scripts.

### Option 1: One-Command EC2 Setup (Recommended)

```bash
# SSH to your fresh Ubuntu 22.04 EC2 instance
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Run automated setup
curl -fsSL https://gitlab.com/bonyad-tech/nigents/-/raw/main/scripts/setup-ec2.sh | bash

# Edit environment variables
nano /home/ubuntu/nightowl/.env

# Start services
pm2 start src/bot.js --name nigents-bot
pm2 start src/dashboard/server.js --name nigents-dashboard
pm2 save
```

### Option 2: Docker (Coming Soon)

```bash
# One-line Docker deployment (coming in v2.0)
docker run -d \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e GITLAB_TOKEN=your_token \
  -p 4000:4000 \
  bonyadtech/nigents:latest
```

### Option 3: GitLab CI/CD Auto-Deploy

```bash
# Fork this repo to your GitLab
# Add CI/CD variables (EC2_HOST, EC2_SSH_KEY)
# Push to main - automatic deployment!

git clone https://gitlab.com/bonyad-tech/nigents.git
cd nigents
git remote add gitlab https://gitlab.com/YOUR_USERNAME/nigents.git
git push gitlab main
```

### What Gets Installed?


| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20.x | Runtime |
| PM2 | Latest | Process Manager |
| Nginx | Latest | Reverse Proxy |
| Certbot | Latest | SSL Certificates |
| 7 AI Agents | - | Development Team |
| 38 MCP Tools | - | Agent Capabilities |

**⏱️ Total Setup Time: ~5 minutes**

---

## 🌐 Using Nigents with Your Own GitLab

Nigents is **100% open source**. Use it with your own GitLab instance:

### Step 1: Fork & Configure

```bash
# Fork this repository to your GitLab account
# Go to: https://gitlab.com/bonyad-tech/nigents → Fork

# Or clone and push to your own repo
git clone https://gitlab.com/bonyad-tech/nigents.git my-nigents
cd my-nigents
git remote set-url origin https://gitlab.com/YOUR_USERNAME/my-nigents.git
git push -u origin main
```

### Step 2: Setup CI/CD (Optional but Recommended)

1. Go to your forked repo → **Settings** → **CI/CD** → **Variables**
2. Add these variables:

| Variable | Type | Description |
|----------|------|-------------|
| `EC2_HOST` | Variable | Your server IP |
| `EC2_SSH_KEY` | File | SSH private key |
| `TELEGRAM_BOT_TOKEN` | Variable | From @BotFather |
| `TELEGRAM_CHAT_ID` | Variable | Your Telegram ID |

3. Push to `main` branch → Auto-deploys to your server!

### Step 3: Configure Your Environment

```bash
# On your server
nano /home/ubuntu/nightowl/.env

# Edit these for your setup:
GITLAB_TOKEN=glpat-your_token
GITLAB_NAMESPACE=your_username_or_group
GITLAB_URL=https://gitlab.com  # Or your self-hosted GitLab
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Self-Hosted GitLab Support

Nigents works with self-hosted GitLab too:

```env
GITLAB_URL=https://gitlab.yourcompany.com
GITLAB_TOKEN=glpat-your_token
GITLAB_NAMESPACE=your-group
```

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
| 🔀 **GitLab Integration** | Clone selected repo, edit on **task branch** (`plan.branch`), push to GitLab; MR = task branch → default branch |
| 🐳 **Code Sandbox** | OpenHands for Backend Dev when available; else **repo-clone-push** (clone repo, write files, push to task branch) or GitLab API fallback |

---

## Steps and workflow (current)

End-to-end flow from Telegram to Merge Request. **All implementation uses the selected GitLab repo and the task’s branch** (`plan.branch`); the app does not edit a different repo or branch.

### 1. Plan

- User sends **/plan** &lt;task&gt; (or voice) in Telegram.
- Bot may ask for **project** (GitLab repo); user picks from list or confirms.
- **Planner** creates an implementation plan: **steps** with file paths; **branch** `plan.branch` (e.g. `nigents/task-<timestamp>`), the task branch used everywhere; **primaryStack** (`frontend` / `backend` / `fullstack`) from step files, which decides Frontend Dev vs Backend Dev.
- Bot shows the plan with **“Who does what”** and step details; user sees **Reply with /approve**.

### 2. Approve and run

- User replies **/approve** (or clicks Approve).
- **Orchestrator** sets **task.branch = plan.branch**, then runs: Implementer (Frontend or Backend Dev) → QA Tester → Code Reviewer.

### 3. Implementation (fetch repo → edit → push to task branch)

All work uses the **selected GitLab repo** and **task branch** (`plan.branch`).

- **Who implements**: Frontend-only plans → **Frontend Dev**; else **Backend Dev**.
- **Backend Dev**: If **OpenHands** is available: clones plan’s repo, creates branch **plan.branch**, implements only plan-listed files (frontend-only = no Java/backend), commits and **pushes to GitLab**. If **OpenHands** is unavailable: generates code per step, then **repo-clone-push** (clone same repo to temp dir, branch **plan.branch**, write files, commit, push); if that fails, fallback to GitLab Commits API.
- **Frontend Dev**: Generates frontend code per step, then **repo-clone-push** (clone plan’s repo, branch **plan.branch**, write files, commit, push). No OpenHands.
- **Progress**: Reporter sends e.g. “Cloning repo and creating branch `nigents/task-xxx`…”, “Editing `src/components/Login.css` on branch `nigents/task-xxx`”, “Pushing branch `nigents/task-xxx` to GitLab…”.
- **QA Tester** runs tests (or simulates when OpenHands is down).
- **Code Reviewer** reviews (diff = task branch vs repo default branch).

### 4. Merge request

- Orchestrator checks that the **task branch** exists on GitLab (pushed by OpenHands, by clone/edit/push, or by GitLab Commits API if clone/push failed).
- Creates **Merge Request**: **source branch = task branch** (`plan.branch`), **target branch = repo default** (e.g. `main` or `master`, from GitLab API). Sends the MR link in Telegram.
- Pipeline status (pass/fail/running) is reported for **the repo that was edited** (the project you selected in /plan), not the Nigents repo. To avoid pipeline failures after merge, configure **each GitLab repo you use with Nigents** with: (1) CI that runs on MR branches (e.g. `nigents/task-*`), and (2) protected main with “Pipelines must succeed.” See [OPERATIONS.md](OPERATIONS.md#ensure-pipeline-passes-before-merge-all-repos-nigents-uses).

### 5. Dashboard (after login)

- **All data is from the backend (MySQL)** when DB is configured: tasks, agents, activities. No dummy data.
- Socket and REST APIs load from MySQL; on DB error the UI gets empty lists, not stale in-memory state.
- Creating/updating tasks (e.g. from the dashboard) persists to MySQL when enabled.

### Summary diagram

```
Telegram /plan → Select project → Plan (steps, branch, primaryStack) → /approve
    → task.branch = plan.branch
    → Frontend Dev (if frontend-only) else Backend Dev
        → OpenHands: clone repo → branch plan.branch → edit → push
        → No OpenHands: clone repo (repo-clone-push) → branch plan.branch → write files → push
        → (If push failed: GitLab Commits API to create branch with files)
    → QA → Code Reviewer (diff: task branch vs default branch)
    → Create MR (sourceBranch = task branch, targetBranch = default)
    → MR link to user

Dashboard: Login → Data from MySQL only (tasks, agents, activities)
```

---

## How the app works: repo access, OpenHands, agents, end-to-end

This section describes **how each agent sees repo files**, **how OpenHands is used**, **how agents work together**, and the **exact steps from /plan to branch pushed**.

### How repo files are viewed by each agent

| Agent | How it sees the repo / files | Source |
|-------|------------------------------|--------|
| **Planner** | **Repo structure** (list of file paths, e.g. up to 100 files), **relevant files** (paths matching task keywords), and **contents** of up to 5 relevant files (e.g. first 3000 chars each). Used to build the plan (steps, which files to create/modify). | **MCP filesystem** (if project is cloned at `/workspace/repos/<project>`): `list_directory`, `read_file`. **Fallback: GitLab API**: `getRepositoryFiles(project, 100)`, `getFileContent(project, filePath)` for relevant files. |
| **Backend Dev (OpenHands)** | **Full clone** of the plan’s GitLab repo inside the sandbox at `/workspace/<project>`. The AI that runs inside OpenHands receives a **prompt** (step description, list of files to edit, task title, working directory). It uses OpenHands **write_file / edit_file** (or equivalent) to change files in that directory. So it “sees” the repo by working inside the cloned tree. | **OpenHands**: `executeCommands` to clone repo and `checkout -b plan.branch`; then `implementWithPrompt(prompt, workDir)` so the in-sandbox AI edits files under `workDir`. |
| **Backend Dev (no OpenHands)** | Does **not** read the repo. It gets the **plan** (steps, file paths). It generates code per step via AI, then **repo-clone-push** writes those generated files into a **fresh clone** (temp dir). So the “view” is only the plan’s file list and AI-generated content. | **GitLab**: clone via `getPushUrl(project)`; write generated files to clone; push `plan.branch`. |
| **Frontend Dev** | Same as Backend Dev without OpenHands: **plan only** (steps, file paths). Generates frontend code per step, then **repo-clone-push** writes into a fresh clone and pushes `plan.branch`. | **repo-clone-push**: clone plan’s repo, branch `plan.branch`, write generated files, commit, push. |
| **QA Tester** | Can run tests **inside OpenHands** workspace (same clone as Backend Dev) when OpenHands is available. Otherwise runs/simulates tests without direct repo access. | **OpenHands**: `executeCommands` in `workDir` (e.g. `npm test`). Or simulated results. |
| **Code Reviewer** | **Diff** between **default branch** and **task branch** (`plan.branch`): full patch of what would be merged. If branch not on GitLab yet (e.g. fallback with only generated code), reviews the **generated code** (file path + content) from the implementation result. | **GitLab API**: `getCompareDiff(projectId, defaultBranch, branch)`. **Fallback**: `implementationResult.generatedCode` / `generatedFiles`. |
| **Orchestrator** | Does not read file contents. Uses **plan** (steps, branch, project, primaryStack) and **implementation result** (branch, success, generatedFiles). Can call `gitlab.getRepositoryFiles(project, 10)` for generic “repo files” context when answering /ask. | **Plan + GitLab API** (for /ask context). |

So: **Planner** sees repo structure and some file contents (MCP or GitLab). **Implementer** either works inside a real clone (OpenHands) or writes generated files into a fresh clone (repo-clone-push). **QA** uses the OpenHands workspace when available. **Code Reviewer** sees the diff (default ↔ task branch) or the generated code.

### How OpenHands works (detailed)

OpenHands is an **HTTP service** (e.g. in Docker on port 3000). The Nigents app calls it from the Backend Dev agent when it’s available.

| What | How |
|------|-----|
| **Health check** | `GET /health` → Backend Dev decides “use OpenHands” vs “fallback”. |
| **Run shell commands** | `POST /api/execute` with `{ commands: string[], working_dir?, timeout? }`. Example: `cd /workspace`, `git clone <pushUrl> <project>`, `cd <project>`, `git checkout -b <plan.branch>`. Repo lives at `/workspace/<project>/`. |
| **AI-driven edit** | `POST /api/agent/run` with `{ prompt, working_dir }`. The prompt includes: step description, **only these files** (from plan), task title, “use write_file or edit_file”. The model inside OpenHands edits files under `working_dir` and can run commands there. |
| **Commit and push** | Again `POST /api/execute`: `cd <workDir>`, `git add -A`, `git commit -m "feat: ..."`, `git push origin <plan.branch>`. So the **task branch** is pushed from inside the container. |

**Path summary**: Clone is at `/workspace/<project>` (e.g. `/workspace/group/my-repo`). Every step runs with that as `working_dir`. Only the **plan’s repo** is cloned; only **plan.branch** is created and pushed.

### How agents contribute together (sequence)

```
1. User: /plan <task>  (and optionally selects GitLab project)
        ↓
2. Orchestrator → Planner
   Planner: analyzeCodebase(project)     → repo file list + relevant files + contents (MCP or GitLab)
            generatePlanWithMCP(...)    → plan { steps, files per step, branch, primaryStack }
   Orchestrator → User: plan + "Reply with /approve"
        ↓
3. User: /approve
   Orchestrator: task.branch = plan.branch
                 Pick implementer: primaryStack === 'frontend' ? Frontend Dev : Backend Dev
        ↓
4. Implementer (Backend or Frontend Dev)
   • Backend + OpenHands:
     setupWorkspace(plan)     → clone repo, checkout -b plan.branch  (files now at /workspace/<project>)
     for each step:
       implementStep(step, workDir, plan)  → openhands.implementWithPrompt(prompt, workDir)
     commitAndPush(workDir, plan)  → git add, commit, push origin plan.branch
   • Backend without OpenHands / Frontend:
     for each step: generate code (AI) → parse to path + content
     cloneEditAndPush(plan, generatedFiles, reporter)  → clone repo, branch plan.branch, write files, commit, push
   Reporter: "Editing <file> on branch <plan.branch>", "Pushing branch to GitLab..."
        ↓
5. Orchestrator → QA Tester
   QA: runTests(plan)  (in OpenHands workspace if available, else simulated)
        ↓
6. Orchestrator → Code Reviewer
   Reviewer: getDiff(projectId, defaultBranch, branch) or reviewGeneratedCode(implementationResult)
             → approve or request changes
        ↓
7. If approved:
   Orchestrator: ensure branch exists on GitLab (already pushed, or push via GitLab API if fallback failed to push)
                createMergeRequest(sourceBranch = plan.branch, targetBranch = defaultBranch)
   Reporter: MR link to user
```

So: **Planner** sees the repo (MCP or GitLab) and produces the **plan**. **Implementer** produces code and either edits in OpenHands or writes into a clone and pushes the **task branch**. **QA** and **Code Reviewer** validate; **Orchestrator** creates the MR from **task branch** to **default branch**.

### End-to-end steps (from /plan to branch pushed)

| Step | Who | What happens | Repo / files |
|------|-----|--------------|--------------|
| 1 | User | Sends /plan &lt;task&gt;, may select project | - |
| 2 | Planner | Analyzes codebase (MCP or GitLab API) | Gets file list + contents of relevant files |
| 3 | Planner | Builds plan (steps, file paths, branch, primaryStack) | Plan references repo paths only |
| 4 | User | /approve | - |
| 5 | Orchestrator | Sets task.branch = plan.branch; picks Frontend or Backend Dev | - |
| 6a | Backend Dev (OpenHands) | Clone repo in container, checkout -b plan.branch | Repo at /workspace/&lt;project&gt;/ |
| 6b | Backend Dev (OpenHands) | For each step: implementWithPrompt(prompt, workDir) | AI edits only plan-listed files in clone |
| 6c | Backend Dev (OpenHands) | git add, commit, push origin plan.branch | Task branch pushed to GitLab |
| 6d | Backend / Frontend (no OpenHands) | Generate code per step; cloneEditAndPush(plan, files, reporter) | Fresh clone, write generated files, push plan.branch |
| 7 | QA Tester | Run tests (OpenHands workspace or simulated) | Same clone if OpenHands |
| 8 | Code Reviewer | getCompareDiff(default, branch) or review generated code | Sees diff or generated content |
| 9 | Orchestrator | Create MR(sourceBranch=plan.branch, targetBranch=default) | Branch already on GitLab from step 6 |

After step 9, the **task branch** is on GitLab with commits, and the **Merge Request** (task branch → default branch) is created and the link sent to the user.

---

## What is OpenHands?

**OpenHands** is a **code execution sandbox** that runs in a Docker container. It lets the Backend Dev agent run real shell commands (git clone, npm install, file edits, tests) in an isolated workspace instead of on your host machine. When OpenHands is unavailable, Nigents falls back to: generating code via AI, then **cloning the same GitLab repo** (via shared `repo-clone-push`), writing the generated files into the clone, and **pushing to the task branch**—so you still get the correct repo and branch with real commits. If clone/push fails, the app can push via GitLab Commits API so the MR still has code to view.

### What OpenHands does

| Function | Description |
|----------|-------------|
| 📝 **Write code** | Create and edit files under `/workspace` in the container |
| 🔧 **Run commands** | Execute shell commands: `git`, `npm`, `mvn`, custom scripts, etc. |
| 🧪 **Run tests** | Run test suites inside the sandbox without affecting the host |
| 📤 **Push to GitLab** | Clone via push URL, commit, and push from the container so the MR has real code |

The Nigents app talks to OpenHands over HTTP: it sends commands (and optional file writes) to the service; the service runs them in the container and returns output and exit codes.

### How OpenHands works

1. **Service** – A separate process (e.g. OpenDevin or a compatible API) runs in Docker, usually on **port 3000**, and exposes:
   - `POST /api/execute` – body: `{ commands: string[], working_dir?, timeout? }`; response: `{ exit_code, output?, error? }`
   - Optional: file write endpoints if the service supports them.

2. **Backend Dev flow** – The Backend Dev agent calls `openhands.executeCommands(commands, { workingDir, timeout })`. For example:
   - Clone repo (using GitLab push URL), create branch, write files (via commands or file API), run tests, then commit and push.

3. **When OpenHands is down** – The agent uses **fallback mode**: it generates code with AI, then the shared **repo-clone-push** flow clones the plan’s GitLab repo to a temp directory, creates the **task branch** (`plan.branch`), writes the generated files, commits and pushes to GitLab. So you get the **correct repo** and **task branch** with real commits. If that fails, the app pushes via the **GitLab Commits API** so the MR still has code to review.

4. **Where it runs** – OpenHands runs in a **Docker container** with its own filesystem (e.g. `/workspace`). You can mount a host volume (e.g. `/home/ubuntu/workspace`) for persistence. The main Nigents app (bot, dashboard) stays on the host; only the sandbox runs in the container.

The exact API contract and compatibility with images like `ghcr.io/opendevin/opendevin` are documented in **OPERATIONS.md**.

### Why OpenHands is important

- **Safety** – Code and commands run inside the container. A bad command or script can’t wipe your host or Nigents app; at worst, you restart the container.
- **Real execution** – The agent can actually run `npm test`, `mvn verify`, or custom scripts and use real output to decide the next step, instead of only generating code without running it.
- **Real Git workflow** – Clone → branch → edit → commit → push happens inside the sandbox, so the MR is backed by real commits from a real repo clone.
- **Optional** – If you don’t run OpenHands, Nigents still works: the fallback pushes generated code via the GitLab API so you still get MRs and a working workflow.

```
Without OpenHands (risky if agents wrote on the host):
┌─────────────────────────────────────┐
│  Agent would write/run on host      │
│  e.g. /home/ubuntu/nightowl/src/    │
│  Risk: accidental overwrites,      │
│  broken app, or security issues     │
└─────────────────────────────────────┘

With OpenHands (safe):
┌─────────────────────────────────────┐
│  All code and commands run in       │
│  Docker container → /workspace       │
│  Host and Nigents app unchanged;    │
│  if something breaks, reset container│
└─────────────────────────────────────┘
```

### How OpenHands fits in the workflow

```
1. Orchestrator picks implementer: Frontend-only → Frontend Dev; else Backend Dev.
2. Implementer uses plan.branch (task branch) for all git operations.

   With OpenHands (Backend Dev only):
   → openhands.executeCommands: clone plan’s repo, checkout -b plan.branch, edit, commit, push
   → Branch plan.branch is on GitLab with commits

   Without OpenHands (Backend or Frontend Dev):
   → repo-clone-push: clone plan’s repo to temp dir, checkout -b plan.branch, write generated files, commit, push
   → If that fails → GitLab Commits API to create branch with files

3. Orchestrator creates MR (sourceBranch = task branch, targetBranch = repo default)
```

**OpenHands runs on:** Port 3000 (or `OPENHANDS_URL`); Docker container; optional mounted volume for `/workspace`. Separate from the main app—a sandbox crash doesn’t stop the bot or dashboard.

**Example usage in code** (matches `src/tools/openhands.js`):

```javascript
// Backend Dev agent: run commands in the sandbox
const result = await openhands.executeCommands(
  ['git clone --branch main ' + pushUrl + ' .', 'npm install', 'npm test'],
  { workingDir: '/workspace', timeout: 300 }
);
// result: { success, output, error, exitCode }

// Write a file (if the OpenHands service supports it)
await openhands.writeFile('/workspace/src/App.js', content);
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
| **Orchestrator** | Team Lead & Router | Configurable (default: custom GLM) | Receives tasks, coordinates all agents, manages workflow |
| **Planner** | Architecture & Planning | Configurable (default: custom GLM) | Analyzes codebase, creates implementation plans |
| **Backend Dev** | Backend Developer | Configurable (default: custom GLM) | Implements backend/fullstack plans: OpenHands or **repo-clone-push** to **plan.branch**; only edits plan-listed files |
| **Frontend Dev** | Frontend Developer | Configurable (default: custom GLM) | Implements frontend-only plans: **repo-clone-push** to **plan.branch** (React/TSX/CSS, RTL, UI/UX) |
| **QA Tester** | Quality Assurance | Configurable (default: custom GLM) | Writes tests, runs suites, validates functionality |
| **Code Reviewer** | Code Reviewer | Configurable (default: custom GLM) | Security audit, quality checks, RTL compliance |
| **Reporter** | Reporter & Communicator | Configurable (default: custom GLM) | Telegram updates, daily reports, cost tracking |

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

### Detailed Code Flow

This section shows exactly how the code flows from user input to dashboard visualization:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TELEGRAM BOT FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER SENDS MESSAGE (Voice/Text)
   │
   ▼
┌─────────────────────────────────────────┐
│  src/bot.js                             │
│  ─────────────────                      │
│  bot.on('message', async (msg) => {     │
│    const voiceFile = await              │
│      downloadVoiceFile(msg.voice);      │
│    const text = await                   │
│      transcribeVoice(voiceFile);        │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
2. MESSAGE PARSED & COMMAND EXTRACTED
   │
   ▼
┌─────────────────────────────────────────┐
│  src/bot.js - Command Handlers          │
│  ─────────────────────────────          │
│  bot.onText(/\\/plan (.+)/, async (msg, │
│    const task = parseCommand(match[1]); │
│    const result = await                 │
│      orchestrator.processCommand(       │
│        `/plan ${task}`,                 │
│        { userId, project, aiProvider }  │
│      );                                 │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
3. ORCHESTRATOR PROCESSES TASK
   │
   ▼
┌─────────────────────────────────────────┐
│  src/agents/orchestrator.js             │
│  ───────────────────────────            │
│  async processCommand(command, ctx) {   │
│    const parsed = parseCommand(command);│
│    // Route to appropriate agent        │
│    switch(parsed.type) {                │
│      case 'plan':                       │
│        return await                     │
│          handlePlanTask(parsed, ctx);   │
│      case 'ask':                        │
│        return await                     │
│          handleAskTask(parsed, ctx);    │
│    }                                    │
│  }                                      │
└─────────────────────────────────────────┘
   │
   ▼
4. PLANNER AGENT CREATES PLAN
   │
   ▼
┌─────────────────────────────────────────┐
│  src/agents/planner.js                  │
│  ─────────────────────                  │
│  async createPlan({task, project}) {    │
│    // Use AI to generate plan           │
│    const plan = await aiClient.call(    │
│      `Create plan for: ${task}`, {      │
│        provider: this.aiProvider,       │
│        systemMessage: plannerPrompt     │
│      }                                  │
│    );                                   │
│    // Store pending plan                │
│    await savePendingPlan(plan);         │
│    return plan;                         │
│  }                                      │
└─────────────────────────────────────────┘
   │
   ▼
5. PLAN SENT TO USER FOR APPROVAL
   │
   ▼
┌─────────────────────────────────────────┐
│  src/bot.js                             │
│  ─────────────────                      │
│  // Send plan with approve/cancel       │
│  bot.sendMessage(chatId, planText, {    │
│    reply_markup: {                      │
│      inline_keyboard: [[               │
│        { text: '✓ Approve',             │
│          callback_data: 'planwith:...' }│
│      ]]                                 │
│    }                                    │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
6. USER APPROVES PLAN
   │
   ▼
┌─────────────────────────────────────────┐
│  src/bot.js - Callback Handler          │
│  ─────────────────────────────          │
│  bot.on('callback_query', async (q) => {│
│    if (q.data.startsWith('planwith:')) {│
│      const planId = extractId(q.data);  │
│      await orchestrator.executePlan(    │
│        planId, ctx                      │
│      );                                 │
│    }                                    │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
7. EXECUTION VIA AUTOGEN GROUP CHAT
   │
   ▼
┌─────────────────────────────────────────┐
│  src/autogen/group-chat.js              │
│  ───────────────────────────            │
│  async executePlan(plan, context) {     │
│    // Create AutoGen group chat         │
│    const groupChat = new GroupChat({    │
│      agents: [planner, backend,         │
│        frontend, qa, reviewer],         │
│      messages: []                       │
│    });                                  │
│    // Start collaboration               │
│    await groupChat.run(plan);           │
│  }                                      │
└─────────────────────────────────────────┘
   │
   ▼
8. AGENTS COLLABORATE & REPORT PROGRESS
   │
   ▼
┌─────────────────────────────────────────┐
│  Dashboard API Calls (Real-time)        │
│  ─────────────────────────────────      │
│  // Each agent reports status           │
│  await fetch('/api/agents/' + name +    │
│    '/status', {                         │
│      method: 'POST',                    │
│      body: JSON.stringify({             │
│        status: 'active',                │
│        activity: 'Writing code...'      │
│      })                                 │
│    });                                  │
│                                         │
│  // Code edits streamed                 │
│  await fetch('/api/code-edit', {        │
│      method: 'POST',                    │
│      body: JSON.stringify({             │
│        agent: 'backend',                │
│        file: 'PaymentController.java',  │
│        action: 'write',                 │
│        code: '...'                      │
│      })                                 │
│  });                                    │
└─────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DASHBOARD DISPLAY FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

1. DASHBOARD SERVER STARTS
   │
   ▼
┌─────────────────────────────────────────┐
│  src/dashboard/server.js                │
│  ───────────────────────                │
│  const io = new Server(server);         │
│  // Socket.io for real-time updates     │
│  io.on('connection', (socket) => {      │
│    // init: from getDashboardState()   │
│    // (MySQL when DB enabled, else     │
│    //  in-memory dashboardState)       │
│    socket.emit('init', dashboardState); │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
2. BROWSER LOADS DASHBOARD
   │
   ▼
┌─────────────────────────────────────────┐
│  src/dashboard/public/dashboard.html    │
│  ────────────────────────────────────   │
│  const socket = io();                   │
│  socket.on('init', (state) => {         │
│    renderAgents(state.agents);          │
│    renderTasks(state.tasks);            │
│  });                                    │
│                                         │
│  socket.on('codeEdit', (edit) => {      │
│    showCodeEdit(edit);  // Live code!   │
│  });                                    │
└─────────────────────────────────────────┘
   │
   ▼
3. AGENT UPDATES SENT TO DASHBOARD
   │
   ▼
┌─────────────────────────────────────────┐
│  Agent → Dashboard Update               │
│  ─────────────────────────              │
│  // Agent calls API                     │
│  POST /api/agents/backend/status        │
│  {                                      │
│    status: "busy",                      │
│    activity: "Writing PaymentController │
│               at line 45",              │
│    progress: 67,                        │
│    currentFile: "PaymentController.java"│
│  }                                      │
│  → io.emit('agentStatus', data)         │
│  → Dashboard updates UI instantly       │
└─────────────────────────────────────────┘
   │
   ▼
4. LIVE CODE EDITS DISPLAYED
   │
   ▼
┌─────────────────────────────────────────┐
│  Code Editor Component (dashboard.html) │
│  ────────────────────────────────────── │
│  socket.on('codeEdit', (data) => {      │
│    const editor = document.getElementBy │
│      Id('code-editor');                 │
│    editor.innerHTML = highlightCode(    │
│      data.code                          │
│    );                                   │
│    // Scroll to changed lines           │
│    scrollToLine(data.lineNumbers[0]);   │
│  });                                    │
└─────────────────────────────────────────┘
```

### Key Files & Their Roles

| File | Role | Key Functions |
|------|------|---------------|
| `src/bot.js` | Telegram interface | Message handling, voice transcription, command parsing |
| `src/agents/orchestrator.js` | Task router | `processCommand()`, `handlePlanTask()`, `executeImplementationWorkflow()` — sets `task.branch = plan.branch`, picks Frontend/Backend Dev |
| `src/agents/planner.js` | Plan creation | `createPlan()`, `generatePlanWithMCP()` — sets `plan.branch`, `primaryStack` (frontend/backend/fullstack) |
| `src/agents/backend-dev.js` | Backend coding | `implement(plan, context)`, OpenHands or `repo-clone-push` to **plan.branch** |
| `src/agents/frontend-dev.js` | Frontend coding | `implement(plan, context)`, `repo-clone-push` to **plan.branch** |
| `src/tools/repo-clone-push.js` | Shared repo push | `cloneEditAndPush(plan, generatedFiles, reporter)` — clone GitLab repo, write files, push to **plan.branch** |
| `src/agents/qa-tester.js` | Testing | `writeTests()`, `runTestSuite()` |
| `src/agents/code-reviewer.js` | Review | `review()`, `getDiff()` — task branch vs default branch (from GitLab or implementationResult.targetBranch) |
| `src/autogen/group-chat.js` | Agent coordination | `executePlan()`, `manageConversation()` |
| `src/dashboard/server.js` | Dashboard API | Real-time updates via Socket.io |
| `src/utils/ai-client.js` | AI provider abstraction | `call()` with configurable provider (custom GLM, OpenAI for voice, etc.) |
| `src/utils/mcp-client.js` | MCP tool calling | `callTool()`, `listTools()` |

### Data Flow Examples

**Example 1: User sends `/plan Add payment API`**

```javascript
// 1. Telegram bot receives
bot.onText(/\/plan (.+)/, handler)

// 2. Orchestrator routes to planner
orchestrator.handlePlanTask(parsed, context)

// 3. Planner generates plan
planner.createPlan({ task: "Add payment API", project })
  → Calls AI: "Create implementation plan..."
  → Returns structured plan

// 4. Plan sent to Telegram with buttons
bot.sendMessage(chatId, plan, { reply_markup: approveButtons })

// 5. Dashboard notified
fetch('/api/tasks', { method: 'POST', body: plan })
io.emit('task', plan)  // Real-time to dashboard
```

**Example 2: User approves plan, agents execute**

```javascript
// 1. User clicks approve
bot.on('callback_query', handler)
  → orchestrator.executeImplementationWorkflow(task)
  → task.branch = plan.branch

// 2. Implementer chosen by primaryStack
isFrontendOnly ? frontendDev.implement(plan, { reporter })
               : backendDev.implement(plan, { reporter })

// 3. Implementer: clone repo → branch plan.branch → edit → push
//    (OpenHands or repo-clone-push; reporter sends "Editing file on branch x")
  → git clone plan’s repo, git checkout -b plan.branch
  → write/edit only plan-listed files, commit, push origin plan.branch

// 4. QA tester runs tests (OpenHands or simulated)
qaTester.runTests(plan)

// 5. Code reviewer: diff task branch vs default branch
codeReviewer.review(implementationResult)
  → getCompareDiff(projectId, targetBranch, branch)

// 6. Orchestrator creates MR (sourceBranch = plan.branch, targetBranch = default)
gitlab.createMergeRequest({ sourceBranch: task.plan.branch, targetBranch })
```

### API Endpoints (Dashboard)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Server status, uptime |
| `/api/agents` | GET | List all agents with status |
| `/api/agents/:name/status` | POST | Update agent status |
| `/api/tasks` | GET/POST | List/create tasks |
| `/api/tasks/:id/progress` | PUT | Update task progress |
| `/api/code-edit` | POST | Stream code edits |
| `/api/agent-communication` | POST | Agent chat messages |
| `/api/activity` | GET | Recent activities |
| `/api/gitlab/repos` | GET | List GitLab repositories |
| `/api/ai/providers` | GET | Available AI providers |
| `/api/ai/test` | POST | Test AI provider |
| `/api/materials/stats` | GET | Subscribers stats |
| `/api/materials/subscribers` | GET | List subscribers |
| `/api/auth/login` | POST | Dashboard login (body: `username`, `password`); sets session cookie |
| `/api/auth/check` | GET | Check if session is valid (no auth required) |
| `/api/auth/logout` | POST | Log out and clear session |
| `/api/admin/users` | GET | List all users (admin) |
| `/api/admin/users` | POST | Create user (admin; body: `userId`, `displayName`) |
| `/api/admin/copy-config` | POST | Copy one user's config to another (admin; body: `fromUserId`, `toUserId`) |
| `/api/config?userId=X` | GET | Get config for user `X` (sanitized; optional `userId` for per-user) |
| `/api/config/apikeys` | POST | Update API keys (body may include `userId` for per-user) |
| `/api/config/gitlab` | POST | Update GitLab config (body may include `userId` for per-user) |
| `/api/config/custommodels` | POST | Update custom models (body may include `userId` for per-user) |

### Socket.io Events

| Event | Direction | Data |
|-------|-----------|------|
| `init` | Server → Client | Full dashboard state |
| `agentStatus` | Server → Client | Agent status update |
| `codeEdit` | Server → Client | Live code edit |
| `agentCommunication` | Server → Client | Agent chat message |
| `task` | Server → Client | Task created/updated |
| `activity` | Server → Client | New activity logged |

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
│  │  • Set task.branch = plan.branch; pick Frontend/Backend Dev │   │
│  │  • Monitor all agent activities                             │   │
│  │  • Handle errors and retries                                │   │
│  │  • Create MR (sourceBranch = task branch, target = default) │   │
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
│   ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐     │
│   │  GITLAB  │    │ OPENHANDS│    │ AI (config.)  │    │  DOCKER  │     │
│   │   API    │    │ Sandbox  │    │ Custom / GLM  │    │  Engine  │     │
│   └──────────┘    └──────────┘    └──────────────┘    └──────────┘     │
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

## 🔍 Planning MCP Flow & Architecture

This section explains exactly how the **Planner Agent** creates implementation plans, which MCP tools are used, and how to diagnose issues.

### Planner Agent Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLAN CREATION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

User: "/plan Add payment gateway"
         │
         ▼
┌──────────────────────────┐
│   src/bot.js             │
│   ───────────            │
│   /plan command handler  │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│   Orchestrator Agent     │
│   ──────────────────     │
│   processCommand()       │
│   └── handlePlanTask()   │
└──────────┬───────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    PLANNER AGENT - CREATE PLAN                          │
│                    src/agents/planner.js                                │
└────────────────────────────────────────────────────────────────────────┘
           │
           ▼
Step 1: SETUP AI PROVIDER
┌─────────────────────────────────────┐
│  Check user preference              │
│  ├── Use preferredAI if set         │
│  └── Fallback to agent config       │
└─────────────┬───────────────────────┘
              │
              ▼
Step 2: ANALYZE CODEBASE (Optional)
┌─────────────────────────────────────┐
│  analyzeCodebaseWithMCP(project)    │
│  ├── List directory (MCP)           │
│  ├── Read relevant files (MCP)      │
│  └── Git status (MCP)               │
└─────────────┬───────────────────────┘
              │
              ▼
Step 3: GENERATE PLAN
┌─────────────────────────────────────┐
│  generatePlanWithMCP()              │
│  │                                  │
│  ├── Try 1: executeWithMCP()        │
│  │      └── AgentMCPWrapper         │
│  │          └── src/mcp/agent-      │
│  │              mcp-wrapper.js      │
│  │                                  │
│  └── Try 2: (Fallback) callAI()     │
│         └── Direct AI call          │
│             └── src/utils/ai-       │
│                 client.js           │
└─────────────┬───────────────────────┘
              │
              ▼
Step 4: PARSE RESPONSE
┌─────────────────────────────────────┐
│  Extract JSON from AI response      │
│  ├── Attempt 1: Code blocks         │
│  ├── Attempt 2: Curly braces        │
│  └── Attempt 3: Full content        │
└─────────────┬───────────────────────┘
              │
              ▼
Step 5: RETURN PLAN
┌─────────────────────────────────────┐
│  Return structured plan object      │
│  └── Orchestrator sends to Telegram │
└─────────────────────────────────────┘
```

### MCP Wrapper Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT MCP WRAPPER FLOW                                    │
│                    src/mcp/agent-mcp-wrapper.js                              │
└─────────────────────────────────────────────────────────────────────────────┘

When planner calls executeWithMCP():

┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│   Planner Agent    │────▶│  AgentMCPWrapper   │────▶│   MCP Client       │
│                    │     │                    │     │   src/mcp/         │
└────────────────────┘     └─────────┬──────────┘     │   mcp-client.js    │
                                     │                └──────────┬─────────┘
                                     │                           │
                                     ▼                           ▼
                           ┌─────────────────┐         ┌─────────────────┐
                           │ executeWithTools│         │  Call MCP Tool  │
                           │                 │         │                 │
                           │ 1. Get available│         │ • filesystem    │
                           │    tools        │         │ • git           │
                           │                 │         │ • gitlab        │
                           │ 2. Build prompt │         │ • postgresql    │
                           │    with tools   │         │ • brave-search  │
                           │                 │         │ • (35+ tools)   │
                           │ 3. Call AI with │         │                 │
                           │    tool context │         └─────────────────┘
                           │                 │
                           │ 4. Parse tool   │
                           │    calls        │
                           │                 │
                           │ 5. Execute      │
                           │    tools        │
                           │                 │
                           │ 6. Return       │
                           │    results      │
                           └─────────────────┘
```

### Planning Process Step-by-Step

#### Step 1: Provider Selection
```javascript
// src/agents/planner.js - createPlan()
async createPlan({ task, project, context = {} }) {
  // Check user preference from context
  const preferredProvider = context.aiProvider || context.preferredProvider;
  const preferredModel = context.aiModel || context.preferredModel;
  
  if (preferredProvider) {
    this.setAIProvider(preferredProvider, preferredModel);
  }
  // ...
}
```

**Issue Check:** If the wrong AI provider is being used, check:
- `context.aiProvider` is passed from bot.js
- Agent's `this.provider` is set correctly
- `src/utils/ai-client.js` routes to correct provider

#### Step 2: Codebase Analysis via MCP
```javascript
// src/agents/planner.js - analyzeCodebaseWithMCP()
async analyzeCodebaseWithMCP(project, task) {
  // Try MCP first
  const dirResult = await this.mcpWrapper.quickTool('list_directory', {
    path: workspacePath,
  });
  
  // Read relevant files
  for (const filePath of relevantFiles) {
    const content = await this.mcpWrapper.quickTool('read_file', {
      path: fullPath,
    });
  }
}
```

**MCP Tools Used:**
| Tool | Purpose | MCP Server |
|------|---------|------------|
| `list_directory` | List repo structure | filesystem |
| `read_file` | Read file contents | filesystem |
| `git_status` | Check git state | git |

**Issue Check:** If MCP fails:
- Check `config/mcp-servers.json` configuration
- Verify MCP server is built (`dist/index.js` exists)
- Check MCP client is initialized

#### Step 3: Plan Generation with Fallback
```javascript
// src/agents/planner.js - generatePlanWithMCP()
async generatePlanWithMCP(task, codebaseAnalysis, project) {
  // Build prompt with codebase context
  const prompt = `You are an expert software architect...`;
  
  // Try MCP first
  try {
    result = await this.executeWithMCP(prompt, { task, project });
  } catch (mcpError) {
    // FALLBACK: Direct AI call
    logger.warn('[Planner] MCP failed, falling back to direct AI');
    result = await this.callAI(prompt, { provider: this.provider, model: this.model });
  }
}
```

**The Fallback Mechanism:**
1. **Primary:** Try MCP wrapper for tool-augmented planning
2. **Fallback:** Direct AI call if MCP fails
3. **Result:** Both paths return structured JSON plan

**Why MCP Might Fail:**
- MCP server not running or not built
- Tool execution error
- Timeout during tool calls
- JSON parsing error in tool results

#### Step 4: AI Provider Call Flow
```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Planner Agent  │────▶│   AI Client      │────▶│  Provider-Specific│
│                 │     │   src/utils/     │     │  Call Function    │
└─────────────────┘     │   ai-client.js   │     └──────────────────┘
                        └──────────────────┘              │
                                   │                      │
                                   ▼                      ▼
                        ┌──────────────────┐     ┌──────────────────┐
                        │ 1. Get provider  │     │ call() with      │
                        │    from config  │     │ provider-specific│
                        │                  │     │ (custom GLM,     │
                        │ 2. Check if      │     │  OpenAI voice)   │
                        │    enabled       │     │                  │
                        │                  │     │ Handles:        │
                        │ 3. Route to      │     │ • API key check  │
                        │    specific      │     │ • Request build  │
                        │    function      │     │ • Response parse │
                        │                  │     │ • Error handling │
                        └──────────────────┘     └──────────────────┘
```

**Common AI Provider Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| `401 invalid x-api-key` | Wrong API key | Check `ZHIPU_API_KEY` in `.env` |
| `Provider anthropic not enabled` | Missing API key | Add `ANTHROPIC_API_KEY` or switch provider |
| `Unknown provider: xxx` | Typo in provider name | Check config: default is custom/zhipuglm5; others configurable |
| Model ignored | Model not specified | Check `config/agents.json` model field |

### Debugging Planning Issues

#### Enable Debug Logging
```bash
# Set debug level in .env
LOG_LEVEL=debug

# Or check logs
pm2 logs nigents-bot --lines 100 | grep -i "planner\|mcp\|ai-client"
```

#### Check Provider Configuration
```bash
# Test via Telegram
/testglm your-api-key glm-5
/testmoonshot sk-your-key moonshot-v1-8k

# Or check dashboard
# http://your-ec2-ip:4000 → AI Providers tab
```

#### Check Agent Model Assignment
```bash
# Via Telegram
/agentmodels

# Output shows:
# 🌍 Global Defaults:
# Provider: zhipu
# Model: glm-5
#
# 📋 Per-Agent Configuration:
# • planner: zhipu (glm-5)
# • backend-dev: zhipu (glm-5)
```

#### Change Agent Model (Runtime)
```bash
# Change single agent
/setagent planner zhipu glm-4-plus

# Change ALL agents
/setallagents anthropic claude-3-sonnet-20240229
```

### Planner MCP Tools Configuration

The Planner agent has specific MCP tools assigned in `config/mcp-servers.json`:

```json
{
  "agentTools": {
    "planner": [
      "smart-code-search",    // Semantic code search
      "brave-search",         // Web search for best practices
      "gitlab"                // GitLab API access
    ]
  }
}
```

**Custom MCP Servers for Planning:**

| Server | File | Tools | Purpose |
|--------|------|-------|---------|
| smart-code-search | `mcp-servers/smart-code-search/dist/index.js` | semantic_search, index_repository | Find relevant code |
| brave-search | External | web_search | Research best practices |
| gitlab | Built-in | get_file, list_files | Read repository |

### Complete Planning Debug Checklist

If planning is not working:

```
□ 1. Check AI Provider
   └── /agentmodels in Telegram
   └── Verify provider is enabled in dashboard

□ 2. Check API Keys
   └── /testglm or /testmoonshot in Telegram
   └── Check .env file has correct keys

□ 3. Check MCP Servers
   └── ls mcp-servers/*/dist/index.js
   └── Rebuild if missing: npm run build:mcp

□ 4. Check Logs
   └── pm2 logs nigents-bot
   └── Look for: "[Planner]", "[MCP Wrapper]", "[AIClient]"

□ 5. Test Direct AI Call
   └── /ask What is 2+2?
   └── Should respond using default provider

□ 6. Test Plan Creation
   └── /plan Create a simple hello world API
   └── Should return plan with steps
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

### 6. Dashboard Login (Admin)
- The dashboard is protected by **admin credentials**.
- **Default login:** username `admin`, password `admin`.
- Override via environment: `DASHBOARD_ADMIN_USERNAME` and `DASHBOARD_ADMIN_PASSWORD`.
- Session is stored in an HTTP-only cookie; all `/api/*` routes (except `/api/auth/login` and `/api/auth/check`) require a valid session.
- Logout clears the session and redirects to the login page.

### 7. Admin Panel (Multi-User)
- **Admin** tab (after login): manage users and their config.
- **Select user:** Choose any user (Telegram users who have used the bot, or users you add) to view and edit their **per-user config** (API keys, GitLab token/namespace/URL, custom AI models).
- **Add user:** Create a user by **User ID** (e.g. Telegram ID or a custom ID like `user-alice`) and optional display name. Useful to pre-create users and assign config before they use the bot.
- **Copy config:** Copy one user’s full config (API keys, GitLab, custom models) to another user. Source and target are selected from dropdowns; the target user is created automatically if missing.

---

## Multi-User Support & Admin

Nigents supports **multiple users**, each with their own API keys, GitLab credentials, and custom AI models. The bot and dashboard use **per-user config** when available; otherwise they fall back to the global shared config (e.g. `data/shared-config.json` or env).

### How Multi-User Works

| Aspect | Description |
|--------|-------------|
| **User identity** | Bot: Telegram `from.id` is the user ID. Dashboard: admin selects a user by ID when viewing/editing config. |
| **Per-user config** | Stored in MySQL table `user_config` (when DB is configured): `api_keys`, `gitlab`, `custom_models` (JSON). |
| **Fallback** | If a user has no row in `user_config` or a key is missing, the app uses the global shared config (file or env). |
| **Agents** | Every command (e.g. `/plan`, `/run`) resolves config for that Telegram user and passes it to the orchestrator and agents. GitLab and AI calls use that user’s credentials. |

### Database: `user_config` Table

When MySQL is enabled, the schema includes:

```sql
CREATE TABLE IF NOT EXISTS user_config (
  user_id VARCHAR(50) PRIMARY KEY,
  api_keys JSON,
  gitlab JSON,
  custom_models JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- **API keys:** e.g. `OPENAI_API_KEY`, or any key used by the AI client.
- **GitLab:** `token`, `namespace`, `url` — used to create a per-user GitLab client for repo access and MRs.
- **Custom models:** Same shape as in shared config (name, apiKey, baseUrl, model, enabled). Users can add models via Telegram (`/addmodel`, `/addglm`) or admins can set them in the dashboard.

### Admin Panel (Dashboard)

1. Log in with admin credentials (default `admin` / `admin`).
2. Open the **Admin** tab.
3. **Select user** — View and edit that user’s API keys, GitLab settings, and custom models (custom models shown as read-only JSON; edit via API keys / GitLab forms).
4. **Add user** — Enter a **User ID** (required) and optional **Display name**. Creates the user in the `users` table and ensures `user_settings` exists so you can assign config.
5. **Copy config** — Choose **From user** (source) and **To user** (target). Copies API keys, GitLab, and custom models from source to target. The target user is created if they do not exist.

### Bot: Per-User Config

- **Config commands** (`/mymodels`, `/addmodel`, `/usecustommodel`, `/editcustommodel`, `/removecustommodel`, `/setagent`, `/setallagents`) read and write **per-user** config when the user-config module is available (MySQL); otherwise they use the global shared config.
- **Execution** — When you send `/plan`, `/run`, etc., the orchestrator loads config for your Telegram user and passes it to all agents (Planner, Backend Dev, Frontend Dev, Code Reviewer). GitLab and AI calls use your credentials.

### Environment (Optional)

- **Dashboard admin login:** `DASHBOARD_ADMIN_USERNAME`, `DASHBOARD_ADMIN_PASSWORD` (defaults: `admin`, `admin`).
- **Global fallback:** Continue to use `GITLAB_TOKEN`, `GITLAB_NAMESPACE`, `data/shared-config.json`, etc. for users who have no per-user config.

---

## Tech Stack & Architecture

### 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE LAYER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Telegram Bot (node-telegram-bot-api)        Web Dashboard (Express + Socket.io) │
│       ↓                                              ↓                      │
│  Voice Commands (Whisper + gTTS)              Real-time Updates              │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATION LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                         Orchestrator Agent (EventEmitter)                    │
│                              ↓         ↓         ↓                          │
│                    ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
│                    │ Planner │  │ Backend │  │   QA    │                   │
│                    │  Agent  │  │   Dev   │  │ Tester  │                   │
│                    └────┬────┘  └────┬────┘  └────┬────┘                   │
│                    ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
│                    │ Frontend│  │  Code   │  │ Reporter│                   │
│                    │   Dev   │  │ Reviewer│  │  Agent  │                   │
│                    └─────────┘  └─────────┘  └─────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TOOLS & INTEGRATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   GitLab    │  │    MCP      │  │  OpenHands  │  │   MySQL     │        │
│  │    API      │  │  Servers    │  │   Sandbox   │  │  Database   │        │
│  │             │  │             │  │             │  │             │        │
│  │ • Repos     │  │ • Arabic    │  │ • Docker    │  │ • Users     │        │
│  │ • MRs       │  │ • Search    │  │ • Code Exec │  │ • Tasks     │        │
│  │ • Issues    │  │ • Splitter  │  │ • Testing   │  │ • History   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI PROVIDER LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Anthropic   │  │  Zhipu AI    │  │  Moonshot    │  │  DeepSeek    │    │
│  │   Claude     │  │    GLM-4     │  │    Kimi      │  │   Coder      │    │
│  │              │  │              │  │              │  │              │    │
│  │ Best for:    │  │ Best for:    │  │ Best for:    │  │ Best for:    │    │
│  │ Complex code │  │ Fast/Cheap   │  │ Long context │  │ Code tasks   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🛠️ Frameworks & Technologies

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Agent Framework** | Custom EventEmitter + AutoGen patterns | Multi-agent orchestration with pub/sub communication |
| **Backend Runtime** | Node.js 20+ LTS | Server-side JavaScript execution |
| **Web Framework** | Express.js 4.x | REST API and dashboard server |
| **Real-time Communication** | Socket.io 4.x | Bidirectional event-based communication |
| **Database** | MySQL 8.0 + mysql2 | Persistent storage for all data |
| **AI Integration** | Native HTTP clients | Direct API calls to AI providers |
| **MCP Protocol** | @modelcontextprotocol/sdk | Standardized tool integration |
| **Telegram Bot** | node-telegram-bot-api | Bot interaction with users |
| **Voice Processing** | OpenAI Whisper + gTTS | Speech-to-text and text-to-speech |
| **Process Management** | PM2 | Production process manager |
| **Git Integration** | simple-git | Programmatic Git operations |
| **Containerization** | Docker + Dockerode | OpenHands sandbox management |
| **Dashboard UI** | Vanilla JS + Chart.js | Lightweight real-time dashboard |
| **Email** | Nodemailer | Subscriber email notifications |
| **Deployment** | AWS EC2 + GitLab CI/CD | Cloud infrastructure |

### 📦 Core Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.17.1",
  "@modelcontextprotocol/sdk": "^0.4.0",
  "axios": "^1.13.6",
  "dotenv": "^16.4.5",
  "express": "^4.18.2",
  "gtts": "^0.2.1",
  "mysql2": "^3.19.1",
  "node-telegram-bot-api": "^0.66.0",
  "nodemailer": "^8.0.2",
  "openai": "^4.28.0",
  "simple-git": "^3.22.0",
  "socket.io": "^4.7.4",
  "uuid": "^9.0.1",
  "winston": "^3.11.0"
}
```

---

## 🔄 How Nigents Works (Detailed Flow)

### 1. User Interaction Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  User    │────▶│   Telegram   │────▶│    Bot.js    │────▶│ Orchestrator │
│  (You)   │     │    Bot       │     │   Handler    │     │    Agent     │
└──────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                   │
                    Command: "/plan Make login page prettier"      │
                    ↓                                              │
                    1. Parse command                               │
                    2. Store in chatStorage (MySQL/JSON)           │
                    3. Call Planner Agent                          │
                    4. Generate implementation plan                │
                    5. Return to user with /approve button         │
                                                                   ▼
```

### 2. Plan Creation Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PLAN CREATION PHASE                            │
└────────────────────────────────────────────────────────────────────────┘

User: "/plan Make login page prettier"

Step 1: Command Parsing
├─ Bot receives message
├─ Extract user ID, chat ID, command
├─ Validate GitLab project selection
└─ Store in pending_plans (MySQL table)

Step 2: Planner Agent Activation
├─ Load codebase context from GitLab API
├─ Analyze existing login.html structure
├─ Query MCP servers for relevant patterns
└─ Generate implementation plan:

   📋 Implementation Plan
   ├─ Title: "Redesign Login Page UI"
   ├─ Complexity: M (2 hours)
   ├─ Steps:
   │   1. Analyze existing login.html
   │   2. Update CSS with modern styling
   │   3. Add responsive design
   │   4. Test across browsers
   └─ Files to modify:
       - login.html
       - styles.css

Step 3: User Approval
├─ Send plan to Telegram with approve button
├─ Wait for /approve command
└─ On approval: Add to task_queue (status: approved)
```

### 3. Implementation Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION PHASE                              │
└────────────────────────────────────────────────────────────────────────┘

Orchestrator triggers workflow:

┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Backend   │───▶│     QA      │───▶│    Code     │───▶│   Create    │
│     Dev     │    │   Tester    │    │  Reviewer   │    │     MR      │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
  Implements code    Runs tests        Reviews code
  ↓                  ↓                  ↓
  Git operations     Test results      Approval/Changes
  ↓                  ↓                  ↓
  Commits changes    Pass/Fail          MR created

Step-by-Step:

1. BACKEND DEVELOPER AGENT
   ├─ Clone repository (simple-git)
   ├─ Create feature branch: feature/login-redesign
   ├─ Modify login.html with new design
   ├─ Update styles.css
   ├─ Commit changes with descriptive message
   └─ Push branch to GitLab

2. QA TESTER AGENT
   ├─ Pull latest changes
   ├─ Run linting checks
   ├─ Verify responsive design
   ├─ Check accessibility (a11y)
   ├─ Validate HTML structure
   └─ Report: ✅ All tests passed

3. CODE REVIEWER AGENT
   ├─ Review code changes via GitLab API
   ├─ Check coding standards
   ├─ Verify security best practices
   ├─ Confirm design implementation
   └─ Approve: ✅ Ready to merge

4. MERGE REQUEST CREATION
   ├─ Create MR via GitLab API
   ├─ Title: "Redesign login page for better UX"
   ├─ Description: Detailed changes summary
   └─ Link: https://gitlab.com/.../merge_requests/42
```

### 4. Data Persistence Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW ARCHITECTURE                          │
└────────────────────────────────────────────────────────────────────────┘

                            MySQL Database
                    ┌─────────────────────────┐
                    │      nigents DB         │
                    ├─────────────────────────┤
    Telegram  ─────▶│ users                   │
    Users           │ user_settings           │◀── Preferences
                    │ chat_messages           │◀── History
                    │ pending_plans           │◀── Pending Tasks
                    │ tasks                   │◀── Task Queue
    Orchestrator ──▶│ task_steps              │
    Agents          │ agents                  │◀── Agent Status
                    │ activities              │◀── Logs
                    │ code_edits              │
                    │ agent_communications    │
    Dashboard  ────▶│ subscribers             │◀── Email list
                    └─────────────────────────┘

Data Flow Examples:

1. Chat Message Storage:
   Telegram Bot ──▶ chat-storage-mysql.js ──▶ chat_messages table
   
2. Task Queue Management:
   Orchestrator ──▶ task-queue-mysql.js ──▶ tasks table
   
3. Agent Status Updates:
   Dashboard API ──▶ Dashboard emits ──▶ Socket.io ──▶ Frontend
```

### 5. Real-time Dashboard Updates

```
┌────────────────────────────────────────────────────────────────────────┐
│                      REAL-TIME COMMUNICATION                            │
└────────────────────────────────────────────────────────────────────────┘

Dashboard Server (Express + Socket.io)
         │
         ├── Socket.io Connection ──▶ Browser (Real-time updates)
         │
         └── REST API Endpoints:
             ├── GET /api/status      → System health
             ├── GET /api/agents      → Agent statuses
             ├── GET /api/tasks       → Task queue
             ├── GET /api/activity    → Activity log
             └── POST /api/agents/:name/status → Update agent

Event Flow:

1. Agent Status Change:
   Backend Dev ──▶ "Implementing login.css..."
        ↓
   Orchestrator.emit('agentStatusChange')
        ↓
   Dashboard Server receives ──▶ Socket.io.emit('agentStatus')
        ↓
   Browser receives ──▶ UI updates in real-time

2. Code Edit Stream:
   Agent modifies file ──▶ POST /api/code-edit
        ↓
   Database stores edit ──▶ Socket.io.emit('codeEdit')
        ↓
   Dashboard shows live code changes
```

### 6. MCP (Model Context Protocol) Integration

```
┌────────────────────────────────────────────────────────────────────────┐
│                      MCP SERVERS ARCHITECTURE                           │
└────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   MCP Client SDK    │
                    │  (Part of Agent)    │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ Arabic RTL  │    │ Smart Code  │    │   Task      │
    │   Auditor   │    │   Search    │    │  Splitter   │
    │             │    │             │    │             │
    │ • RTL check │    │ • Search    │    │ • Split     │
    │ • Arabic    │    │   codebase  │    │   large     │
    │   support   │    │ • Find refs │    │   tasks     │
    └─────────────┘    └─────────────┘    └─────────────┘

Example Usage:

Planner Agent needs to find all login-related files:
├─ Calls Smart Code Search MCP
├─ Search query: "login authentication form"
└─ Returns: ["login.html", "auth.js", "styles.css"]

Backend Dev needs to split large task:
├─ Calls Task Splitter MCP
├─ Input: "Rebuild entire auth system"
└─ Returns: ["Update login", "Add JWT", "Create middleware"]
```

### 7. Complete Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE USER REQUEST LIFECYCLE                       │
└─────────────────────────────────────────────────────────────────────────┘

Time: 00:00 - User sends: "/plan Make login page prettier"

Time: 00:02 - System:
├─ Parses command
├─ Validates user
├─ Checks GitLab project
└─ Stores pending plan in MySQL

Time: 00:05 - Planner Agent:
├─ Analyzes login.html
├─ Queries codebase via GitLab API
├─ Uses MCP servers for patterns
└─ Generates detailed plan

Time: 00:15 - User receives:
├─ Implementation plan
├─ Complexity estimate
├─ Time estimate
└─ /approve button

Time: 00:30 - User clicks /approve
├─ Plan status → approved
├─ Task added to queue
└─ Orchestrator starts workflow

Time: 00:35 - Backend Dev Agent:
├─ Git clone/pull
├─ Create branch
├─ Modify files
├─ Git commit/push
└─ Report: "Code implemented"

Time: 01:15 - QA Tester Agent:
├─ Run tests
├─ Validate HTML/CSS
├─ Check responsiveness
└─ Report: "✅ All tests passed"

Time: 01:30 - Code Reviewer Agent:
├─ Review changes
├─ Check standards
├─ Verify design
└─ Report: "✅ Approved"

Time: 01:45 - Reporter Agent:
├─ Create Merge Request
├─ Generate summary
├─ Send Telegram notification
└─ Report: "✅ MR Created: link"

Time: 02:00 - Complete!
User wakes up to:
├─ Telegram notification
├─ Link to MR
├─ Summary of changes
└─ Ready to merge on GitLab

Dashboard shows entire timeline:
├─ Agent activities
├─ Code changes
├─ Test results
└─ Communication logs
```

---

## 📊 System Components Detail

### Agent System (Event-Driven Architecture)

```javascript
// Base Agent Class
class BaseAgent extends EventEmitter {
  constructor(config) {
    this.name = config.name;
    this.role = config.role;
    this.model = config.model;
    this.status = 'idle'; // idle | working | error
  }
  
  async callAI(prompt, options) {
    // Route to configured AI provider
    // Support: Claude, GLM, Kimi, DeepSeek
  }
  
  emitStatus(status, activity) {
    this.emit('statusChange', { name, status, activity });
  }
}
```

### Storage Layer (Dual Mode)

```javascript
// Hybrid Storage Pattern
if (DB_HOST configured) {
  // Use MySQL for persistence
  chatStorage = require('./chat-storage-mysql');
  taskQueue = require('./task-queue-mysql');
} else {
  // Fallback to JSON files
  chatStorage = require('./chat-storage-json');
}
```

### Telegram Bot Handlers

```javascript
// Command Router
bot.onText(/\/plan (.+)/, handlePlanCommand);
bot.onText(/\/approve/, handleApproveCommand);
bot.onText(/\/run/, handleRunCommand);
bot.onText(/\/status/, handleStatusCommand);

// Callback Handlers
bot.on('callback_query', handleButtonClick);

// Voice Messages
bot.on('voice', handleVoiceMessage);
```

### Dashboard WebSocket Events

```javascript
// Server → Client Events
io.emit('agentStatus', { name, status, activity });
io.emit('task', { id, status, progress });
io.emit('codeEdit', { agent, file, action, code });
io.emit('activity', { type, agent, message });

// Client → Server
socket.emit('requestLogs', { lines: 100 });
socket.emit('streamLogs', { enabled: true });
```

---

## Future work

Planned improvements and additions:

| Area | Description |
|------|--------------|
| **OpenHands** | Adapter or compatible service so `POST /api/execute` works as documented; or rely on fallback (GitLab API push). See OPERATIONS.md for exact API contract. |
| **Dashboard** | Already MySQL-only when DB enabled; possible: 503 on DB error, more filters, export. |
| **Docker** | One-command Docker deploy (image + compose) for bot + dashboard. |
| **Default branch** | Support repos whose default branch is not `main` (e.g. `master`) for MR target and API push. |
| **Voice** | More languages and TTS options beyond current OpenAI Whisper. |
| **MCP** | More custom MCP servers and tool discovery from dashboard. |

See also [💰 Nigents Cloud (Coming Soon)](#-nigents-cloud-coming-soon) for hosted offering and roadmap.

---

## 💰 Nigents Cloud (Coming Soon)

**Don't want to self-host?** We're building **Nigents Cloud** - a managed service where you can rent AI agents by the model.

### 🎯 Planned Pricing Model

| Plan | Price | Agents Included | Best For |
|------|-------|-----------------|----------|
| **Starter** | $49/mo | Planner + Backend Dev | Solo developers |
| **Pro** | $149/mo | Full 7-Agent Team | Small teams |
| **Enterprise** | $499/mo | Full team + Priority Support | Companies |
| **Pay-Per-Task** | $5/task | Any single agent | Occasional use |

### 🛒 Model-by-Model Marketplace

Rent individual agents for specific tasks:

| Agent | Price/Task | Typical Duration |
|-------|------------|------------------|
| 🔧 **Backend Dev** | $5 | 30-60 min |
| 🎨 **Frontend Dev** | $5 | 30-60 min |
| 🧪 **QA Tester** | $3 | 15-30 min |
| 🔍 **Code Reviewer** | $3 | 15-30 min |
| 📋 **Planner** | $2 | 10-15 min |
| 📊 **Reporter** | $2 | 5-10 min |
| 🎯 **Orchestrator** | Included | Manages workflow |

### ✨ Cloud Features (Coming Soon)

- **Zero Setup** - We host everything on our infrastructure
- **Instant Scaling** - Spin up multiple agent teams
- **Priority Queue** - Your tasks run first
- **Advanced Dashboard** - Analytics, history, team management
- **Custom Training** - Train agents on your codebase
- **SLA Guarantee** - 99.9% uptime, task completion guarantee

### 📅 Roadmap

| Milestone | Status | ETA |
|-----------|--------|-----|
| Beta Signup | 🟡 Open | Now |
| Closed Beta | 🔴 Pending | Q2 2025 |
| Public Launch | 🔴 Pending | Q3 2025 |
| Enterprise Tier | 🔴 Pending | Q4 2025 |

### 📝 Join the Waitlist

**Be the first to access Nigents Cloud:**

👉 [Join Waitlist](mailto:cloud@nigents.com?subject=Nigents%20Cloud%20Waitlist)

Send email to `cloud@nigents.com` with subject "Nigents Cloud Waitlist" and get:
- 50% off first 3 months
- Priority beta access
- Free migration from self-hosted

---

### 🤝 Monetization for Contributors

**Are you a developer?** Contribute to Nigents and earn:

| Contribution | Reward |
|--------------|--------|
| New MCP Server | $100-500 + Revenue share |
| Bug Fix | $25-100 |
| Feature Implementation | $50-300 |
| Documentation | $25-50 |

**Revenue Sharing Model:**
- Custom MCP servers you build earn 20% of usage revenue
- Popular agents can generate passive income
- Example: Your Stripe MCP server used 1000x/month = $200/mo for you

**Apply to Contribute:**
👉 [contributors@nigents.com](mailto:contributors@nigents.com)

---

### 🏢 Enterprise & White-Label

**For Companies:**

- **Private Deployment** - Run on your own AWS/GCP/Azure
- **Custom Agents** - Build specialized agents for your stack
- **Integration Services** - Connect to your internal tools
- **Training & Support** - Team onboarding and ongoing support

**White-Label Options:**
- Rebrand Nigents for your agency
- Resell to your clients
- Custom pricing tiers

**Contact:** [enterprise@nigents.com](mailto:enterprise@nigents.com)

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
git clone https://gitlab.com/bonyad-tech/nigents.git nigents
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
# AI: custom endpoint or set provider keys (see Configuration)
# OPENAI_API_KEY=your_key (for voice transcription)
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
git clone https://gitlab.com/bonyad-tech/nigents.git nigents
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

Agents use a **configurable AI provider**; the default is the custom GLM endpoint (`zhipuglm5`). Voice transcription uses OpenAI Whisper. See `.env` and `config/agents.json` (or MySQL `agent_config` when DB is enabled).

### Dashboard admin login

Dashboard access is protected by admin credentials. Set these in `.env` (optional; defaults shown):

```bash
DASHBOARD_ADMIN_USERNAME=admin
DASHBOARD_ADMIN_PASSWORD=admin
```

Change these in production. All `/api/*` routes (except `/api/auth/login` and `/api/auth/check`) require a valid session cookie set after login.

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

## MySQL Database Configuration

Nigents uses **MySQL** for persistent storage of all data including:
- User profiles and settings
- Chat history
- Pending plans and task queue
- Agent activities and code edits
- Email subscribers

### Database Schema

The database schema is defined in `src/database/schema.sql` with the following tables:

| Table | Purpose |
|-------|---------|
| `users` | Telegram user profiles |
| `user_settings` | User preferences (voice, language, AI provider) |
| `chat_messages` | Chat history (last 100 per user) |
| `pending_plans` | Pending plan approvals (24h expiry) |
| `tasks` | Task queue with full status tracking |
| `task_steps` | Individual plan steps |
| `agents` | Agent registration and status |
| `activities` | Activity log |
| `code_edits` | Code changes tracking |
| `agent_communications` | Agent-to-agent messages |
| `subscribers` | Email subscribers |
| `system_config` | System configuration |
| `user_config` | Per-user config: API keys, GitLab, custom AI models (see [Multi-User Support & Admin](#multi-user-support--admin)) |

### Environment Variables

Add these to your `.env` file:

```bash
# MySQL Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=nigents
DB_PASSWORD=nigents_password
DB_NAME=nigents
```

### Setting Up MySQL on EC2

**Option 1: Automatic Setup (Recommended)**

The deployment script automatically sets up MySQL:

```bash
# During CI/CD deployment, MySQL is automatically installed and configured
# Database is created, schema applied, and existing JSON data migrated
```

**Option 2: Manual Setup**

```bash
# SSH to your EC2 instance
ssh -i your-key.pem ubuntu@YOUR_EC2_IP

# Run the MySQL setup script
sudo bash scripts/setup-mysql.sh
```

**Option 3: Docker Setup**

```bash
# Run MySQL in Docker
docker run -d \
  --name mysql \
  -e MYSQL_ROOT_PASSWORD=root_password \
  -e MYSQL_DATABASE=nigents \
  -e MYSQL_USER=nigents \
  -e MYSQL_PASSWORD=nigents_password \
  -p 3306:3306 \
  mysql:8.0

# Apply schema
docker exec -i mysql mysql -unigents -pnigents_password nigents < src/database/schema.sql
```

### Migrating from JSON to MySQL

If you have existing JSON data, it will be automatically migrated on the first deployment. To manually migrate:

```bash
# Ensure DB environment variables are set
export DB_HOST=localhost
export DB_PORT=3306
export DB_USER=nigents
export DB_PASSWORD=nigents_password
export DB_NAME=nigents
export DATA_DIR=./data

# Run migration
node src/database/migrate.js
```

### Backwards Compatibility

If MySQL is not configured, Nigents will automatically fall back to JSON file storage:

```bash
# Without DB_HOST set, uses JSON files:
# - data/chat-history.json
# - data/pending-plans.json
# - data/user-settings.json
```

### Database Connection Pool

The database module uses connection pooling for efficiency:

```javascript
const db = require('./src/database/connection');

// Execute a query
const results = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

// Use transactions
await db.transaction(async (connection) => {
  await connection.execute('INSERT INTO tasks...', [...]);
  await connection.execute('UPDATE users...', [...]);
});
```

### Troubleshooting Database Issues

**Connection Refused**
```bash
# Check MySQL is running
sudo systemctl status mysql

# Start MySQL if needed
sudo systemctl start mysql
```

**Authentication Failed**
```bash
# Reset MySQL root password
sudo mysql
ALTER USER 'nigents'@'localhost' IDENTIFIED BY 'nigents_password';
FLUSH PRIVILEGES;
```

**Missing Tables**
```bash
# Re-run schema
mysql -unigents -pnigents_password nigents < src/database/schema.sql
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
| Custom / GLM | Your AI endpoint | Default agent model (see Configuration) |
| `OPENAI_API_KEY` | platform.openai.com | Whisper voice transcription |
| `GITLAB_TOKEN` | GitLab Settings | GitLab API access |
| `DB_*` | MySQL | Optional; when set, dashboard and plans use MySQL |

---

**Nigents** — *Night Agents for GitLab*  
Built with ❤️ for developers who sleep while their code ships.

For daily operations, EC2 updates, and troubleshooting, see **[OPERATIONS.md](OPERATIONS.md)**.

