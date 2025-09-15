#!/bin/bash

# Test MCP Gateway functionality
# Usage: ./test-gateway.sh [gateway-url]

GATEWAY_URL="${1:-http://localhost:8080}"

echo "🧪 Testing MCP Gateway at: $GATEWAY_URL"
echo ""

# Test gateway status
echo "📊 Testing gateway status..."
curl -s "$GATEWAY_URL/gateway/status" | jq '.' || echo "❌ Gateway status failed"
echo ""

# Test gateway health
echo "🏥 Testing gateway health..."
curl -s "$GATEWAY_URL/gateway/health" | jq '.' || echo "❌ Gateway health failed"
echo ""

# Test instance discovery
echo "📋 Testing instance discovery..."
curl -s "$GATEWAY_URL/gateway/instances" | jq '.' || echo "❌ Instance discovery failed"
echo ""

# Test subdomain routing (if configured)
echo "🔄 Testing subdomain routing..."

# Test amap subdomain (if available)
if command -v dig &> /dev/null; then
    AMAP_IP=$(dig +short amap.mcpproxy.xyz)
    if [ -n "$AMAP_IP" ]; then
        echo "Testing amap.mcpproxy.xyz..."
        curl -s -H "Host: amap.mcpproxy.xyz" "$GATEWAY_URL/mcp" \
          -X POST \
          -H "Content-Type: application/json" \
          -d '{"method": "tools/list"}' | head -5
    else
        echo "⚠️  amap.mcpproxy.xyz not configured in DNS"
    fi
else
    echo "⚠️  dig command not available, skipping DNS tests"
fi

echo ""
echo "✅ Gateway tests completed!"
