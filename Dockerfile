# 🦉 NightOwl Docker Image
FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    openssh-client \
    ffmpeg \
    build-base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY pm2.config.js ./

# Create necessary directories
RUN mkdir -p logs data tmp

# Install PM2 globally
RUN npm install -g pm2

# Expose dashboard port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/status', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))" || exit 1

# Start command
CMD ["pm2-runtime", "pm2.config.js"]
