# Workspace-based build for CAP Store Indexer
# Note: Build must be run from workspace root with: docker build -f nuwa-services/capstore-indexer/typescript/indexer/Dockerfile .
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

# Build the specific service with its dependencies
RUN pnpm --filter @nuwa-service/indexer... build

# Production stage
FROM base AS runner
# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 capindexer

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

COPY --from=builder /app/nuwa-kit/typescript/packages/cap-kit/dist ./nuwa-kit/typescript/packages/cap-kit/dist
COPY --from=builder /app/nuwa-kit/typescript/packages/cap-kit/package.json ./nuwa-kit/typescript/packages/cap-kit/package.json
COPY --from=builder /app/nuwa-kit/typescript/packages/cap-kit/node_modules ./nuwa-kit/typescript/packages/cap-kit/node_modules

# Copy the capstore-indexer service
COPY --from=builder /app/nuwa-services/capstore-indexer/typescript/indexer/dist ./nuwa-services/capstore-indexer/typescript/indexer/dist
COPY --from=builder /app/nuwa-services/capstore-indexer/typescript/indexer/package.json ./nuwa-services/capstore-indexer/typescript/indexer/package.json
COPY --from=builder /app/nuwa-services/capstore-indexer/typescript/indexer/node_modules ./nuwa-services/capstore-indexer/typescript/indexer/node_modules

# Set working directory to the service directory
WORKDIR /app/nuwa-services/capstore-indexer/typescript/indexer

# Switch to non-root user
USER capindexer

# Expose port
EXPOSE 4001

# Health check (note: health endpoint might not exist, adjust if needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Default environment variables
ENV NODE_ENV=production
ENV PORT=4001
ENV HOST=0.0.0.0

# Start the application (note: typescript compiles src/ to dist/ directly)
CMD ["node", "dist/index.js"]
