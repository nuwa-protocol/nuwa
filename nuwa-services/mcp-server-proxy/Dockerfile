# Workspace-based build for MCP Server Proxy
FROM node:20-alpine AS base

# Install system dependencies for stdio upstream commands
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    curl \
    bash

# Install pnpm globally (for Node.js packages)
RUN npm install -g pnpm@9.15.4

# Install uv and uvx for Python packages (using --break-system-packages for Alpine)
RUN pip3 install --no-cache-dir --break-system-packages uv

# Set working directory
WORKDIR /app

# Build stage - build from workspace root
FROM base AS builder
# Copy entire workspace (including built packages)
COPY . .

# Install workspace dependencies
RUN npm install -g pnpm@9.15.4 && \
    pnpm install --frozen-lockfile --prod=false

# Build workspace packages first
RUN pnpm build

# Build the specific service
RUN pnpm --filter @nuwa-ai/mcp-server-proxy build

# Production stage
FROM base AS runner
# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcpproxy

# Set working directory
WORKDIR /app

# Copy built workspace dependencies and application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/nuwa-services/mcp-server-proxy/dist ./dist
COPY --from=builder /app/nuwa-services/mcp-server-proxy/package.json ./package.json

# Create config directory for mounted configs
RUN mkdir -p /app/config && chown mcpproxy:nodejs /app/config

# Switch to non-root user
USER mcpproxy

# Expose port
EXPOSE 8088

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8088/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8088
ENV ENDPOINT=/mcp

# Start the application
CMD ["node", "dist/index.js"]
