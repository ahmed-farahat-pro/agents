#!/bin/bash
# MySQL Setup Script for Nigents
# Run this on EC2 to set up MySQL database

set -e

echo "=========================================="
echo "  NIGENTS MySQL Setup"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root or with sudo"
  exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update

# Install MySQL if not already installed
if ! command -v mysql &> /dev/null; then
  echo "Installing MySQL Server..."
  apt-get install -y mysql-server
  
  echo "Starting MySQL service..."
  systemctl start mysql
  systemctl enable mysql
else
  echo "MySQL is already installed"
  systemctl start mysql
fi

# Create database and user
echo "Creating database and user..."
mysql -e "CREATE DATABASE IF NOT EXISTS nigents CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'nigents'@'localhost' IDENTIFIED BY 'nigents_password';"
mysql -e "GRANT ALL PRIVILEGES ON nigents.* TO 'nigents'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Check if schema file exists
SCHEMA_FILE="/home/ubuntu/nigents/src/database/schema.sql"
if [ -f "$SCHEMA_FILE" ]; then
  echo "Running database schema..."
  mysql nigents < "$SCHEMA_FILE"
else
  echo "Warning: Schema file not found at $SCHEMA_FILE"
  echo "Please run schema manually after deployment"
fi

# Create .env entry for database
ENV_FILE="/home/ubuntu/nigents/.env"
if [ -f "$ENV_FILE" ]; then
  echo "Updating .env file with database configuration..."
  
  # Remove old DB entries if they exist
  sed -i '/^DB_HOST=/d' "$ENV_FILE"
  sed -i '/^DB_PORT=/d' "$ENV_FILE"
  sed -i '/^DB_USER=/d' "$ENV_FILE"
  sed -i '/^DB_PASSWORD=/d' "$ENV_FILE"
  sed -i '/^DB_NAME=/d' "$ENV_FILE"
  
  # Add new DB entries
  cat >> "$ENV_FILE" << 'EOF'

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=nigents
DB_PASSWORD=nigents_password
DB_NAME=nigents
EOF

  echo ".env file updated"
else
  echo "Warning: .env file not found at $ENV_FILE"
  echo "Please add database configuration manually:"
  echo "DB_HOST=localhost"
  echo "DB_PORT=3306"
  echo "DB_USER=nigents"
  echo "DB_PASSWORD=nigents_password"
  echo "DB_NAME=nigents"
fi

echo ""
echo "=========================================="
echo "  MySQL Setup Complete!"
echo "=========================================="
echo "Database: nigents"
echo "User: nigents"
echo "Password: nigents_password"
echo ""
echo "To verify installation:"
echo "  mysql -u nigents -p'nigents_password' nigents -e 'SHOW TABLES;'"
echo ""
