#!/bin/bash
# One-time database migration script
# Run this manually on EC2 to update schema

echo "=========================================="
echo "  NIGENTS DATABASE MIGRATION"
echo "=========================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root or with sudo"
  exit 1
fi

# Navigate to project directory
cd /home/ubuntu/nigents || exit 1

# Check MySQL is running
echo "Checking MySQL..."
if ! systemctl is-active --quiet mysql; then
  echo "Starting MySQL..."
  systemctl start mysql
fi

# Run schema update
echo "Updating database schema..."
mysql nigents < src/database/schema.sql

# Verify tables were created
echo ""
echo "Verifying tables..."
mysql nigents -e "SHOW TABLES LIKE 'ai_%';"
mysql nigents -e "SHOW TABLES LIKE 'agent_%';"
mysql nigents -e "SHOW TABLES LIKE 'global_%';"

echo ""
echo "Checking agent configurations..."
mysql nigents -e "SELECT agent_name, provider_id, model_id FROM agent_configurations;"

echo ""
echo "Checking global defaults..."
mysql nigents -e "SELECT * FROM global_config;"

echo ""
echo "=========================================="
echo "  MIGRATION COMPLETE!"
echo "=========================================="
echo ""
echo "You can now test with:"
echo "  /agentmodels"
