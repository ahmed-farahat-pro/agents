#!/bin/bash
# NUCLEAR FIX - Complete wipe and rebuild

echo "=========================================="
echo "  ☢️  NUCLEAR FIX - COMPLETE REBUILD"
echo "=========================================="

cd /home/ubuntu

echo ""
echo "1. Stopping all Node processes..."
pkill -9 node || true
pm2 kill || true
sleep 3

echo ""
echo "2. Backing up data..."
mkdir -p /tmp/nigents-backup
cp -r nigents/data /tmp/nigents-backup/ 2>/dev/null || true
cp nigents/.env /tmp/nigents-backup/ 2>/dev/null || true

echo ""
echo "3. DELETING old code..."
rm -rf nigents

echo ""
echo "4. FRESH clone..."
git clone https://gitlab.com/bonyad-tech/nigents.git nigents
cd nigents

echo ""
echo "5. Restoring data..."
cp -r /tmp/nigents-backup/data . 2>/dev/null || mkdir -p data
cp /tmp/nigents-backup/.env . 2>/dev/null || true

echo ""
echo "6. Installing dependencies..."
npm ci --production

echo ""
echo "7. Setting up .env..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
PORT=4000
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=admin123
NODE_ENV=production

# Gmail
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm

# Placeholders - update these
TELEGRAM_BOT_TOKEN=placeholder
TELEGRAM_CHAT_ID=placeholder
GITLAB_TOKEN=placeholder
GITLAB_NAMESPACE=bonyad-tech
EOF
fi

# Ensure Gmail is there
if ! grep -q "GMAIL_USER" .env; then
    echo "" >> .env
    echo "GMAIL_USER=nigents.learn@gmail.com" >> .env
    echo "GMAIL_PASS=xpup jrho cjxv kqmm" >> .env
fi

echo ""
echo "8. Creating materials directory..."
mkdir -p src/dashboard/public/materials

echo ""
echo "9. Starting server..."
pm2 start src/dashboard/server.js --name nigents-dashboard

echo ""
echo "10. Waiting for startup..."
sleep 5

echo ""
echo "11. Testing..."
curl -s http://localhost:4000/api/materials/email-config
echo ""
curl -s http://localhost:4000/api/materials/pdfs
echo ""

echo ""
echo "=========================================="
echo "  ☢️  NUCLEAR FIX COMPLETE!"
echo "=========================================="
echo ""
echo "NOW UPLOAD PDFs:"
echo "  scp px_*.pdf ubuntu@nigents.com:/home/ubuntu/nigents/src/dashboard/public/materials/"
echo ""
pm2 status
