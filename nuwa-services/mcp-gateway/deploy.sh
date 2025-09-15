#!/bin/bash

# Deploy MCP Gateway to Railway
# Usage: ./deploy.sh

set -e

echo "🌐 Deploying MCP Gateway to Railway..."

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

# Check if project exists
if [ ! -f ".railway-project-id" ]; then
    echo "🆕 Creating new Railway project..."
    railway init --name "mcp-gateway"
    
    # Get project ID from status
    PROJECT_ID=$(railway status --json | jq -r '.id')
    if [ -n "$PROJECT_ID" ]; then
        echo "$PROJECT_ID" > ".railway-project-id"
        echo "✅ Project created successfully: $PROJECT_ID"
    else
        echo "❌ Failed to get project ID after creation"
        exit 1
    fi
else
    PROJECT_ID=$(cat ".railway-project-id")
    echo "📋 Using existing project: $PROJECT_ID"
    railway link --project "$PROJECT_ID"
fi

# Set environment variables
echo "🔧 Setting environment variables..."

# Set default environment variables
railway variables set PORT=8080
railway variables set DEBUG=false

echo "✅ Environment variables configured"

# Deploy
echo "🚀 Starting deployment..."
railway up --detach

# Get deployment URL
echo "🌐 Getting deployment information..."
sleep 5  # Wait for deployment to start

DEPLOY_URL=$(railway status --json | jq -r '.services.edges[0].node.url // empty' || echo "")

if [ -n "$DEPLOY_URL" ]; then
    echo "✅ Deployment successful!"
    echo "🌐 Gateway URL: $DEPLOY_URL"
    echo "📊 Status endpoint: $DEPLOY_URL/gateway/status"
    echo "🏥 Health endpoint: $DEPLOY_URL/gateway/health"
    echo "📋 Instances endpoint: $DEPLOY_URL/gateway/instances"
    
    # Save deployment information
    cat > ".deployment-info" << EOF
DEPLOY_URL=$DEPLOY_URL
PROJECT_ID=$PROJECT_ID
DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

    echo ""
    echo "🎯 Next steps:"
    echo "1. Configure your domain DNS:"
    echo "   - Add A record: mcpproxy.xyz → Railway IP"
    echo "   - Add CNAME record: *.mcpproxy.xyz → $DEPLOY_URL"
    echo ""
    echo "2. Add custom domain in Railway dashboard:"
    echo "   - Go to project settings"
    echo "   - Add domain: mcpproxy.xyz"
    echo ""
    echo "3. Test the gateway:"
    echo "   curl $DEPLOY_URL/gateway/status"

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
