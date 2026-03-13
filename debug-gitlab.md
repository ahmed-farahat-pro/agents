# Debug GitLab Repos Not Loading

## Step 1: Test API on EC2

SSH to your EC2 and run:

```bash
# Test GitLab config API
curl http://localhost:4000/api/gitlab/config

# Expected output:
# {"configured":true,"hasToken":true,"hasNamespace":true,"namespace":"bonyad-tech"}

# Test repos API
curl http://localhost:4000/api/gitlab/repos

# Expected: List of repos or error message
```

## Step 2: Check .env on EC2

```bash
grep GITLAB /home/ubuntu/nigents/.env

# Should show:
# GITLAB_TOKEN=glpat-...
# GITLAB_NAMESPACE=bonyad-tech
# GITLAB_URL=https://gitlab.com
```

## Step 3: Test GitLab API directly

```bash
curl -H "PRIVATE-TOKEN: glpat-YOUR_TOKEN" \
  https://gitlab.com/api/v4/projects?membership=true
```

## Step 4: Check Dashboard Logs

Open browser console (F12) and check:
1. Network tab - look for `/api/gitlab/repos` request
2. Console tab - any JavaScript errors

## Common Issues

### Issue 1: CORS error
**Fix:** API should be accessible from same origin

### Issue 2: Token not set
**Fix:** Add GITLAB_TOKEN to .env and restart

### Issue 3: API returning empty array
**Fix:** Check namespace matches your GitLab username/group
