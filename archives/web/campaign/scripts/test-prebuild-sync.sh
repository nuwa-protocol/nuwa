#!/bin/bash

# Script for testing the prebuild blog sync functionality
# This is a local testing script only

# Check if force flag is set
FORCE_FLAG=""
if [ "$1" == "--force" ] || [ "$1" == "-f" ]; then
  FORCE_FLAG="--force"
  echo "🔄 Running with force sync option"
fi

echo "🧪 Testing prebuild blog sync script..."

# Check environment files
if [ -f .env.local ]; then
  echo "✓ Found .env.local file"
elif [ -f .env ]; then
  echo "✓ Found .env file"
else
  echo "⚠️ Warning: No .env or .env.local file found"
  echo "Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in at least one file"
fi

# Run prebuild script
echo "📂 Current working directory: $(pwd)"
echo "🚀 Executing prebuild blog sync..."
pnpm tsx scripts/prebuild-sync-blog.ts $FORCE_FLAG

if [ $? -eq 0 ]; then
  echo "✅ Prebuild test completed successfully"
else
  echo "❌ Prebuild test failed"
  exit 1
fi 