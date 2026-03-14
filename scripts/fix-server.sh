#!/bin/bash
# Fix server issues - port conflict and missing modules

echo "=========================================="
echo "  FIXING SERVER ISSUES"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Killing all processes on port 4000..."
sudo fuser -k 4000/tcp 2>/dev/null || true
sudo kill $(sudo lsof -t -i:4000) 2>/dev/null || true
sleep 2

echo ""
echo "2. Stopping PM2..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
sleep 2

echo ""
echo "3. Checking node_modules..."
if [ ! -d "node_modules" ] || [ ! -f "node_modules/dotenv/package.json" ]; then
    echo "node_modules missing or incomplete. Reinstalling..."
    rm -rf node_modules package-lock.json
    npm install
else
    echo "node_modules exists, checking for dotenv..."
    if [ ! -d "node_modules/dotenv" ]; then
        echo "dotenv missing. Reinstalling..."
        npm install
    fi
fi

echo ""
echo "4. Verifying .env file..."
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
PORT=4000
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=admin123
NODE_ENV=production

# Gmail
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm

# Placeholders
TELEGRAM_BOT_TOKEN=placeholder
TELEGRAM_CHAT_ID=placeholder
GITLAB_TOKEN=placeholder
GITLAB_NAMESPACE=bonyad-tech
EOF
fi

# Ensure Gmail is configured
if ! grep -q "GMAIL_USER" .env; then
    echo "" >> .env
    echo "GMAIL_USER=nigents.learn@gmail.com" >> .env
    echo "GMAIL_PASS=xpup jrho cjxv kqmm" >> .env
fi

echo ""
echo "5. Creating directories..."
mkdir -p data
mkdir -p src/dashboard/public/materials

echo ""
echo "6. Starting server..."
pm2 start src/dashboard/server.js --name nigents-dashboard

echo ""
echo "7. Waiting for startup..."
sleep 5

echo ""
echo "8. Testing..."
curl -s http://localhost:4000/api/status | head -c 100
echo ""
curl -s http://localhost:4000/api/materials/pdfs
echo ""

echo ""
echo "=========================================="
echo "  FIX COMPLETE!"
echo "=========================================="
pm2 status
echo ""
echo "Check logs: pm2 logs nigents-dashboard"
