#!/bin/bash
# Debug Telegram Bot - No Response Issue

echo "=========================================="
echo "  TELEGRAM BOT DEBUG - NO RESPONSE"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Checking if bot process is running..."
pm2 status | grep nigents-bot

echo ""
echo "2. Checking bot logs for errors..."
echo "--- Last 30 lines ---"
pm2 logs nigents-bot --lines 30 --nostream 2>/dev/null || echo "No logs available"

echo ""
echo "3. Checking .env configuration..."
TOKEN=$(grep "TELEGRAM_BOT_TOKEN" .env 2>/dev/null | cut -d'=' -f2 | head -1)
CHAT_ID=$(grep "TELEGRAM_CHAT_ID" .env 2>/dev/null | cut -d'=' -f2 | head -1)

if [ -z "$TOKEN" ] || [ "$TOKEN" = "placeholder" ] || [ "$TOKEN" = "your_bot_token" ]; then
    echo "✗ TELEGRAM_BOT_TOKEN is not set or is placeholder"
else
    echo "✓ TELEGRAM_BOT_TOKEN: ${TOKEN:0:15}..."
fi

if [ -z "$CHAT_ID" ] || [ "$CHAT_ID" = "placeholder" ]; then
    echo "✗ TELEGRAM_CHAT_ID is not set or is placeholder"
else
    echo "✓ TELEGRAM_CHAT_ID: $CHAT_ID"
fi

echo ""
echo "4. Testing Telegram API..."
if [ -n "$TOKEN" ] && [ "$TOKEN" != "placeholder" ]; then
    echo "Getting bot info..."
    BOT_INFO=$(curl -s "https://api.telegram.org/bot${TOKEN}/getMe")
    echo "Response: $BOT_INFO"
    
    if echo "$BOT_INFO" | grep -q '"ok":true'; then
        echo "✓ Bot token is valid"
        BOT_NAME=$(echo "$BOT_INFO" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
        echo "  Bot username: @$BOT_NAME"
    else
        echo "✗ Bot token is INVALID or revoked"
    fi
    
    echo ""
    echo "Checking webhook status..."
    WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo")
    echo "Webhook: $WEBHOOK_INFO"
    
    if echo "$WEBHOOK_INFO" | grep -q '"url":"[^"]*"'; then
        WEBHOOK_URL=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$WEBHOOK_URL" ]; then
            echo "⚠ Webhook is set: $WEBHOOK_URL"
            echo "  This may conflict with polling!"
        fi
    fi
else
    echo "Skipping API test - no valid token"
fi

echo ""
echo "5. Testing send message..."
if [ -n "$TOKEN" ] && [ "$TOKEN" != "placeholder" ] && [ -n "$CHAT_ID" ] && [ "$CHAT_ID" != "placeholder" ]; then
    echo "Sending test message to $CHAT_ID..."
    TEST_MSG=$(curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        -d "text=🔧 Test message from debug script")
    echo "Response: $TEST_MSG"
    
    if echo "$TEST_MSG" | grep -q '"ok":true'; then
        echo "✓ Message sent successfully!"
    else
        echo "✗ Failed to send message"
        ERROR=$(echo "$TEST_MSG" | grep -o '"description":"[^"]*"' | cut -d'"' -f4)
        echo "  Error: $ERROR"
    fi
else
    echo "Skipping - no valid token or chat ID"
fi

echo ""
echo "6. Checking for errors in code..."
node --check src/bot.js 2>&1 | head -10 || echo "Syntax error in bot.js!"
node --check src/agents/planner.js 2>&1 | head -10 || echo "Syntax error in planner.js!"

echo ""
echo "7. Checking authorized users..."
echo "Authorized chat ID from .env: $CHAT_ID"
echo ""
echo "IMPORTANT: Make sure you're sending messages from this chat ID!"
echo "To get your chat ID:"
echo "  1. Message @userinfobot on Telegram"
echo "  2. Or check the logs when you send a message"

echo ""
echo "=========================================="
echo "  RESTART BOT"
echo "=========================================="
echo ""
echo "To restart the bot:"
echo "  pm2 stop nigents-bot"
echo "  pm2 delete nigents-bot"
echo "  pm2 start src/bot.js --name nigents-bot"
echo "  pm2 logs nigents-bot"
