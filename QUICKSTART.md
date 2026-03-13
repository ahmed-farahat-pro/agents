# 🚀 Quick Start Guide - Nigents Telegram Bot

> Get started with your AI development team in 5 minutes

---

## Step 1: Find Your Bot

1. Open **Telegram**
2. Search for: `@nigents_bot` (or your bot's username)
3. Click **START**

---

## Step 2: The Basic Workflow

### 1. Create a Plan

```
/plan Add user authentication to the backend
```

**What happens:**
- Planner agent analyzes your codebase
- Creates step-by-step implementation plan
- Shows you what will be changed

### 2. Approve the Plan

```
/approve
```

**What happens:**
- Plan moves to queue
- Agents will start working tonight

### 3. Go to Sleep! 😴

Agents work overnight while you sleep.

### 4. Wake Up to Results ☀️

You'll receive a message with:
- Summary of work done
- Link to Merge Request on GitLab
- All tests passing

---

## 🎙️ Even Easier - Use Voice!

1. Hold microphone button in Telegram
2. Say: *"Add payment processing with Stripe"*
3. Release
4. Bot transcribes and creates plan automatically!

Works in **Arabic** and **English**.

---

## 📱 Essential Commands

| Command | What It Does |
|---------|--------------|
| `/start` | Show welcome message and all commands |
| `/plan <task>` | Create implementation plan |
| `/approve` | Approve plan for implementation |
| `/status` | Check current task progress |
| `/repos` | List your GitLab repositories |
| `/meet <agent>` | Chat with specific agent |

---

## 💡 Example Tasks

Try these:

```
/plan Create a login page with email and password
/plan Add database table for user orders
/plan Implement JWT authentication
/plan Create API endpoint for user profile
/plan Fix the memory leak in report generation
```

---

## 🔄 Full Example Session

**You:**
```
/plan Add password reset functionality
```

**Bot (5 min later):**
```
📋 Implementation Plan Created

**Task:** Add password reset
**Files to modify:**
• AuthController.java
• PasswordResetService.java
• EmailService.java

**Steps:**
1. Create password reset endpoint
2. Generate secure tokens
3. Send email with reset link
4. Validate tokens

Reply with /approve to start
```

**You:**
```
/approve
```

**Bot:**
```
✅ Approved! Starting tonight at 10 PM.
```

**Next Morning:**
```
🎉 Task Complete!

✅ 4 files modified
✅ 8 tests added (all passing)
✅ Code reviewed

🔗 Merge Request: https://gitlab.com/.../merge_requests/12
```

---

## 🆘 Need Help?

- **Bot not responding?** Check dashboard to ensure it's running
- **Plan not good?** Send a more detailed description
- **Want to cancel?** Use `/cancel <task-id>`
- **Check logs:** Use `/logs` or visit dashboard

---

## 📖 Full Documentation

See [TELEGRAM_GUIDE.md](TELEGRAM_GUIDE.md) for complete documentation.

---

**🦉 Sleep well, code better!**
