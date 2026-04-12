#!/bin/bash
# Diagnostic script to check server status

echo "=========================================="
echo "  SERVER DIAGNOSTICS"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Checking Git status..."
git log --oneline -3
git status

echo ""
echo "2. Checking server.js for subscribe route..."
grep -n "app.post('/api/materials/subscribe'" src/dashboard/server.js || echo "NOT FOUND!"

echo ""
echo "3. Checking PM2 status..."
pm2 status

echo ""
echo "4. Checking if port 4000 is in use..."
netstat -tlnp | grep 4000 || ss -tlnp | grep 4000 || echo "Port check failed"

echo ""
echo "5. Testing local API..."
curl -s http://localhost:4000/api/status | head -c 200
echo ""
curl -s http://localhost:4000/api/materials/email-config
echo ""

echo ""
echo "6. Checking .env file..."
grep "GMAIL" .env || echo "GMAIL not configured!"

echo ""
echo "7. Checking materials directory..."
ls -la src/dashboard/public/materials/ 2>/dev/null || echo "Directory not found!"

echo ""
echo "8. Recent PM2 logs..."
pm2 logs nigents-dashboard --lines 20

echo ""
echo "=========================================="
echo "  DIAGNOSTICS COMPLETE"
echo "=========================================="
