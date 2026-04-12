#!/bin/bash
# Full health check for Nigents - Dashboard, Bot, and Email

echo "=========================================="
echo "  NIGENTS FULL HEALTH CHECK"
echo "=========================================="

cd /home/ubuntu/nigents

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "1. Checking PM2 processes..."
pm2 status

echo ""
echo "2. Checking Dashboard API..."
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/status)
if [ "$DASHBOARD_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Dashboard is responding (HTTP 200)${NC}"
    curl -s http://localhost:4000/api/status | head -c 200
    echo ""
else
    echo -e "${RED}✗ Dashboard not responding (HTTP $DASHBOARD_STATUS)${NC}"
fi

echo ""
echo "3. Checking Materials API..."
MATERIALS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/materials/pdfs)
if [ "$MATERIALS_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Materials API is working${NC}"
    PDF_COUNT=$(curl -s http://localhost:4000/api/materials/pdfs | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
    echo "  PDFs available: $PDF_COUNT"
else
    echo -e "${RED}✗ Materials API not working (HTTP $MATERIALS_STATUS)${NC}"
fi

echo ""
echo "4. Checking Email Configuration..."
EMAIL_CONFIG=$(curl -s http://localhost:4000/api/materials/email-config)
if echo "$EMAIL_CONFIG" | grep -q '"configured":true'; then
    echo -e "${GREEN}✓ Email is configured${NC}"
    echo "  $EMAIL_CONFIG"
else
    echo -e "${RED}✗ Email NOT configured${NC}"
    echo "  $EMAIL_CONFIG"
fi

echo ""
echo "5. Checking Subscribe Endpoint..."
TEST_EMAIL="health-check-$(date +%s)@test.com"
SUBSCRIBE_RESULT=$(curl -s -X POST http://localhost:4000/api/materials/subscribe \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"name\":\"Health Check\",\"roadmap\":\"fullstack\"}")

if echo "$SUBSCRIBE_RESULT" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Subscribe endpoint working${NC}"
    echo "  Response: $SUBSCRIBE_RESULT"
else
    echo -e "${RED}✗ Subscribe endpoint failed${NC}"
    echo "  Response: $SUBSCRIBE_RESULT"
fi

echo ""
echo "6. Checking Telegram Bot..."
BOT_STATUS=$(pm2 status | grep nigents-bot)
if [ -n "$BOT_STATUS" ]; then
    echo -e "${GREEN}✓ Bot process found${NC}"
    echo "  $BOT_STATUS"
else
    echo -e "${YELLOW}⚠ Bot process not found (may be running differently)${NC}"
fi

echo ""
echo "7. Checking .env Configuration..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    # Check Gmail
    if grep -q "GMAIL_USER" .env; then
        GMAIL_USER=$(grep "GMAIL_USER" .env | cut -d'=' -f2)
        echo "  Gmail User: ${GMAIL_USER:0:3}***"
    else
        echo -e "${RED}  ✗ GMAIL_USER not set${NC}"
    fi
    
    # Check Telegram
    if grep -q "TELEGRAM_BOT_TOKEN" .env; then
        echo "  Telegram: Configured"
    else
        echo -e "${YELLOW}  ⚠ TELEGRAM_BOT_TOKEN not set${NC}"
    fi
    
    # Check GitLab
    if grep -q "GITLAB_TOKEN" .env; then
        echo "  GitLab: Configured"
    else
        echo -e "${YELLOW}  ⚠ GITLAB_TOKEN not set${NC}"
    fi
else
    echo -e "${RED}✗ .env file missing!${NC}"
fi

echo ""
echo "8. Checking Data Directory..."
if [ -d "data" ]; then
    echo -e "${GREEN}✓ Data directory exists${NC}"
    echo "  Files:"
    ls -lh data/ | tail -n +2
else
    echo -e "${YELLOW}⚠ Data directory missing, creating...${NC}"
    mkdir -p data
fi

echo ""
echo "9. Recent Logs..."
echo "--- Dashboard Logs (last 10 lines) ---"
pm2 logs nigents-dashboard --lines 10 --nostream 2>/dev/null || echo "No logs available"

echo ""
echo "=========================================="
echo "  HEALTH CHECK COMPLETE"
echo "=========================================="
echo ""
echo "To test email manually:"
echo "  curl -X POST http://localhost:4000/api/materials/subscribe \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"YOUR_EMAIL@gmail.com\",\"name\":\"Test\",\"roadmap\":\"fullstack\"}'"
echo ""
echo "To restart services:"
echo "  pm2 restart all"
echo ""
echo "To view logs:"
echo "  pm2 logs"
