# ==============================================================================
# ArcLane Production Sales Automation Engine Dockerfile
# Multi-stage non-root container with Playwright Chromium & Node.js 20
# ==============================================================================

FROM mcr.microsoft.com/playwright:v1.45.0-jammy AS base

# Set working directory
WORKDIR /usr/src/app

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./
COPY requirements.txt ./

# Install Node and Python dependencies
RUN npm ci --omit=dev
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Create required persistent storage directories
RUN mkdir -p reports/.crm_state generated_sites whatsapp_user_session chrome_profile raw_prompts data config \
    && chown -R pwuser:pwuser /usr/src/app

# Switch to standard Playwright non-root user
USER pwuser

# Expose Web UI port
EXPOSE 3000

# Health check to ensure Express Web UI server is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Default command launches 24/7 Controller Bot with Web UI
CMD ["node", "controller_bot/index.js"]
