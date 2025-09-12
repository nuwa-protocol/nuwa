#!/bin/bash

# Deploy MCP Proxy instance to Railway
# Usage: ./deploy.sh <instance-name>

set -e

INSTANCE_NAME="$1"

if [ -z "$INSTANCE_NAME" ]; then
    echo "Usage: $0 <instance-name>"
    echo ""
    echo "Available instances:"
    ls -1 "$(dirname "$(dirname "${BASH_SOURCE[0]}")")/instances" 2>/dev/null || echo "  (none)"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENTS_DIR="$(dirname "$SCRIPT_DIR")"
INSTANCE_DIR="$DEPLOYMENTS_DIR/instances/$INSTANCE_NAME"

# Check if instance exists
if [ ! -d "$INSTANCE_DIR" ]; then
    echo "❌ Instance '$INSTANCE_NAME' does not exist"
    echo ""
    echo "Available instances:"
    ls -1 "$DEPLOYMENTS_DIR/instances" 2>/dev/null || echo "  (none)"
    echo ""
    echo "Create new instance: ./create-instance.sh $INSTANCE_NAME"
    exit 1
fi

echo "🚀 Deploying instance: $INSTANCE_NAME"
echo "📁 Instance directory: $INSTANCE_DIR"

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed"
    echo "Install with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Please login to Railway first"
    echo "Run: railway login"
    exit 1
fi

# Enter project root directory (contains nixpacks.toml)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../" && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Working directory: $PROJECT_ROOT"

# Check configuration file
CONFIG_FILE="$INSTANCE_DIR/config.yaml"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file does not exist: $CONFIG_FILE"
    exit 1
fi

echo "✅ Configuration file: $CONFIG_FILE"

# Create or connect Railway project
echo "🔗 Connecting Railway project..."

# Try to connect to existing project
if [ -f "$INSTANCE_DIR/.railway-project-id" ]; then
    PROJECT_ID=$(cat "$INSTANCE_DIR/.railway-project-id")
    echo "📋 Using existing project ID: $PROJECT_ID"
    railway link "$PROJECT_ID" || {
        echo "❌ Cannot connect to project $PROJECT_ID"
        echo "May need to recreate project"
        rm -f "$INSTANCE_DIR/.railway-project-id"
    }
fi

# If no project ID, create new project
if [ ! -f "$INSTANCE_DIR/.railway-project-id" ]; then
    echo "🆕 Creating new Railway project..."
    railway create "$INSTANCE_NAME" --json > /tmp/railway-create.json
    PROJECT_ID=$(cat /tmp/railway-create.json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "$PROJECT_ID" > "$INSTANCE_DIR/.railway-project-id"
    echo "✅ Project created successfully: $PROJECT_ID"
fi

# Set environment variables
echo "🔧 Configuring environment variables..."

# Set configuration file path
railway variables set CONFIG_PATH="./deployments/instances/$INSTANCE_NAME/config.yaml"

# Read environment variable examples from env.example
if [ -f "$INSTANCE_DIR/env.example" ]; then
    echo "📋 Environment variable examples (need manual setup):"
    echo ""
    cat "$INSTANCE_DIR/env.example" | grep -E "^[A-Z_]+=.*_here" | while read line; do
        VAR_NAME=$(echo "$line" | cut -d'=' -f1)
        echo "  railway variables set $VAR_NAME=<your_value>"
    done
    echo ""
    echo "⚠️  Please manually set the above environment variables before continuing"
    echo "Press Enter to continue deployment, or Ctrl+C to cancel..."
    read
fi

# Deploy
echo "🚀 Starting deployment..."
railway up --detach

# Get deployment URL
echo "🌐 Getting deployment information..."
sleep 5  # Wait for deployment to start

DEPLOY_URL=$(railway status --json | grep -o '"url":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -n "$DEPLOY_URL" ]; then
    echo "✅ Deployment successful!"
    echo "🌐 Access URL: $DEPLOY_URL"
    echo "🔍 Health check: $DEPLOY_URL/health"
    echo "📡 MCP endpoint: $DEPLOY_URL/mcp"
    
    # Save deployment information
    cat > "$INSTANCE_DIR/.deployment-info" << EOF
DEPLOY_URL=$DEPLOY_URL
PROJECT_ID=$PROJECT_ID
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

else
    echo "⚠️  Deployment started, please check status later"
    echo "Check status: railway status"
    echo "View logs: railway logs"
fi

echo ""
echo "📊 Useful commands:"
echo "  railway status    # Check deployment status"
echo "  railway logs      # View real-time logs"
echo "  railway shell     # Connect to container"
echo "  railway variables # Manage environment variables"
