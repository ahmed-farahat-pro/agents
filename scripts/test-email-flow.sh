#!/bin/bash
# Test the complete email flow

echo "=========================================="
echo "  TESTING EMAIL FLOW"
echo "=========================================="

EMAIL="${1:-ahmedfarahat430@gmail.com}"

echo ""
echo "Testing email to: $EMAIL"
echo ""

# 1. Check config
echo "1. Checking email config..."
curl -s http://localhost:4000/api/materials/email-config | jq .

# 2. Verify transporter
echo ""
echo "2. Verifying email transporter..."
curl -s http://localhost:4000/api/materials/email-debug | jq .

# 3. Send test email
echo ""
echo "3. Sending test email to $EMAIL..."
curl -s -X POST http://localhost:4000/api/materials/test-email \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"$EMAIL\"}" | jq .

# 4. Test subscribe flow
echo ""
echo "4. Testing subscribe flow (sends email)..."
curl -s -X POST http://localhost:4000/api/materials/subscribe \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Test User\",\"roadmap\":\"fullstack\"}" | jq .

echo ""
echo "=========================================="
echo "  CHECK YOUR INBOX (and spam folder)"
echo "=========================================="
echo "Emails sent to: $EMAIL"
