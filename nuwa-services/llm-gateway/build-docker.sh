#!/bin/bash
set -e

echo "Building LLM Gateway Docker image..."

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Workspace root: $WORKSPACE_ROOT"
echo "Building from: $SCRIPT_DIR"

# Build the Docker image from workspace root
cd "$WORKSPACE_ROOT"

docker build \
  -f nuwa-services/llm-gateway/Dockerfile \
  -t nuwa/llm-gateway:latest \
  .

echo "✅ Docker image built successfully: nuwa/llm-gateway:latest"

# Optional: Run a quick test
echo ""
echo "To test the image, run:"
echo "docker run -p 8080:8080 nuwa/llm-gateway:latest"
