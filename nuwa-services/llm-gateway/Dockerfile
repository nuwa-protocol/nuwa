# Multi-stage build for LLM Gateway
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
RUN adduser --system --uid 1001 llmgateway

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=llmgateway:nodejs /app/dist ./dist
COPY --from=builder --chown=llmgateway:nodejs /app/package.json ./package.json

# Install only production dependencies
COPY --from=deps --chown=llmgateway:nodejs /app/node_modules ./node_modules

# Create config directory for mounted configs
RUN mkdir -p /app/config && chown llmgateway:nodejs /app/config

# Switch to non-root user
USER llmgateway

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Start the application
CMD ["node", "dist/server.js"]
