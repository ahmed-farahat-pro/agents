#!/bin/bash
# EMERGENCY FIX - Run this on EC2 if API routes return 404

set -e

echo "=========================================="
echo "  EMERGENCY FIX - API 404 ERROR"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Killing all PM2 processes..."
pm2 kill || true
sleep 2

echo ""
echo "2. Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo ""
echo "3. Installing dependencies..."
npm ci --production

echo ""
echo "4. Checking .env file..."
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Telegram Bot
TELEGRAM_BOT_TOKEN=placeholder
TELEGRAM_CHAT_ID=placeholder

# AI APIs
ANTHROPIC_API_KEY=placeholder

# GitLab
GITLAB_TOKEN=placeholder
GITLAB_NAMESPACE=bonyad-tech

# Server
PORT=4000
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=admin123

# Gmail
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm
EOF
fi

# Ensure Gmail is in .env
if ! grep -q "GMAIL_USER" .env; then
    echo "" >> .env
    echo "# Gmail Configuration" >> .env
    echo "GMAIL_USER=nigents.learn@gmail.com" >> .env
    echo "GMAIL_PASS=xpup jrho cjxv kqmm" >> .env
fi

echo ""
echo "5. Creating materials directory..."
mkdir -p /home/ubuntu/nigents/src/dashboard/public/materials

echo ""
echo "6. Starting server FRESH..."
pm2 start src/dashboard/server.js --name nigents-dashboard --update-env

echo ""
echo "7. Waiting for startup..."
sleep 5

echo ""
echo "8. Testing API endpoints..."
echo "   Testing /api/status..."
curl -s http://localhost:4000/api/status | head -c 200

echo ""
echo "   Testing /api/materials/email-config..."
curl -s http://localhost:4000/api/materials/email-config

echo ""
echo "   Testing /api/materials/pdfs..."
curl -s http://localhost:4000/api/materials/pdfs

echo ""
echo "   Testing /api/materials/subscribe..."
curl -s -X POST http://localhost:4000/api/materials/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","roadmap":"fullstack"}'

echo ""
echo ""
echo "=========================================="
echo "  FIX COMPLETE!"
echo "=========================================="
pm2 status
echo ""
echo "Check logs: pm2 logs nigents-dashboard"
