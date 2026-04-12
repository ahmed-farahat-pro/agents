#!/bin/bash
# Quick deployment fix script - Run this on EC2 server

set -e

echo "=========================================="
echo "  NIGENTS DEPLOYMENT FIX"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "📥 Pulling latest code..."
git pull origin main

echo ""
echo "📦 Installing dependencies..."
npm ci --production

echo ""
echo "🔧 Checking .env for Gmail..."
if ! grep -q "GMAIL_USER" .env; then
    echo "Adding Gmail config to .env..."
    cat >> .env << 'EOF'

# Gmail Configuration (for sending free materials)
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm
EOF
    echo "✓ Gmail config added"
else
    echo "✓ Gmail config already exists"
fi

echo ""
echo "🔄 Restarting dashboard server..."
pm2 reload nigents-dashboard --update-env || pm2 start src/dashboard/server.js --name nigents-dashboard

echo ""
echo "⏳ Waiting for server to start..."
sleep 3

echo ""
echo "🧪 Testing API endpoint..."
curl -s http://localhost:4000/api/materials/email-config || echo "❌ API test failed"

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
pm2 status
echo ""
echo "Test the subscribe endpoint:"
echo "  curl -X POST http://localhost:4000/api/materials/subscribe \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"test@test.com\",\"roadmap\":\"fullstack\"}'"
