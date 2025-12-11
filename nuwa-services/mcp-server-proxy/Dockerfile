# Workspace-based build for MCP Server Proxy
FROM node:20-bookworm AS base

# Install system dependencies for stdio upstream commands
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    curl \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Install uv and uvx for Python packages
# Use --break-system-packages flag for Debian 12+ (PEP 668)
RUN pip3 install --no-cache-dir --break-system-packages uv

# Install pnpm globally (for Node.js packages)
RUN npm install -g pnpm@9.15.4

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

# Copy workspace configuration files for proper module resolution
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy root node_modules (contains shared dependencies)
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace dependencies with their built artifacts
COPY --from=builder /app/nuwa-kit/typescript/packages/identity-kit/dist ./nuwa-kit/typescript/packages/identity-kit/dist
COPY --from=builder /app/nuwa-kit/typescript/packages/identity-kit/package.json ./nuwa-kit/typescript/packages/identity-kit/package.json
COPY --from=builder /app/nuwa-kit/typescript/packages/identity-kit/node_modules ./nuwa-kit/typescript/packages/identity-kit/node_modules

COPY --from=builder /app/nuwa-kit/typescript/packages/payment-kit/dist ./nuwa-kit/typescript/packages/payment-kit/dist
COPY --from=builder /app/nuwa-kit/typescript/packages/payment-kit/package.json ./nuwa-kit/typescript/packages/payment-kit/package.json
COPY --from=builder /app/nuwa-kit/typescript/packages/payment-kit/node_modules ./nuwa-kit/typescript/packages/payment-kit/node_modules

# Copy the mcp-server-proxy service
COPY --from=builder /app/nuwa-services/mcp-server-proxy/dist ./nuwa-services/mcp-server-proxy/dist
COPY --from=builder /app/nuwa-services/mcp-server-proxy/package.json ./nuwa-services/mcp-server-proxy/package.json
COPY --from=builder /app/nuwa-services/mcp-server-proxy/node_modules ./nuwa-services/mcp-server-proxy/node_modules

# Set working directory to the service directory
WORKDIR /app/nuwa-services/mcp-server-proxy

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
