#!/bin/bash
# Full EC2 deployment script for Nigents
# This script deploys the latest code and verifies everything is working

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  NIGENTS FULL DEPLOYMENT${NC}"
echo -e "${GREEN}==========================================${NC}"

PROJECT_DIR="/home/ubuntu/nigents"
cd "$PROJECT_DIR"

echo ""
echo -e "${YELLOW}📥 Step 1: Pulling latest code...${NC}"
git pull origin main
echo -e "${GREEN}✓ Code updated${NC}"

echo ""
echo -e "${YELLOW}📦 Step 2: Installing dependencies...${NC}"
npm ci --production
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}🔧 Step 3: Checking .env configuration...${NC}"

# Check if Gmail is configured
if ! grep -q "GMAIL_USER" .env; then
    echo -e "${YELLOW}⚠ Adding Gmail config to .env...${NC}"
    cat >> .env << 'EOF'

# Gmail Configuration (for sending free materials)
GMAIL_USER=nigents.learn@gmail.com
GMAIL_PASS=xpup jrho cjxv kqmm
EOF
    echo -e "${GREEN}✓ Gmail config added${NC}"
else
    echo -e "${GREEN}✓ Gmail config already exists${NC}"
fi

echo ""
echo -e "${YELLOW}📁 Step 4: Checking materials directory...${NC}"
MATERIALS_DIR="$PROJECT_DIR/src/dashboard/public/materials"
mkdir -p "$MATERIALS_DIR"
echo -e "${GREEN}✓ Materials directory ready: $MATERIALS_DIR${NC}"

echo ""
echo -e "${YELLOW}📄 Step 5: Checking PDF files...${NC}"
REQUIRED_PDFS=("fullstack-roadmap.pdf" "backend-roadmap.pdf" "frontend-roadmap.pdf" "qa-roadmap.pdf")
MISSING_PDFS=()

for pdf in "${REQUIRED_PDFS[@]}"; do
    if [ -f "$MATERIALS_DIR/$pdf" ]; then
        size=$(ls -lh "$MATERIALS_DIR/$pdf" | awk '{ print $5 }')
        echo -e "${GREEN}  ✓ $pdf ($size)${NC}"
    else
        echo -e "${RED}  ✗ $pdf MISSING${NC}"
        MISSING_PDFS+=("$pdf")
    fi
done

if [ ${#MISSING_PDFS[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠ WARNING: Some PDFs are missing!${NC}"
    echo "Please upload these files to: $MATERIALS_DIR"
    echo "Missing files:"
    for pdf in "${MISSING_PDFS[@]}"; do
        echo "  - $pdf"
    done
fi

echo ""
echo -e "${YELLOW}🔄 Step 6: Stopping old server...${NC}"
pm2 stop nigents-dashboard 2>/dev/null || true
pm2 delete nigents-dashboard 2>/dev/null || true
echo -e "${GREEN}✓ Old server stopped${NC}"

echo ""
echo -e "${YELLOW}🚀 Step 7: Starting new server...${NC}"
pm2 start src/dashboard/server.js --name nigents-dashboard --update-env
echo -e "${GREEN}✓ Server started${NC}"

echo ""
echo -e "${YELLOW}⏳ Step 8: Waiting for server to be ready...${NC}"
sleep 5

echo ""
echo -e "${YELLOW}🧪 Step 9: Running tests...${NC}"

# Test 1: Check if server is responding
echo "  Test 1: Server status..."
if curl -s http://localhost:4000/api/status > /dev/null; then
    echo -e "${GREEN}    ✓ Server is responding${NC}"
else
    echo -e "${RED}    ✗ Server is not responding${NC}"
    echo "    Check logs: pm2 logs nigents-dashboard"
    exit 1
fi

# Test 2: Check email config
echo "  Test 2: Email configuration..."
EMAIL_CONFIG=$(curl -s http://localhost:4000/api/materials/email-config)
if echo "$EMAIL_CONFIG" | grep -q '"configured":true'; then
    echo -e "${GREEN}    ✓ Email is configured${NC}"
else
    echo -e "${RED}    ✗ Email is NOT configured${NC}"
    echo "    Response: $EMAIL_CONFIG"
fi

# Test 3: Check PDFs via API
echo "  Test 3: PDF files..."
PDF_LIST=$(curl -s http://localhost:4000/api/materials/pdfs)
PDF_COUNT=$(echo "$PDF_LIST" | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
echo "    Found $PDF_COUNT PDFs"

# Test 4: Test subscribe endpoint (dry run)
echo "  Test 4: Subscribe endpoint..."
TEST_EMAIL="test-$(date +%s)@example.com"
SUBSCRIBE_RESULT=$(curl -s -X POST http://localhost:4000/api/materials/subscribe \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"name\":\"Test User\",\"roadmap\":\"fullstack\"}")

if echo "$SUBSCRIBE_RESULT" | grep -q '"success":true'; then
    echo -e "${GREEN}    ✓ Subscribe endpoint working${NC}"
else
    echo -e "${RED}    ✗ Subscribe endpoint failed${NC}"
    echo "    Response: $SUBSCRIBE_RESULT"
fi

echo ""
echo -e "${YELLOW}💾 Step 10: Saving PM2 config...${NC}"
pm2 save
echo -e "${GREEN}✓ PM2 config saved${NC}"

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
pm2 status
echo ""

if [ ${#MISSING_PDFS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠ ACTION REQUIRED: Upload missing PDFs${NC}"
    echo "Use SCP to upload:"
    echo "  scp -i your-key.pem px_fullstack_30day.pdf ubuntu@nigents.com:/home/ubuntu/nigents/src/dashboard/public/materials/fullstack-roadmap.pdf"
    echo "  scp -i your-key.pem px_backend_30day.pdf ubuntu@nigents.com:/home/ubuntu/nigents/src/dashboard/public/materials/backend-roadmap.pdf"
    echo "  scp -i your-key.pem problemx_30day_plan\\ \\(2\\).pdf ubuntu@nigents.com:/home/ubuntu/nigents/src/dashboard/public/materials/frontend-roadmap.pdf"
    echo "  scp -i your-key.pem px_qa_30day.pdf ubuntu@nigents.com:/home/ubuntu/nigents/src/dashboard/public/materials/qa-roadmap.pdf"
    echo ""
fi

echo "View logs:"
echo "  pm2 logs nigents-dashboard"
echo ""
echo "Test subscribe:"
echo "  curl -X POST https://nigents.com/api/materials/subscribe \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"your-email@gmail.com\",\"name\":\"Test\",\"roadmap\":\"fullstack\"}'"
