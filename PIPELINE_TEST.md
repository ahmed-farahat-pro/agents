# 🔄 CI/CD Pipeline Testing Guide

> Verify GitLab CI/CD auto-deployment is working correctly

---

## ✅ Pre-Test Checklist

Before testing, ensure these are configured:

- [ ] GitLab CI/CD variables set (`EC2_HOST`, `EC2_SSH_KEY`)
- [ ] EC2 has the code cloned at `/home/ubuntu/nightowl`
- [ ] App is running (`pm2 status` shows both processes)
- [ ] App is accessible at `https://nigents.com`

---

## Step 1: Verify GitLab CI/CD Variables

1. Go to https://gitlab.com/bonyad-tech/nigents → **Settings** → **CI/CD** → **Variables**
2. Confirm these exist:

| Variable | Type | Status |
|----------|------|--------|
| `EC2_HOST` | Variable | ✅ Your EC2 public IP |
| `EC2_SSH_KEY` | File | ✅ Full .pem content |
| `TELEGRAM_BOT_TOKEN` | Variable | ✅ (optional) |
| `TELEGRAM_CHAT_ID` | Variable | ✅ (optional) |

---

## Step 2: Test Pipeline with Simple Change

### 2.1 Make a Test Change

On your local machine:

```bash
# Go to your local repo
cd /path/to/nightowl

# Make sure you're on main branch
git checkout main

# Pull latest
git pull gitlab main

# Make a small test change
echo "Pipeline test: $(date)" >> PIPELINE_TEST.md
git add PIPELINE_TEST.md
git commit -m "chore: test CI/CD pipeline deployment"

# Push to GitLab
git push gitlab main
```

### 2.2 Monitor Pipeline

1. Go to https://gitlab.com/bonyad-tech/nigents/-/pipelines
2. You should see a new pipeline running
3. Click on it to see details:

```
Pipeline #1 (running)
├─ 🧪 test (running)
│  ├─ lint
│  └─ test-mcp-builds
├─ 🔨 build (pending)
│  └─ build-mcps
└─ 🚀 deploy (pending)
   ├─ deploy-to-ec2
   └─ notify-telegram
```

### 2.3 Expected Timeline

| Stage | Duration | Status Indicator |
|-------|----------|------------------|
| Test | ~2 min | Green checkmark |
| Build | ~3 min | Green checkmark |
| Deploy | ~2 min | Green checkmark |

**Total:** ~7 minutes

---

## Step 3: Verify Deployment on EC2

### 3.1 SSH to EC2

```bash
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP
```

### 3.2 Check Git History

```bash
cd /home/ubuntu/nightowl
git log --oneline -3
```

**Expected:** You should see your latest commit:
```
abc1234 chore: test CI/CD pipeline deployment
xyz5678 docs: update README
... older commits
```

### 3.3 Check PM2 Status

```bash
pm2 status
```

**Expected:** Both processes should be online with recent restart time:
```
┌────┬───────────────────┬────────┬─────────┬──────────┐
│ id │ name              │ status │ restart │ uptime   │
├────┼───────────────────┼────────┼─────────┼──────────┤
│ 0  │ nigents-bot       │ online │ 0       │ 2m       │
│ 1  │ nigents-dashboard │ online │ 0       │ 2m       │
└────┴───────────────────┴────────┴─────────┴──────────┘
```

### 3.4 Check Logs for Errors

```bash
# Recent logs
pm2 logs --lines 50

# No errors should appear
```

---

## Step 4: Test Real Code Change

### 4.1 Make a Visible Change

```bash
# On your local machine
git checkout main
git pull gitlab main

# Edit dashboard title (example)
nano src/dashboard/public/index.html

# Find <title> and change it:
# <title>Nigents Dashboard - DEPLOYED</title>

git add src/dashboard/public/index.html
git commit -m "feat: update dashboard title to test deployment"
git push gitlab main
```

### 4.2 Wait for Pipeline

1. Watch pipeline at https://gitlab.com/bonyad-tech/nigents/-/pipelines
2. Wait for all green checkmarks (~7 min)

### 4.3 Verify Change on Live Site

1. Open https://nigents.com in browser
2. Check browser tab title shows your change
3. Or view page source (Ctrl+U) and search for the change

---

## Step 5: Test MCP Server Rebuild

### 5.1 Modify an MCP Server

```bash
# Edit an MCP server source file
nano mcp-servers/arabic-rtl-auditor/src/index.ts

# Make any small change (add a comment)
# Save and commit

git add mcp-servers/arabic-rtl-auditor/src/index.ts
git commit -m "test: modify MCP to verify build in pipeline"
git push gitlab main
```

### 5.2 Verify Build on EC2

After pipeline completes:

```bash
# SSH to EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Check if MCP was rebuilt
ls -la mcp-servers/arabic-rtl-auditor/dist/

# Should show recent timestamp
cd mcp-servers/arabic-rtl-auditor && git log --oneline -1
```

---

## Step 6: Verify Telegram Notifications (Optional)

If you configured `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`:

1. Push any change
2. Wait for pipeline to complete
3. Check Telegram - should receive:
   ```
   🚀 *Nigents Deployment*
   
   Status: ✅ SUCCESS
   Branch: main
   Commit: abc1234
   Message: test: modify MCP
   Author: Your Name
   
   Dashboard: https://nigents.com
   ```

---

## Troubleshooting Pipeline Failures

### Issue: Pipeline Fails at SSH Step

```bash
# Test SSH from your laptop
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Check GitLab variable EC2_SSH_KEY
# Must be full .pem content including headers
```

### Issue: Pipeline Passes But Changes Not Applied

```bash
# SSH to EC2 and check
cd /home/ubuntu/nightowl
git status

# If dirty, reset:
git reset --hard origin/main
pm2 restart all
```

### Issue: MCP Build Fails in Pipeline

```bash
# SSH to EC2 and rebuild manually
cd /home/ubuntu/nightowl
cd mcp-servers/arabic-rtl-auditor && npm ci && npm run build
cd ../task-splitter && npm ci && npm run build
cd ../smart-code-search && npm ci && npm run build
pm2 restart all
```

### Issue: Pipeline Stuck

1. Go to GitLab → CI/CD → Pipelines
2. Find stuck pipeline
3. Click **Cancel pipeline**
4. Push new commit to retry

---

## ✅ Success Criteria

Your CI/CD is working if:

- [ ] Push to `main` triggers pipeline automatically
- [ ] Pipeline completes all stages (green checkmarks)
- [ ] Code changes appear on https://nigents.com within 10 minutes
- [ ] PM2 processes restart with new code
- [ ] MCP servers rebuild automatically
- [ ] No manual intervention needed

---

## 🎯 Daily Workflow (After CI/CD Works)

```bash
# 1. Make changes locally
git checkout -b feature/my-feature
# ... edit files ...
git add .
git commit -m "feat: add new feature"

# 2. Push to GitLab
git push gitlab feature/my-feature

# 3. Merge via GitLab UI (creates MR, then merge to main)
# OR merge locally:
git checkout main
git merge feature/my-feature
git push gitlab main

# 4. Pipeline auto-deploys to EC2
# 5. Check https://nigents.com for changes
```

---

**🎉 Once all tests pass, your CI/CD is fully operational!**
Pipeline test: Sat Mar 14 00:44:41 EET 2026
