#!/bin/bash
# Nigents EC2 Setup Script
# Run this on a fresh Ubuntu 22.04 EC2 instance

set -e

echo "🦉 Nigents EC2 Setup"
echo "===================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please run as ubuntu user, not root${NC}"
   exit 1
fi

# Get EC2 IP
EC2_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo -e "${GREEN}✓ Detected EC2 IP: $EC2_IP${NC}"

echo ""
echo "📦 Step 1: Updating system..."
sudo apt-get update && sudo apt-get upgrade -y
echo -e "${GREEN}✓ System updated${NC}"

echo ""
echo "📦 Step 2: Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
echo -e "${GREEN}✓ Node.js $(node --version) installed${NC}"

echo ""
echo "📦 Step 3: Installing PM2..."
sudo npm install -g pm2
echo -e "${GREEN}✓ PM2 installed${NC}"

echo ""
echo "📦 Step 4: Installing Nginx and Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx
echo -e "${GREEN}✓ Nginx and Certbot installed${NC}"

echo ""
echo "📦 Step 5: Installing Git..."
sudo apt-get install -y git
git config --global user.email "deploy@nigents.com"
git config --global user.name "Nigents Deploy"
echo -e "${GREEN}✓ Git installed${NC}"

echo ""
echo "📦 Step 6: Cloning repository..."
cd /home/ubuntu
if [ -d "nightowl" ]; then
    echo -e "${YELLOW}⚠ Directory exists, pulling latest...${NC}"
    cd nightowl
    git pull origin main
else
    git clone https://gitlab.com/bonyad-tech/nigents.git nightowl
    cd nightowl
fi
echo -e "${GREEN}✓ Repository cloned${NC}"

echo ""
echo "📦 Step 7: Installing dependencies..."
npm ci
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo "📦 Step 8: Building MCP servers..."
cd mcp-servers/arabic-rtl-auditor && npm ci && npm run build && cd ../..
cd mcp-servers/task-splitter && npm ci && npm run build && cd ../..
cd mcp-servers/smart-code-search && npm ci && npm run build && cd ../..
echo -e "${GREEN}✓ MCP servers built${NC}"

echo ""
echo "📦 Step 9: Setting up PM2 startup..."
PM2_STARTUP=$(pm2 startup systemd | grep "sudo env")
eval "$PM2_STARTUP"
echo -e "${GREEN}✓ PM2 startup configured${NC}"

echo ""
echo "📦 Step 10: Configuring Nginx..."
sudo rm -f /etc/nginx/sites-enabled/default

sudo tee /etc/nginx/sites-available/nigents > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name nigents.com www.nigents.com;
    
    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/nigents /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
echo -e "${GREEN}✓ Nginx configured${NC}"

echo ""
echo "📦 Step 11: Creating .env template..."
if [ ! -f "/home/ubuntu/nightowl/.env" ]; then
    cat > /home/ubuntu/nightowl/.env << EOF
# =============================================================================
# REQUIRED - Telegram Bot (from @BotFather)
# =============================================================================
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# =============================================================================
# REQUIRED - AI Provider API Keys
# =============================================================================
ANTHROPIC_API_KEY=your_key_here
# ZHIPU_API_KEY=your_key_here
# MOONSHOT_API_KEY=your_key_here
# DEEPSEEK_API_KEY=your_key_here

# =============================================================================
# REQUIRED - GitLab Integration
# =============================================================================
GITLAB_TOKEN=glpat-your_token_here
GITLAB_NAMESPACE=bonyad-tech
GITLAB_URL=https://gitlab.com

# =============================================================================
# OPTIONAL - OpenAI (for voice)
# =============================================================================
# OPENAI_API_KEY=your_key_here

# =============================================================================
# Dashboard Configuration
# =============================================================================
DASHBOARD_PORT=4000
DASHBOARD_PASSWORD=change_me_now
DASHBOARD_URL=https://nigents.com

# =============================================================================
# Feature Flags
# =============================================================================
ENABLE_VOICE=true
ENABLE_DASHBOARD=true
ENABLE_OPENHANDS=false

# =============================================================================
# Logging
# =============================================================================
LOG_LEVEL=info
EOF
    chmod 600 /home/ubuntu/nightowl/.env
    echo -e "${YELLOW}⚠ .env file created - PLEASE EDIT IT with your actual values!${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo "===================="
echo -e "${GREEN}✅ EC2 Setup Complete!${NC}"
echo "===================="
echo ""
echo "Next steps:"
echo "1. Edit .env file: nano /home/ubuntu/nightowl/.env"
echo "2. Add your API keys and tokens"
echo "3. Start the app: pm2 start src/bot.js --name nigents-bot && pm2 start src/dashboard/server.js --name nigents-dashboard"
echo "4. Save PM2 config: pm2 save"
echo "5. Setup SSL: sudo certbot --nginx -d nigents.com"
echo ""
echo "Dashboard will be available at: http://$EC2_IP:4000"
echo ""
