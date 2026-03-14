# 📱 Telegram Bot User Guide

> Complete guide to using Nigents via Telegram

---

## 🚀 Quick Start Workflow

```
Step 1: Send /start
        ↓
Step 2: Select project with /repos
        ↓
Step 3: Create task with /plan
        ↓
Step 4: Review plan
        ↓
Step 5: Approve with /approve
        ↓
Step 6: Sleep! Agents work overnight
        ↓
Step 7: Wake up to Merge Request
```

---

## 🤖 How to Contact the Bot

### 1. Find Your Bot

1. Open **Telegram** on your phone or desktop
2. Search for your bot username (e.g., `@nigents_bot`)
3. Click **Start** or send `/start`

### 2. First Time Setup

Send:
```
/start
```

**Bot responds with:**
- Welcome message
- List of available commands
- Voice support info

---

## 📋 Complete Workflow Example

### Step 1: Check Available Repositories

```
/repos
```

**Bot responds:**
```
✅ Connected to GitLab as Ahmed (@ahmed-farahat-pro)

Your repositories:
• bonyad-tech/nigents
• bonyad-tech/backend
• bonyad-tech/frontend

Active project: bonyad-tech/nigents
```

### Step 2: Create a Task Plan

```
/plan Add user authentication with JWT tokens to the backend API
```

**Bot thinks...** (Planner agent analyzes the codebase)

**Bot responds with plan:**
```markdown
📋 **Implementation Plan: Add JWT Authentication**

**Project:** bonyad-tech/backend
**Complexity:** Medium
**Estimated Time:** 4-6 hours

**Analysis:**
The codebase uses Spring Boot with existing User entity.
Need to add:
- JWT token generation
- Login endpoint
- Token validation filter
- Secure password hashing

**Implementation Steps:**
1. Add JWT dependencies to pom.xml
2. Create JwtTokenProvider class
3. Create AuthController with /login endpoint
4. Create JwtAuthenticationFilter
5. Update SecurityConfig
6. Add unit tests

**Files to Modify:**
• pom.xml - Add jjwt dependency
• src/main/java/com/bonyad/security/JwtTokenProvider.java (NEW)
• src/main/java/com/bonyad/controller/AuthController.java (NEW)
• src/main/java/com/bonyad/security/JwtAuthenticationFilter.java (NEW)
• src/main/java/com/bonyad/config/SecurityConfig.java (MODIFY)

**Branch:** nigents/task-auth-jwt

Reply with **/approve** to queue this for implementation.
```

### Step 3: Review and Approve

If the plan looks good:
```
/approve
```

**Bot responds:**
```
✅ Plan approved and queued for implementation!

Task: Add JWT Authentication
Queue position: #1
Estimated start: Tonight at 10:00 PM

You'll receive updates as agents work on it.
```

### Step 4: Start Implementation (Optional)

Normally runs automatically at night, but you can start immediately:
```
/run
```

**Bot responds:**
```
🚀 Starting implementation now!

Orchestrator: Task assigned to Backend Dev
Backend Dev: Starting implementation...

Sleep well! 🌙
```

### Step 5: Track Progress

Check status anytime:
```
/status
```

**Bot responds:**
```
📊 **Current Status**

🟢 Backend Dev: Writing JwtTokenProvider.java (75%)
🟡 QA Tester: Waiting for completion
⚪ Code Reviewer: Waiting
⚪ Reporter: Waiting

⏱️ Estimated completion: 2 hours
```

### Step 6: Completion Report

**Next morning, bot sends:**
```
🎉 **Implementation Complete!**

✅ All tasks finished successfully

**Summary:**
• 5 files created/modified
• 12 unit tests added
• All tests passing
• Code reviewed and approved

**Merge Request:**
https://gitlab.com/bonyad-tech/backend/-/merge_requests/42

Branch: nigents/task-auth-jwt → main

Review and merge when ready!
```

---

## 🎙️ Voice Commands

You can send **voice notes** instead of typing:

1. Hold the microphone button in Telegram
2. Speak your task (Arabic or English)
3. Release to send

**Example voice message:**
> "Add a payment webhook for HyperPay to handle refund notifications"

**Bot transcribes and processes it automatically!**

---

## 📚 All Available Commands

### Planning Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/plan <task>` | Create implementation plan | `/plan Add user login` |
| `/approve` | Approve pending plan | `/approve` |
| `/run` | Start implementation now | `/run` |

### Information Commands
| Command | Description |
|---------|-------------|
| `/status` | View current task status |
| `/queue` | List all queued tasks |
| `/standup` | Daily agent standup report |
| `/costs` | API usage costs |
| `/repos` | List GitLab repositories |

### Agent Chat Commands
| Command | Description |
|---------|-------------|
| `/meet <agent>` | Chat with specific agent |
| `/meet planner` | Talk to Planner agent |
| `/meet backend` | Talk to Backend Dev |
| `/meet frontend` | Talk to Frontend Dev |
| `/meet qa` | Talk to QA Tester |
| `/meet reviewer` | Talk to Code Reviewer |

### Management Commands
| Command | Description | Example |
|---------|-------------|---------|
| `/ask <question>` | Ask about your code | `/ask How does auth work?` |
| `/cancel <id>` | Cancel a task | `/cancel task-123` |
| `/logs <agent>` | View agent logs | `/logs backend` |

---

## 💬 Chat with Individual Agents

Want to talk to a specific agent?

```
/meet backend
```

**Bot responds:**
```
💬 Now chatting with Backend Dev agent.

Send your message or /exit to stop.
```

**You:**
> What's the best way to implement caching?

**Backend Dev:**
> For this project, I recommend using Redis with Spring Cache...
[Detailed technical response]

**To exit:** Send `/exit` or any other command

---

## 📊 Example Tasks You Can Send

### Backend Tasks
```
/plan Create a REST API endpoint for user registration with email verification
/plan Add database migration for new orders table with indexes
/plan Implement rate limiting for API endpoints
/plan Create a scheduled job to clean up old logs
```

### Frontend Tasks
```
/plan Create a login form with validation and error handling
/plan Add a dashboard widget showing recent orders
/plan Implement dark mode toggle
/plan Create a reusable modal component
```

### Full Features
```
/plan Build a complete shopping cart with add/remove items
/plan Implement payment integration with Stripe
/plan Add user profile page with avatar upload
/plan Create admin panel for managing users
```

### Bug Fixes
```
/plan Fix the memory leak in the report generation service
/plan Resolve the CORS issue on the API endpoints
/plan Fix the login redirect loop
```

---

## 🔄 Daily Workflow Example

### 9:00 PM - Before Bed
```
/plan Implement password reset functionality with email tokens
```

### 9:05 PM - Review Plan
```
/approve
```

### 9:30 PM - Check Status
```
/status
```

**Response:**
```
🟢 Backend Dev: Implementing PasswordResetController (50%)
⏱️ ETA: 2 hours
```

### 7:00 AM - Wake Up
**Bot sent at 6:30 AM:**
```
🎉 Task Complete!

MR: https://gitlab.com/.../merge_requests/43

Review and merge when ready.
```

### 8:00 AM - Code Review
You review the MR on GitLab, everything looks good, you merge!

---

## 🛠️ Troubleshooting

### Bot not responding?
1. Check if bot is running: `/status`
2. Make sure you're using the correct chat ID
3. Check logs in dashboard

### Plan not created?
1. Check GitLab token is configured
2. Verify repository is selected
3. Try simpler task description

### Implementation failed?
```
/logs backend
```
View detailed error logs

### Want to cancel?
```
/cancel task-123
```

---

## 🎯 Tips for Best Results

1. **Be Specific**
   - ❌ "Fix the bug"
   - ✅ "Fix the login timeout error when user password is wrong"

2. **Include Context**
   - Mention file names if you know them
   - Specify the framework/library
   - Describe expected behavior

3. **One Task at a Time**
   - Don't combine multiple features
   - Approve and complete one before starting another

4. **Review Plans Before Approving**
   - Check complexity estimate
   - Verify files to be modified
   - Ensure it matches your expectations

5. **Use Voice for Quick Tasks**
   - Faster than typing
   - Works in Arabic and English
   - Great for mobile

---

## 📱 Mobile vs Desktop

Both work great! Use:
- **Mobile**: Voice messages for quick tasks
- **Desktop**: Typed commands for complex tasks

---

**🦉 Sleep well while your AI team works!**
