#!/bin/bash

# Create new MCP Proxy instance
# Usage: ./create-instance.sh <instance-name> [template-type]

set -e

INSTANCE_NAME="$1"
TEMPLATE_TYPE="${2:-httpStream}"

if [ -z "$INSTANCE_NAME" ]; then
    echo "Usage: $0 <instance-name> [template-type]"
    echo "template-type: httpStream (default) | stdio"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENTS_DIR="$(dirname "$SCRIPT_DIR")"
INSTANCE_DIR="$DEPLOYMENTS_DIR/instances/$INSTANCE_NAME"

echo "🚀 Creating new instance: $INSTANCE_NAME"
echo "📁 Instance directory: $INSTANCE_DIR"

# Check if instance already exists
if [ -d "$INSTANCE_DIR" ]; then
    echo "❌ Instance '$INSTANCE_NAME' already exists"
    exit 1
fi

# Create instance directory
mkdir -p "$INSTANCE_DIR"

# Create configuration based on template type
case "$TEMPLATE_TYPE" in
    "httpStream")
        cat > "$INSTANCE_DIR/config.yaml" << EOF
# $INSTANCE_NAME MCP Proxy Configuration

# Server settings
port: \${PORT}
endpoint: "/mcp"

# HTTP/HTTPS upstream MCP server
upstream:
  type: "httpStream"
  url: "https://api.example.com/mcp"
  auth:
    scheme: "bearer"
    token: "\${UPSTREAM_API_TOKEN}"

# Payment configuration
serviceId: "$INSTANCE_NAME"
serviceKey: "\${SERVICE_KEY}"
network: "test"
rpcUrl: "\${ROOCH_RPC_URL}"
defaultAssetId: "0x3::gas_coin::RGas"
defaultPricePicoUSD: "1000000000"  # 0.001 USD
debug: \${DEBUG}

# Tool pricing configuration (example)
register:
  tools:
    - name: "example.tool"
      pricePicoUSD: "500000000"  # 0.0005 USD
EOF
        ;;
    "stdio")
        cat > "$INSTANCE_DIR/config.yaml" << EOF
# $INSTANCE_NAME MCP Proxy Configuration

# Server settings
port: \${PORT}
endpoint: "/mcp"

# Stdio upstream MCP server (Node.js example)
upstream:
  type: "stdio"
  command: ["npx", "-y", "@example/mcp-server"]
  env:
    API_KEY: "\${UPSTREAM_API_KEY}"
  # For Python MCP servers, use:
  # command: ["uvx", "my-python-mcp-server"]

# Payment configuration
serviceId: "$INSTANCE_NAME"
serviceKey: "\${SERVICE_KEY}"
network: "test"
defaultPricePicoUSD: "1000000000"  # 0.001 USD
debug: \${DEBUG}

# Tool pricing configuration (example)
register:
  tools:
    - name: "example.tool"
      pricePicoUSD: "500000000"  # 0.0005 USD
EOF
        ;;
    *)
        echo "❌ Unknown template type: $TEMPLATE_TYPE"
        echo "Supported types: httpStream, stdio"
        exit 1
        ;;
esac

# Create environment variables example file
cat > "$INSTANCE_DIR/env.example" << EOF
# $INSTANCE_NAME Environment Variables Configuration

# Automatically provided by Railway
PORT=8080

# Payment service configuration
SERVICE_KEY=your_service_key_here
ROOCH_RPC_URL=https://test-seed.rooch.network

# Upstream service configuration
UPSTREAM_API_TOKEN=your_upstream_api_token_here

# Debug configuration
DEBUG=false
EOF

# Create Railway configuration file
cat > "$INSTANCE_DIR/railway.json" << EOF
{
  "name": "$INSTANCE_NAME",
  "description": "MCP Server Proxy - $INSTANCE_NAME",
  "build": {
    "buildCommand": "cd nuwa-services/mcp-server-proxy && pnpm install && pnpm run build",
    "startCommand": "cd nuwa-services/mcp-server-proxy && CONFIG_PATH=./deployments/instances/$INSTANCE_NAME/config.yaml pnpm start"
  },
  "healthcheck": {
    "path": "/health",
    "interval": 30,
    "timeout": 10
  }
}
EOF

# Create deployment documentation
cat > "$INSTANCE_DIR/README.md" << EOF
# $INSTANCE_NAME MCP Proxy

## Configuration

1. Copy \`env.example\` to Railway environment variables
2. Modify upstream configuration in \`config.yaml\`
3. Adjust tool pricing strategy

## Deployment

\`\`\`bash
# Deploy to Railway
railway login
railway link
railway up

# Set environment variables
railway variables set SERVICE_KEY=your_key_here
railway variables set UPSTREAM_API_TOKEN=your_token_here
\`\`\`

## Testing

\`\`\`bash
# Health check
curl https://$INSTANCE_NAME.railway.app/health

# Tool list
curl https://$INSTANCE_NAME.railway.app/mcp \\
  -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"method": "tools/list"}'
\`\`\`
EOF

echo "✅ Instance '$INSTANCE_NAME' created successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Edit configuration: $INSTANCE_DIR/config.yaml"
echo "2. Set environment variables: $INSTANCE_DIR/env.example"
echo "3. Deploy instance: ./deploy.sh $INSTANCE_NAME"
echo ""
echo "📖 View documentation: $INSTANCE_DIR/README.md"
