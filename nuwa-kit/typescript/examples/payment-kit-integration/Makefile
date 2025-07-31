# Payment Kit Integration Example Makefile

.PHONY: help install build clean dev-server dev-client demo

# Default target
help:
	@echo "Payment Kit Integration Example"
	@echo "==============================="
	@echo ""
	@echo "Available commands:"
	@echo "  install      Install dependencies"
	@echo "  build        Build the project"
	@echo "  clean        Clean build artifacts"
	@echo "  dev-server   Start development server"
	@echo "  dev-client   Start development client CLI"
	@echo "  demo         Run interactive demo"
	@echo "  setup        Initial setup (copy env, install deps)"
	@echo ""

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	pnpm install

# Build project
build:
	@echo "🔨 Building project..."
	pnpm build

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist
	rm -rf node_modules/.cache

# Start development server
dev-server:
	@echo "🖥️  Starting development server..."
	pnpm dev:server

# Start development client
dev-client:
	@echo "💻 Starting development client..."
	pnpm dev:client

# Run demo
demo:
	@echo "🎬 Starting demo..."
	./scripts/start-demo.sh

# Initial setup
setup:
	@echo "⚙️  Setting up Payment Kit Integration Example..."
	@if [ ! -f .env ]; then \
		echo "📝 Creating .env from template..."; \
		cp env.example .env; \
		echo "⚠️  Please edit .env with your actual private keys"; \
		echo "   Generate keys with: npx @nuwa-ai/identity-kit generate"; \
	else \
		echo "✅ .env file already exists"; \
	fi
	@$(MAKE) install
	@echo ""
	@echo "🎉 Setup complete!"
	@echo "   1. Edit .env file with your private keys"
	@echo "   2. Run 'make demo' to start the demo"
	@echo "   Or run 'make dev-server' and 'make dev-client' separately"