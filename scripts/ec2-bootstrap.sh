#!/bin/bash
# =============================================================================
# 🦉 NightOwl EC2 Bootstrap Script
# One-command setup for AWS EC2 Ubuntu 22.04
# =============================================================================

set -e  # Exit on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

NIGHTOWL_DIR="/home/ubuntu/nightowl"
LOG_FILE="/var/log/nightowl-bootstrap.log"

# Logging
exec > >(tee -a "$LOG_FILE") 2>&1

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              🦉 NightOwl EC2 Bootstrap                       ║"
echo "║         AI Agent Team Setup - Ubuntu 22.04                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Please run as ubuntu user, not root${NC}"
   exit 1
fi

# =============================================================================
# [1/8] System Update
# =============================================================================
echo -e "\n${YELLOW}[1/8] Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl wget git build-essential

# =============================================================================
# [2/8] Install Node.js 20
# =============================================================================
echo -e "\n${YELLOW}[2/8] Installing Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node_version=$(node --version)
echo -e "${GREEN}✓ Node.js installed: $node_version${NC}"

# =============================================================================
# [3/8] Install Python 3 and dependencies
# =============================================================================
echo -e "\n${YELLOW}[3/8] Installing Python and dependencies...${NC}"
sudo apt-get install -y python3 python3-pip python3-venv ffmpeg

# Install Python packages
pip3 install --user gtts
pip3 install --user anthropic openai

echo -e "${GREEN}✓ Python dependencies installed${NC}"

# =============================================================================
# [4/8] Install Docker
# =============================================================================
echo -e "\n${YELLOW}[4/8] Installing Docker...${NC}"

# Remove old versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc || true

# Install Docker
sudo apt-get install -y ca-certificates gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add ubuntu to docker group
sudo usermod -aG docker ubuntu

echo -e "${GREEN}✓ Docker installed${NC}"

# =============================================================================
# [5/8] Install PM2
# =============================================================================
echo -e "\n${YELLOW}[5/8] Installing PM2 process manager...${NC}"
sudo npm install -g pm2

# Setup PM2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

echo -e "${GREEN}✓ PM2 installed${NC}"

# =============================================================================
# [6/8] Create NightOwl directory structure
# =============================================================================
echo -e "\n${YELLOW}[6/8] Creating NightOwl directory structure...${NC}"

mkdir -p $NIGHTOWL_DIR/{src/{agents,tools,dashboard,utils},config,data/reports,scripts,logs,tmp}

cd $NIGHTOWL_DIR

# Create package.json if it doesn't exist
if [ ! -f package.json ]; then
cat > package.json << 'EOF'
{
  "name": "nightowl",
  "version": "1.0.0",
  "main": "src/bot.js",
  "scripts": {
    "start": "node src/bot.js",
    "dashboard": "node src/dashboard/server.js"
  },
  "dependencies": {
    "node-telegram-bot-api": "^0.66.0",
    "express": "^4.18.2",
    "socket.io": "^4.7.4",
    "axios": "^1.6.7",
    "dotenv": "^16.4.5",
    "winston": "^3.11.0",
    "@anthropic-ai/sdk": "^0.17.1",
    "openai": "^4.28.0",
    "simple-git": "^3.22.0",
    "uuid": "^9.0.1",
    "date-fns": "^3.3.1",
    "lodash": "^4.17.21"
  }
}
EOF
fi

npm install

echo -e "${GREEN}✓ NightOwl directory structure created${NC}"

# =============================================================================
# [7/8] Setup OpenHands Docker container
# =============================================================================
echo -e "\n${YELLOW}[7/8] Setting up OpenHands...${NC}"

# Pull and run OpenHands
docker pull ghcr.io/opendevin/opendevin:latest || true

# Create OpenHands systemd service
sudo tee /etc/systemd/system/openhands.service > /dev/null << EOF
[Unit]
Description=OpenHands Code Sandbox
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStart=/usr/bin/docker run --rm \
  -p 3000:3000 \
  -v /home/ubuntu/workspace:/workspace \
  -e SANDBOX_TYPE=exec \
  ghcr.io/opendevin/opendevin:latest
ExecStop=/usr/bin/docker stop -t 10 \$(/usr/bin/docker ps -q --filter ancestor=ghcr.io/opendevin/opendevin:latest)

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable openhands

echo -e "${GREEN}✓ OpenHands configured (start with: sudo systemctl start openhands)${NC}"

# =============================================================================
# [8/8] Generate SSH key for GitLab
# =============================================================================
echo -e "\n${YELLOW}[8/8] Generating SSH key for GitLab...${NC}"

if [ ! -f ~/.ssh/id_rsa ]; then
    ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N "" -C "nightowl@$(hostname)"
    chmod 600 ~/.ssh/id_rsa
    chmod 644 ~/.ssh/id_rsa.pub
fi

# Start SSH agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa

echo -e "${GREEN}✓ SSH key generated${NC}"

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✅ Bootstrap Complete!                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"

echo -e "\n${BLUE}Next Steps:${NC}"
echo "1. Copy your .env file to $NIGHTOWL_DIR/.env"
echo "2. Add this SSH key to GitLab:"
echo ""
cat ~/.ssh/id_rsa.pub
echo ""
echo "3. Start OpenHands: sudo systemctl start openhands"
echo "4. Start NightOwl with PM2:"
echo "   cd $NIGHTOWL_DIR"
echo "   pm2 start src/bot.js --name nightowl-bot"
echo "   pm2 start src/dashboard/server.js --name nightowl-dashboard"
echo "   pm2 save"
echo ""
echo "5. View logs: pm2 logs"
echo "6. Dashboard will be available at: http://$(curl -s ifconfig.me):4000"
echo ""
echo -e "${YELLOW}Log file: $LOG_FILE${NC}"
