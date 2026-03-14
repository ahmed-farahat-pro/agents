#!/bin/bash
# Start both Dashboard and Bot servers

echo "=========================================="
echo "  STARTING NIGENTS SERVICES"
echo "=========================================="

cd /home/ubuntu/nigents

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "Step 1: Checking for port conflicts..."
sudo fuser -k 4000/tcp 2>/dev/null && echo "Killed process on port 4000" || echo "Port 4000 is free"

echo ""
echo "Step 2: Stopping old PM2 processes..."
pm2 stop all 2>/dev/null || true
sleep 2

echo ""
echo "Step 3: Checking node_modules..."
if [ ! -d "node_modules/dotenv" ] || [ ! -d "node_modules/express" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo -e "${GREEN}✓ Dependencies OK${NC}"
fi

echo ""
echo "Step 4: Checking .env file..."
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
# Server Configuration
PORT=4000
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=admin123
NODE_ENV=production

# Gmail Configuration
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm

# Telegram (update these)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# GitLab (update these)
GITLAB_TOKEN=your_gitlab_token
GITLAB_NAMESPACE=bonyad-tech
GITLAB_URL=https://gitlab.com

# Feature Flags
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=false
EOF
    echo -e "${YELLOW}⚠ .env created with placeholder values - please update!${NC}"
else
    # Ensure Gmail is set
    if ! grep -q "GMAIL_USER" .env; then
        echo "" >> .env
        echo "# Gmail Configuration" >> .env
        echo "GMAIL_USER=nigents.learn@gmail.com" >> .env
        echo "GMAIL_PASS=xpup jrho cjxv kqmm" >> .env
        echo "Added Gmail config to .env"
    fi
    echo -e "${GREEN}✓ .env file OK${NC}"
fi

echo ""
echo "Step 5: Creating required directories..."
mkdir -p data
mkdir -p logs
mkdir -p src/dashboard/public/materials
echo -e "${GREEN}✓ Directories OK${NC}"

echo ""
echo "Step 6: Starting Dashboard..."
pm2 start src/dashboard/server.js --name nigents-dashboard --update-env
echo -e "${GREEN}✓ Dashboard started${NC}"

echo ""
echo "Step 7: Starting Telegram Bot..."
if grep -q "TELEGRAM_BOT_TOKEN=your_bot_token" .env; then
    echo -e "${YELLOW}⚠ Bot not started - TELEGRAM_BOT_TOKEN is placeholder${NC}"
    echo "  Update .env with real token to start bot"
else
    pm2 start src/bot.js --name nigents-bot --update-env
    echo -e "${GREEN}✓ Bot started${NC}"
fi

echo ""
echo "Step 8: Waiting for services to start..."
sleep 5

echo ""
echo "Step 9: Testing services..."
echo "  Testing Dashboard..."
DASHBOARD_TEST=$(curl -s http://localhost:4000/api/status)
if [ -n "$DASHBOARD_TEST" ]; then
    echo -e "${GREEN}  ✓ Dashboard responding${NC}"
else
    echo -e "${RED}  ✗ Dashboard not responding${NC}"
fi

echo "  Testing Materials API..."
MATERIALS_TEST=$(curl -s http://localhost:4000/api/materials/pdfs)
if echo "$MATERIALS_TEST" | grep -q '"success":true'; then
    PDF_COUNT=$(echo "$MATERIALS_TEST" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
    echo -e "${GREEN}  ✓ Materials API OK ($PDF_COUNT PDFs)${NC}"
else
    echo -e "${RED}  ✗ Materials API failed${NC}"
fi

echo "  Testing Email Config..."
EMAIL_TEST=$(curl -s http://localhost:4000/api/materials/email-config)
if echo "$EMAIL_TEST" | grep -q '"configured":true'; then
    echo -e "${GREEN}  ✓ Email configured${NC}"
else
    echo -e "${RED}  ✗ Email NOT configured${NC}"
fi

echo ""
echo "Step 10: Saving PM2 config..."
pm2 save

echo ""
echo "=========================================="
echo "  STARTUP COMPLETE!"
echo "=========================================="
pm2 status
echo ""
echo "Test email subscribe:"
echo "  curl -X POST http://localhost:4000/api/materials/subscribe \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"YOUR_EMAIL@gmail.com\",\"name\":\"Test\",\"roadmap\":\"fullstack\"}'"
echo ""
echo "View logs: pm2 logs"
echo "Stop all: pm2 stop all"
echo "Restart all: pm2 restart all"
