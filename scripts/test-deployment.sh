#!/bin/bash

# Secure deployment testing script with Vercel bypass
# Usage: ./scripts/test-deployment.sh

set -e

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Check if bypass secret is available
if [ -z "$VERCEL_AUTOMATION_BYPASS_SECRET" ]; then
    echo "❌ VERCEL_AUTOMATION_BYPASS_SECRET not found in environment"
    echo "Add it to your .env file: echo 'VERCEL_AUTOMATION_BYPASS_SECRET=your_secret' >> .env"
    exit 1
fi

BASE_URL="https://invoice-verification-git-staging-manik-singlas-projects.vercel.app"
BYPASS_HEADER="x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"

echo "🔍 Testing deployment with bypass authentication..."
echo "URL: $BASE_URL"
echo ""

# Test 1: Health Check
echo "📋 Test 1: Health Check"
HEALTH_RESPONSE=$(curl -s -H "$BYPASS_HEADER" "$BASE_URL/health")
HEALTH_CODE=$(curl -s -w "%{http_code}" -o /dev/null -H "$BYPASS_HEADER" "$BASE_URL/health")

echo "HTTP Code: $HEALTH_CODE"
echo "Response: $HEALTH_RESPONSE"
echo ""

if [ "$HEALTH_CODE" != "200" ]; then
    echo "❌ Health check failed - stopping tests"
    exit 1
fi

echo "✅ Health check passed!"
echo ""

# Test 2: Functional Tests
echo "📋 Test 2: Invoice Validation Tests"

# Test A: ALLOW baseline
echo "Test A: ALLOW baseline (Anode Rod in range)"
TEST_A_PAYLOAD='{
  "scope_of_work": "Water heater replacement",
  "service_line": "Plumbing",
  "service_type": "Repair",
  "labor_hours": 2.5,
  "currency": "INR",
  "line_items": [
    {
      "line_type": "material",
      "raw_name": "Anode Rod",
      "quantity": 1,
      "unit": "pcs",
      "unit_price": 1200
    },
    {
      "line_type": "equipment", 
      "raw_name": "Pipe Wrench",
      "quantity": 1,
      "unit": "day",
      "unit_price": 400
    }
  ]
}'

RESPONSE_A=$(curl -s -H "$BYPASS_HEADER" -H "Content-Type: application/json" \
    -X POST "$BASE_URL/validate-invoice" -d "$TEST_A_PAYLOAD")
CODE_A=$(curl -s -w "%{http_code}" -o /dev/null -H "$BYPASS_HEADER" \
    -H "Content-Type: application/json" -X POST "$BASE_URL/validate-invoice" -d "$TEST_A_PAYLOAD")

echo "HTTP: $CODE_A"
echo "Status: $(echo "$RESPONSE_A" | grep -o '"overall_status":"[^"]*"' || echo 'N/A')"
echo "Invoice ID: $(echo "$RESPONSE_A" | grep -o '"invoice_id":"[^"]*"' || echo 'N/A')"
echo ""

# Test B: PRICE_HIGH
echo "Test B: PRICE_HIGH (Anode Rod overpriced)"
TEST_B_PAYLOAD='{
  "scope_of_work": "Water heater replacement - overpriced",
  "service_line": "Plumbing", 
  "service_type": "Repair",
  "labor_hours": 2.5,
  "currency": "INR",
  "line_items": [
    {
      "line_type": "material",
      "raw_name": "Anode Rod", 
      "quantity": 1,
      "unit": "pcs",
      "unit_price": 20000
    }
  ]
}'

RESPONSE_B=$(curl -s -H "$BYPASS_HEADER" -H "Content-Type: application/json" \
    -X POST "$BASE_URL/validate-invoice" -d "$TEST_B_PAYLOAD")
CODE_B=$(curl -s -w "%{http_code}" -o /dev/null -H "$BYPASS_HEADER" \
    -H "Content-Type: application/json" -X POST "$BASE_URL/validate-invoice" -d "$TEST_B_PAYLOAD")

echo "HTTP: $CODE_B"
echo "Status: $(echo "$RESPONSE_B" | grep -o '"overall_status":"[^"]*"' || echo 'N/A')"
echo ""

echo "🎯 Basic tests completed!"
echo ""
echo "Full response samples:"
echo "Test A Response (truncated): $(echo "$RESPONSE_A" | head -c 200)..."
echo "Test B Response (truncated): $(echo "$RESPONSE_B" | head -c 200)..."