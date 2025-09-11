#!/bin/bash

# Local Amap MCP Proxy Example
# This script demonstrates how to run the MCP proxy with Amap upstream locally

set -e

echo "🗺️  Starting Amap MCP Proxy locally..."

# Check if required environment variables are set
if [ -z "$AMAP_API_KEY" ]; then
    echo "❌ Error: AMAP_API_KEY environment variable is required"
    echo "Please set it with: export AMAP_API_KEY=your_amap_api_key_here"
    exit 1
fi

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ Error: SERVICE_KEY environment variable is required"
    echo "SERVICE_KEY is needed for ServiceDID and payment channel creation"
    echo "Please set it with: export SERVICE_KEY=your_service_key_here"
    exit 1
fi

# Use pre-configured amap instance
CONFIG_FILE="./deployments/instances/amap-proxy/config.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Error: Config file not found: $CONFIG_FILE"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📝 Using config file: $CONFIG_FILE"
echo "🔑 Using AMAP_API_KEY: ${AMAP_API_KEY:0:10}..."
echo "🔐 Using SERVICE_KEY: ${SERVICE_KEY:0:10}..."

# Check if the server is built
if [ ! -f "dist/index.js" ]; then
    echo "🔨 Building the server..."
    pnpm build
fi

echo "🚀 Starting server on http://localhost:8088/mcp"
echo "Press Ctrl+C to stop the server"
echo ""

# Set port for local development
export PORT=8088

# Start the server
node dist/index.js --config "$CONFIG_FILE"
