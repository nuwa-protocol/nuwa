#!/bin/bash

# Set environment variables for MCP Proxy instance
# Usage: ./set-env.sh <instance-name>

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
    exit 1
fi

echo "🔧 Setting environment variables for: $INSTANCE_NAME"
echo ""

# Check if env.example exists
if [ ! -f "$INSTANCE_DIR/env.example" ]; then
    echo "❌ No env.example file found for instance '$INSTANCE_NAME'"
    exit 1
fi

# Display current variables
echo "📋 Current environment variables:"
railway variables --json | jq -r 'to_entries[] | select(.key | test("^[A-Z_]+$")) | "\(.key) = \(.value)"' || echo "No custom variables set"
echo ""

# Show required variables from env.example
echo "📝 Required environment variables (from env.example):"
echo ""
cat "$INSTANCE_DIR/env.example" | grep -E "^[A-Z_]+=.*_here" | while read line; do
    VAR_NAME=$(echo "$line" | cut -d'=' -f1)
    VAR_EXAMPLE=$(echo "$line" | cut -d'=' -f2)
    echo "  $VAR_NAME (currently: $VAR_EXAMPLE)"
done
echo ""

# Interactive setup
echo "🚀 Interactive environment variable setup:"
echo "Press Enter to skip a variable, or Ctrl+C to cancel"
echo ""

cat "$INSTANCE_DIR/env.example" | grep -E "^[A-Z_]+=.*_here" | while read line; do
    VAR_NAME=$(echo "$line" | cut -d'=' -f1)
    
    # Check if variable already exists
    CURRENT_VALUE=$(railway variables --json | jq -r --arg key "$VAR_NAME" '.[$key] // empty')
    
    if [ -n "$CURRENT_VALUE" ]; then
        echo "✅ $VAR_NAME is already set"
    else
        echo -n "Enter value for $VAR_NAME: "
        read VAR_VALUE
        
        if [ -n "$VAR_VALUE" ]; then
            echo "Setting $VAR_NAME..."
            railway variables --set "$VAR_NAME=$VAR_VALUE"
            echo "✅ $VAR_NAME set successfully"
        else
            echo "⏭️  Skipping $VAR_NAME"
        fi
    fi
    echo ""
done

echo "🎉 Environment variable setup completed!"
echo ""
echo "📊 Current variables:"
railway variables
