# Multi-stage build for MCP Server Proxy
FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Set working directory
WORKDIR /app

# Install dependencies stage
FROM base AS deps
# Copy package files
COPY package.json pnpm-lock.yaml ./
# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Build stage
FROM base AS builder
# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy source code
COPY . .
# Build the application
RUN pnpm run build

# Production stage
FROM base AS runner
# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 mcpproxy

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=mcpproxy:nodejs /app/dist ./dist
COPY --from=builder --chown=mcpproxy:nodejs /app/package.json ./package.json

# Install only production dependencies
COPY --from=deps --chown=mcpproxy:nodejs /app/node_modules ./node_modules

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
