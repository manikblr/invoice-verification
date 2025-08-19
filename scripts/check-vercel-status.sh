#!/bin/bash

# Script to check Vercel deployment status and get logs
# Usage: ./scripts/check-vercel-status.sh [project-name]

PROJECT_NAME=${1:-"invoice-verification"}
BRANCH=${2:-"staging"}

echo "Checking Vercel deployment status for $PROJECT_NAME on $BRANCH..."

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Get latest deployment
echo "Fetching latest deployments..."
DEPLOYMENTS=$(vercel ls $PROJECT_NAME --token $VERCEL_TOKEN)

echo "Latest deployments:"
echo "$DEPLOYMENTS"

# Get deployment URL for the branch
DEPLOYMENT_URL=$(vercel ls $PROJECT_NAME --token $VERCEL_TOKEN | grep $BRANCH | head -1 | awk '{print $2}')

if [ -z "$DEPLOYMENT_URL" ]; then
    echo "No deployment found for branch $BRANCH"
    exit 1
fi

echo "Latest deployment URL: $DEPLOYMENT_URL"

# Test the deployment
echo "Testing deployment health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/health")

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ Deployment is healthy (HTTP $HTTP_STATUS)"
else
    echo "❌ Deployment failed health check (HTTP $HTTP_STATUS)"
    
    # Try to get more info
    echo "Attempting to fetch deployment logs..."
    # Note: This would require Vercel API integration
    echo "Manual check required at: https://vercel.com/dashboard"
fi

echo "Manual commands to investigate:"
echo "vercel logs $DEPLOYMENT_URL --token \$VERCEL_TOKEN"
echo "vercel inspect $DEPLOYMENT_URL --token \$VERCEL_TOKEN"