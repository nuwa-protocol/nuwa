#!/bin/bash

# Local Context7 MCP Proxy Example
# This script demonstrates how to run the MCP proxy with Context7 upstream locally

set -e

echo "📚 Starting Context7 MCP Proxy locally..."

# Check if SERVICE_KEY is set
if [ -z "$SERVICE_KEY" ]; then
    echo "❌ Error: SERVICE_KEY environment variable is required"
    echo "SERVICE_KEY is needed for ServiceDID and payment channel creation"
    echo "Please set it with: export SERVICE_KEY=your_service_key_here"
    exit 1
fi

# Use pre-configured context7 instance
CONFIG_FILE="./deployments/instances/context7-proxy/config.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Error: Config file not found: $CONFIG_FILE"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📝 Using config file: $CONFIG_FILE"
echo "🔐 Using SERVICE_KEY: ${SERVICE_KEY:0:10}..."

# Check if the server is built
if [ ! -f "dist/index.js" ]; then
    echo "🔨 Building the server..."
    pnpm build
fi

echo "🚀 Starting server on http://localhost:8089/mcp"
echo "Press Ctrl+C to stop the server"
echo ""

# Set port for local development
export PORT=8089

# Start the server
node dist/index.js --config "$CONFIG_FILE"
