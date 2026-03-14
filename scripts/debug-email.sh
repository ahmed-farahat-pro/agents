#!/bin/bash
# Debug email configuration and sending

echo "=========================================="
echo "  EMAIL DEBUG & DIAGNOSTICS"
echo "=========================================="

cd /home/ubuntu/nigents

echo ""
echo "1. Checking .env file for Gmail config..."
if grep -q "GMAIL_USER" .env; then
    echo "  ✓ GMAIL_USER found"
    grep "GMAIL_USER" .env | head -1
else
    echo "  ✗ GMAIL_USER NOT found"
fi

if grep -q "GMAIL_PASS" .env; then
    echo "  ✓ GMAIL_PASS found"
    PASS_LENGTH=$(grep "GMAIL_PASS" .env | cut -d'=' -f2 | tr -d ' ' | wc -c)
    echo "  Password length: $PASS_LENGTH characters"
else
    echo "  ✗ GMAIL_PASS NOT found"
fi

echo ""
echo "2. Checking email config via API..."
curl -s http://localhost:4000/api/materials/email-config | head -c 500
echo ""

echo ""
echo "3. Checking email verification via API..."
curl -s http://localhost:4000/api/materials/email-debug | head -c 500
echo ""

echo ""
echo "4. Checking recent PM2 logs for email errors..."
pm2 logs nigents-dashboard --lines 50 --nostream | grep -i "email\|gmail\|subscribe" | tail -20

echo ""
echo "=========================================="
echo "  TEST EMAIL SENDING"
echo "=========================================="
echo ""
echo "To send a test email, run:"
echo ""
echo "curl -X POST http://localhost:4000/api/materials/test-email \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"to\":\"YOUR_EMAIL@gmail.com\"}'"
echo ""
echo "Or test full subscribe flow:"
echo ""
echo "curl -X POST http://localhost:4000/api/materials/subscribe \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\":\"YOUR_EMAIL@gmail.com\",\"name\":\"Test\",\"roadmap\":\"fullstack\"}'"
