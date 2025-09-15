#!/bin/bash

# Deploy MCP Proxy instance to Railway
# Usage: ./deploy.sh <instance-name> [existing-project-id]
# 
# If existing-project-id is provided, the service will be added to that project
# Otherwise, a new project will be created

set -e

INSTANCE_NAME="$1"
EXISTING_PROJECT_ID="$2"

if [ -z "$INSTANCE_NAME" ]; then
    echo "Usage: $0 <instance-name> [existing-project-id]"
    echo ""
    echo "Arguments:"
    echo "  instance-name        Name of the instance to deploy"
    echo "  existing-project-id  Optional: ID of existing Railway project to add service to"
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

# Check if existing project ID is provided as argument
if [ -n "$EXISTING_PROJECT_ID" ]; then
    echo "📋 Using provided project ID: $EXISTING_PROJECT_ID"
    PROJECT_ID="$EXISTING_PROJECT_ID"
    echo "$PROJECT_ID" > "$INSTANCE_DIR/.railway-project-id"
    railway link --project "$PROJECT_ID" || {
        echo "❌ Cannot connect to project $PROJECT_ID"
        echo "Please verify the project ID is correct and you have access to it"
        exit 1
    }
    echo "✅ Connected to existing project: $PROJECT_ID"
else
    # Try to connect to existing project from saved file
    if [ -f "$INSTANCE_DIR/.railway-project-id" ]; then
        PROJECT_ID=$(cat "$INSTANCE_DIR/.railway-project-id")
        echo "📋 Using saved project ID: $PROJECT_ID"
        railway link --project "$PROJECT_ID" || {
            echo "❌ Cannot connect to project $PROJECT_ID"
            echo "May need to recreate project"
            rm -f "$INSTANCE_DIR/.railway-project-id"
        }
    fi

    # If no project ID, create new project
    if [ ! -f "$INSTANCE_DIR/.railway-project-id" ]; then
        echo "🆕 Creating new Railway project..."
        railway init --name "$INSTANCE_NAME"
        
        # Get project ID from status
        PROJECT_ID=$(railway status --json | jq -r '.id')
        if [ -n "$PROJECT_ID" ]; then
            echo "$PROJECT_ID" > "$INSTANCE_DIR/.railway-project-id"
            echo "✅ Project created successfully: $PROJECT_ID"
        else
            echo "❌ Failed to get project ID after creation"
            exit 1
        fi
    fi
fi

# Add service if not exists
echo "🔧 Setting up service..."
railway add --service "$INSTANCE_NAME" --variables "CONFIG_PATH=./deployments/instances/$INSTANCE_NAME/config.yaml" || echo "Service may already exist"

# Set environment variables
echo "🔧 Configuring environment variables..."

# Read environment variable examples from env.example
if [ -f "$INSTANCE_DIR/env.example" ]; then
    echo "📋 Environment variable examples (need manual setup):"
    echo ""
    cat "$INSTANCE_DIR/env.example" | grep -E "^[A-Z_]+=.*_here" | while read line; do
        VAR_NAME=$(echo "$line" | cut -d'=' -f1)
        echo "  railway variables --set \"$VAR_NAME=<your_value>\""
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

DEPLOY_URL=$(railway status --json | jq -r '.services.edges[0].node.url // empty' || echo "")

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
