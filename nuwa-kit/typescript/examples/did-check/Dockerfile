# Production Dockerfile for did-check service
# Build context is the rootDirectory: /nuwa-kit/typescript/examples/did-check
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (relative to rootDirectory)
COPY package.json ./

# Install all dependencies including @nuwa-ai/identity-kit from npm
RUN npm install

# Copy source files (relative to rootDirectory)
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npx tsc

# Production stage
FROM node:20-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3004

# Copy package files and install production dependencies only
COPY package.json ./
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3004

# Start the server
CMD ["node", "dist/server.js"]
