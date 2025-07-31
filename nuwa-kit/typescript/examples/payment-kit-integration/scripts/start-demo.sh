#!/bin/bash

# Payment Kit Integration Demo Startup Script

set -e

echo "🚀 Starting Payment Kit Integration Demo"
echo "======================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "⚠️  Please edit .env file with your actual private keys before continuing"
    echo "   You can generate keys using: npx @nuwa-ai/identity-kit generate"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Build if needed
if [ ! -d dist ]; then
    echo "🔨 Building project..."
    pnpm build
fi

echo ""
echo "🎯 Choose what to run:"
echo "1) Start server only"
echo "2) Start client CLI (interactive mode)"
echo "3) Run quick demo (server + sample requests)"
echo "4) Exit"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "🖥️  Starting server..."
        pnpm dev:server
        ;;
    2)
        echo "💻 Starting client CLI..."
        echo "   Make sure the server is running on localhost:3000"
        pnpm dev:client
        ;;
    3)
        echo "🎬 Running quick demo..."
        
        # Start server in background
        echo "   Starting server in background..."
        pnpm dev:server &
        SERVER_PID=$!
        
        # Wait for server to start
        echo "   Waiting for server to be ready..."
        sleep 5
        
        # Check if server is responding
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            echo "   ✅ Server is ready!"
            echo ""
            
            # Run demo commands
            echo "📋 Getting service info..."
            pnpm dev:client info
            echo ""
            
            echo "🔊 Testing echo endpoint..."
            pnpm dev:client echo "Hello from demo!"
            echo ""
            
            echo "⚙️ Testing text processing..."
            pnpm dev:client process "demo text"
            echo ""
            
            echo "🤖 Testing chat completion..."
            pnpm dev:client chat "What is a payment channel?"
            echo ""
            
            echo "📊 Checking channel info..."
            pnpm dev:client channel
            echo ""
            
            echo "🎉 Demo completed!"
            echo "   Server is still running in background (PID: $SERVER_PID)"
            echo "   You can continue testing with: pnpm dev:client"
            echo "   Stop server with: kill $SERVER_PID"
            
        else
            echo "❌ Server failed to start or is not responding"
            kill $SERVER_PID 2>/dev/null || true
            exit 1
        fi
        ;;
    4)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac