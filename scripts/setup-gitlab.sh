#!/bin/bash
# Setup GitLab remote and push code
# Usage: ./scripts/setup-gitlab.sh YOUR_GITLAB_USERNAME

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Please provide your GitLab username"
    echo "Usage: ./scripts/setup-gitlab.sh your_username"
    exit 1
fi

GITLAB_USER=$1
GITLAB_REPO="git@gitlab.com:$GITLAB_USER/nigents.git"

echo "🦉 Nigents GitLab Setup"
echo "======================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "❌ Error: Please run this script from the nightowl root directory"
    exit 1
fi

echo "📋 Step 1: Checking git remotes..."
if git remote | grep -q "gitlab"; then
    echo "⚠️  GitLab remote already exists"
    git remote -v | grep gitlab
else
    echo "➕ Adding GitLab remote: $GITLAB_REPO"
    git remote add gitlab $GITLAB_REPO
    echo "✅ GitLab remote added"
fi

echo ""
echo "📋 Step 2: Verifying GitLab CI/CD file..."
if [ -f ".gitlab-ci.yml" ]; then
    echo "✅ .gitlab-ci.yml found"
else
    echo "❌ .gitlab-ci.yml not found! Creating from template..."
    cat > .gitlab-ci.yml << 'YAML'
stages:
  - test
  - build
  - deploy

variables:
  SSH_PRIVATE_KEY: $EC2_SSH_KEY
  SSH_USER: ubuntu
  EC2_HOST: $EC2_HOST
  DEPLOY_DIR: /home/ubuntu/nightowl

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/
    - mcp-servers/*/node_modules/

default:
  before_script:
    - apk add --no-cache openssh-client bash
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
    - ssh-keyscan -H $EC2_HOST >> ~/.ssh/known_hosts
    - chmod 644 ~/.ssh/known_hosts

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - node --check src/bot.js
    - node --check src/dashboard/server.js
  only:
    - main
    - feature/*

build-mcps:
  stage: build
  image: node:20-alpine
  script:
    - cd mcp-servers/arabic-rtl-auditor && npm ci && npm run build && cd ../..
    - cd mcp-servers/task-splitter && npm ci && npm run build && cd ../..
    - cd mcp-servers/smart-code-search && npm ci && npm run build && cd ../..
  only:
    - main

deploy:
  stage: deploy
  image: alpine:latest
  environment:
    name: production
    url: https://nigents.com
  script:
    - |
      ssh -o StrictHostKeyChecking=no $SSH_USER@$EC2_HOST << 'EOF'
        cd /home/ubuntu/nightowl
        git fetch origin
        git reset --hard origin/main
        npm ci --production
        cd mcp-servers/arabic-rtl-auditor && npm ci && npm run build && cd ../..
        cd mcp-servers/task-splitter && npm ci && npm run build && cd ../..
        cd mcp-servers/smart-code-search && npm ci && npm run build && cd ../..
        pm2 reload nigents-bot --update-env || pm2 start src/bot.js --name nigents-bot
        pm2 reload nigents-dashboard --update-env || pm2 start src/dashboard/server.js --name nigents-dashboard
        pm2 save
        echo "✅ Deployment complete!"
      EOF
  only:
    - main
YAML
    echo "✅ .gitlab-ci.yml created"
fi

echo ""
echo "📋 Step 3: Pushing to GitLab..."
git add -A
git commit -m "chore: setup GitLab CI/CD pipeline" 2>/dev/null || echo "⚠️  Nothing to commit"

echo ""
echo "🚀 Pushing current branch to GitLab..."
git push -u gitlab $(git branch --show-current)

echo ""
echo "======================="
echo "✅ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Go to https://gitlab.com/$GITLAB_USER/nigents"
echo "2. Settings → CI/CD → Variables"
echo "3. Add these variables:"
echo "   - EC2_HOST: Your EC2 IP (e.g., 3.91.48.123)"
echo "   - EC2_SSH_KEY: Your openclaw.pem file content"
echo "   - TELEGRAM_BOT_TOKEN: (optional) for notifications"
echo "   - TELEGRAM_CHAT_ID: (optional) for notifications"
echo ""
echo "4. Push to main branch to trigger deployment"
echo "======================="
