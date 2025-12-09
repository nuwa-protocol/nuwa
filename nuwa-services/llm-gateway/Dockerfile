# Workspace-based build for LLM Gateway
FROM node:20-alpine AS base

# Install pnpm globally
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
RUN pnpm --filter @nuwa-ai/llm-gateway build

# Production stage
FROM base AS runner
# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 llmgateway

# Set working directory
WORKDIR /app

# Copy built workspace dependencies and application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/nuwa-services/llm-gateway/dist ./dist
COPY --from=builder /app/nuwa-services/llm-gateway/package.json ./package.json

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
