#!/bin/bash

# List Railway projects to help find project IDs
# Usage: ./list-projects.sh

set -e

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

echo "📋 Available Railway projects:"
echo ""

# List all projects
railway list --json | jq -r '.[] | "ID: \(.id)\nName: \(.name)\nWorkspace: \(.workspace.name)\n---"'

echo ""
echo "💡 To deploy to an existing project, use:"
echo "   ./deploy.sh <instance-name> <project-id>"
