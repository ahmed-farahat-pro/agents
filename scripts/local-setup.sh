#!/bin/bash
# =============================================================================
# 🦉 NightOwl Local Development Setup Script
# Run this to set up NightOwl for local development
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        🦉 NightOwl Local Development Setup                   ║"
echo "║                                                              ║"
echo "║  This script will:                                           ║"
echo "║  1. Check prerequisites (Node, npm, git)                     ║"
echo "║  2. Install main app dependencies                            ║"
echo "║  3. Install & build MCP servers                              ║"
echo "║  4. Create .env file if missing                              ║"
echo "║  5. Run health check                                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 20+${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found. Please install npm${NC}"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found. Please install Git${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}❌ Node.js version is too old. Please upgrade to Node.js 20+${NC}"
    echo "Current version: $(node --version)"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
echo -e "${GREEN}✅ npm $(npm --version)${NC}"
echo -e "${GREEN}✅ Git $(git --version | cut -d' ' -f3)${NC}"

# Install main dependencies
echo -e "\n${YELLOW}Installing main app dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Main dependencies installed${NC}"

# Install concurrently globally if not present
if ! command -v concurrently &> /dev/null; then
    echo -e "\n${YELLOW}Installing concurrently for running multiple processes...${NC}"
    npm install -g concurrently
fi

# Install and build MCP servers
echo -e "\n${YELLOW}Installing & building MCP servers...${NC}"

cd mcp-servers/arabic-rtl-auditor
echo "  📦 arabic-rtl-auditor..."
npm install > /dev/null 2>&1
npm run build > /dev/null 2>&1
echo -e "  ${GREEN}✅ arabic-rtl-auditor${NC}"
cd ../..

cd mcp-servers/task-splitter
echo "  📦 task-splitter..."
npm install > /dev/null 2>&1
npm run build > /dev/null 2>&1
echo -e "  ${GREEN}✅ task-splitter${NC}"
cd ../..

cd mcp-servers/smart-code-search
echo "  📦 smart-code-search..."
npm install > /dev/null 2>&1
npm run build > /dev/null 2>&1
echo -e "  ${GREEN}✅ smart-code-search${NC}"
cd ../..

# Create .env if missing
if [ ! -f .env ]; then
    echo -e "\n${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ .env file created${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env and add your API keys!${NC}"
else
    echo -e "\n${GREEN}✅ .env file already exists${NC}"
fi

# Run health check
echo -e "\n${YELLOW}Running health check...${NC}"
node scripts/health-check.js || true

# Summary
echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        ✅ Local Setup Complete!                               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"

echo -e "\n${BLUE}Next steps:${NC}"
echo "1. Edit .env file and add your API keys:"
echo "   nano .env"
echo ""
echo "2. Start development:"
echo "   npm run local       # Starts both bot and dashboard"
echo "   OR"
echo "   npm run dashboard   # Terminal 1: Dashboard only"
echo "   npm run dev         # Terminal 2: Bot only"
echo ""
echo "3. Access dashboard:"
echo "   http://localhost:4000"
echo ""
echo "4. Test Telegram bot:"
echo "   Send /start to your bot"
echo ""
echo -e "${YELLOW}Happy coding! 🦉🌙${NC}"
