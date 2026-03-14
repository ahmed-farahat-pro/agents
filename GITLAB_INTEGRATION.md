# 🔗 GitLab Integration Setup

> Complete guide to configure GitLab integration for fetching real repositories

---

## Overview

Nigents integrates with GitLab to:
- Fetch your repositories list
- Read code from repositories
- Create branches and merge requests
- Track project activity

---

## Step 1: Create GitLab Personal Access Token

### 1.1 Navigate to Access Tokens

1. Go to https://gitlab.com
2. Click your **avatar** (top right) → **Edit Profile**
3. Left sidebar → **Access Tokens**

**Path:** GitLab.com → Avatar → Edit Profile → Access Tokens

### 1.2 Create New Token

Click **"Add new token"** and fill in:

| Field | Value |
|-------|-------|
| **Token name** | `Nigents` |
| **Expiration date** | 1 year from today |
| **Scopes** | Check ALL of these: |

**Required Scopes:**
- [x] `api` (Full API access)
- [x] `read_repository` (Read repo contents)
- [x] `write_repository` (Create branches, MRs)
- [x] `read_user` (Verify identity)

### 1.3 Copy Token

Click **"Create personal access token"**

**⚠️ IMPORTANT:** Copy the token immediately! It looks like:
```
glpat-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

You cannot see it again after closing the page!

---

## Step 2: Configure Environment Variables

### 2.1 Edit .env on EC2

```bash
# SSH to your EC2
ssh -i ~/Downloads/openclaw.pem ubuntu@YOUR_EC2_IP

# Edit .env file
nano /home/ubuntu/nightowl/.env
```

### 2.2 Add GitLab Settings

Add or update these lines:

```env
# GitLab Integration
GITLAB_TOKEN=glpat-your_token_here
GITLAB_NAMESPACE=bonyad-tech
GITLAB_URL=https://gitlab.com
```

**GITLAB_NAMESPACE:** This is your GitLab username or group name
- Personal: `your-username`
- Group: `your-group-name`
- Sub-group: `group/subgroup`

### 2.3 Save and Secure

```bash
# Save file (Ctrl+X, Y, Enter)

# Secure permissions
chmod 600 /home/ubuntu/nightowl/.env
```

---

## Step 3: Restart Application

```bash
# Restart all services
pm2 restart all

# Check status
pm2 status

# Check logs for errors
pm2 logs --lines 20
```

---

## Step 4: Test GitLab API

### 4.1 Test from EC2

```bash
# Test token
 curl --header "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
   "https://gitlab.com/api/v4/user"

# Should return your user info
```

### 4.2 Test from Dashboard

1. Open https://nigents.com
2. Go to **GitLab Repos** in sidebar
3. Click **Refresh** button
4. Your repositories should appear!

---

## Troubleshooting

### Issue: "GitLab Not Configured" Message

**Cause:** GITLAB_TOKEN or GITLAB_NAMESPACE not set

**Fix:**
```bash
# Check if set
grep GITLAB /home/ubuntu/nightowl/.env

# Should show:
# GITLAB_TOKEN=glpat-...
# GITLAB_NAMESPACE=bonyad-tech

# If missing, add them and restart
pm2 restart all
```

### Issue: "Invalid GitLab Token" Error

**Cause:** Token expired or wrong format

**Fix:**
1. Create new token at GitLab → Profile → Access Tokens
2. Update .env with new token
3. Restart: `pm2 restart all`

### Issue: "No Repositories Found"

**Cause:** Wrong namespace or no access

**Fix:**
```bash
# Test API directly
curl -H "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  "https://gitlab.com/api/v4/projects?membership=true"

# Check namespace
grep GITLAB_NAMESPACE /home/ubuntu/nightowl/.env

# Should match your GitLab username or group
```

### Issue: Dashboard Shows Dummy Data

**Fix:** Hard refresh browser:
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

Or clear localStorage:
```javascript
// In browser console (F12)
localStorage.removeItem('nigents_repos');
location.reload();
```

---

## API Endpoints

The dashboard provides these GitLab API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gitlab/config` | GET | Check GitLab configuration status |
| `/api/gitlab/repos` | GET | Fetch all accessible repositories |
| `/api/gitlab/repos/:path` | GET | Get specific repository details |

### Test API

```bash
# Check config
curl http://localhost:4000/api/gitlab/config

# Fetch repos
curl http://localhost:4000/api/gitlab/repos
```

---

## Self-Hosted GitLab

For self-hosted GitLab instances:

```env
GITLAB_URL=https://gitlab.yourcompany.com
GITLAB_TOKEN=glpat-your_token
GITLAB_NAMESPACE=your-group
```

Make sure your EC2 can reach the GitLab instance (VPN if needed).

---

## Quick Checklist

- [ ] Created Personal Access Token (not Project token)
- [ ] Token has `api`, `read_repository`, `write_repository` scopes
- [ ] Added GITLAB_TOKEN to .env
- [ ] Added GITLAB_NAMESPACE to .env
- [ ] Restarted PM2 (`pm2 restart all`)
- [ ] Dashboard shows real repos (not dummy data)
- [ ] Can select a repository

---

## Example .env Configuration

```env
# GitLab (REQUIRED for repo access)
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_NAMESPACE=bonyad-tech
GITLAB_URL=https://gitlab.com

# Other settings...
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
ANTHROPIC_API_KEY=sk-ant-...
```

---

**🎉 Once configured, your repositories will appear in the dashboard!**
