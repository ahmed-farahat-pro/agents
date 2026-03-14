#!/bin/bash
# Debug Telegram Bot Issues

echo "=========================================="
echo "  TELEGRAM BOT DEBUG"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Checking PM2 status..."
pm2 status

echo ""
echo "2. Checking bot logs..."
pm2 logs nigents-bot --lines 50 --nostream 2>/dev/null || echo "No bot logs found"

echo ""
echo "3. Checking if bot process is running..."
ps aux | grep -E "node.*bot|nigents-bot" | grep -v grep

echo ""
echo "4. Checking .env for Telegram config..."
if grep -q "TELEGRAM_BOT_TOKEN" .env; then
    TOKEN=$(grep "TELEGRAM_BOT_TOKEN" .env | cut -d'=' -f2 | head -1)
    if [ -n "$TOKEN" ] && [ "$TOKEN" != "placeholder" ] && [ "$TOKEN" != "your_bot_token" ]; then
        echo "✓ TELEGRAM_BOT_TOKEN is set"
        echo "  Token: ${TOKEN:0:10}..."
    else
        echo "✗ TELEGRAM_BOT_TOKEN is placeholder or empty"
        echo "  Value: $TOKEN"
    fi
else
    echo "✗ TELEGRAM_BOT_TOKEN not found in .env"
fi

if grep -q "TELEGRAM_CHAT_ID" .env; then
    CHAT_ID=$(grep "TELEGRAM_CHAT_ID" .env | cut -d'=' -f2 | head -1)
    if [ -n "$CHAT_ID" ] && [ "$CHAT_ID" != "placeholder" ]; then
        echo "✓ TELEGRAM_CHAT_ID is set: $CHAT_ID"
    else
        echo "✗ TELEGRAM_CHAT_ID is placeholder or empty"
    fi
else
    echo "✗ TELEGRAM_CHAT_ID not found in .env"
fi

echo ""
echo "5. Testing Telegram API directly..."
TOKEN=$(grep "TELEGRAM_BOT_TOKEN" .env | cut -d'=' -f2 | head -1)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "placeholder" ]; then
    echo "Getting bot info from Telegram..."
    curl -s "https://api.telegram.org/bot${TOKEN}/getMe" | head -c 500
    echo ""
else
    echo "Skipping API test - no valid token"
fi

echo ""
echo "6. Checking for port conflicts..."
netstat -tlnp 2>/dev/null | grep -E "4000|3000" || ss -tlnp 2>/dev/null | grep -E "4000|3000"

echo ""
echo "7. Checking single instance lock..."
ls -la /tmp/nigents*.lock 2>/dev/null || echo "No lock files found"

echo ""
echo "=========================================="
echo "  RESTART BOT"
echo "=========================================="
echo ""
echo "To restart the bot:"
echo "  pm2 stop nigents-bot"
echo "  pm2 delete nigents-bot"
echo "  pm2 start src/bot.js --name nigents-bot"
echo ""
echo "Or full restart:"
echo "  pm2 restart all"
