# Workspace-based build for LLM Gateway
# Note: Build must be run from workspace root with: docker build -f nuwa-services/llm-gateway/Dockerfile .
FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@9.15.4

# Set working directory
WORKDIR /app

# Build stage - build from workspace root
FROM base AS builder
# Copy entire workspace source code (dist folders excluded by .dockerignore at workspace root)
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

# Copy the llm-gateway service
COPY --from=builder /app/nuwa-services/llm-gateway/dist ./nuwa-services/llm-gateway/dist
COPY --from=builder /app/nuwa-services/llm-gateway/package.json ./nuwa-services/llm-gateway/package.json
COPY --from=builder /app/nuwa-services/llm-gateway/node_modules ./nuwa-services/llm-gateway/node_modules

# Set working directory to the service directory
WORKDIR /app/nuwa-services/llm-gateway

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
