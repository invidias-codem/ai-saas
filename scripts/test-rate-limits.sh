#!/bin/bash

# Rate Limit Stress Test Script
# Tests that rate limiting is working correctly across all secured endpoints

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
AUTH_TOKEN="${TEST_AUTH_TOKEN:-}"
TEST_USER_ID="${TEST_USER_ID:-}"

if [ -z "$AUTH_TOKEN" ]; then
  echo -e "${RED}ERROR: TEST_AUTH_TOKEN environment variable not set${NC}"
  echo "Usage: TEST_AUTH_TOKEN=your_token ./scripts/test-rate-limits.sh"
  exit 1
fi

echo "=========================================="
echo "  API Security - Rate Limit Stress Test"
echo "=========================================="
echo ""

# Test AI endpoints (20 req/min limit)
test_ai_endpoint() {
  local endpoint=$1
  local expected_limit=$2
  local total_requests=$((expected_limit + 10))
  
  echo -e "${YELLOW}Testing ${endpoint} (${expected_limit} req/min limit)...${NC}"
  
  success_count=0
  rate_limited_count=0
  
  for i in $(seq 1 $total_requests); do
    response=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}${endpoint}" \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "{\"prompt\":\"Test $i\"}")
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
      ((success_count++))
    elif [ "$response" = "429" ]; then
      ((rate_limited_count++))
    fi
    
    # Show progress
    echo -ne "\rRequests: $i/$total_requests | Success: $success_count | Rate Limited: $rate_limited_count"
  done
  
  echo ""
  
  # Verify rate limiting is working
  if [ $success_count -le $expected_limit ] && [ $rate_limited_count -ge 5 ]; then
    echo -e "${GREEN}✓ PASS: Rate limiting working correctly${NC}"
    echo "  Success: $success_count (≤ $expected_limit)"
    echo "  Rate Limited: $rate_limited_count (≥ 5)"
  else
    echo -e "${RED}✗ FAIL: Rate limiting not working as expected${NC}"
    echo "  Success: $success_count (expected ≤ $expected_limit)"
    echo "  Rate Limited: $rate_limited_count (expected ≥ 5)"
    return 1
  fi
  
  echo ""
}

# Test query endpoints (100 req/min limit)
test_query_endpoint() {
  local endpoint=$1
  local expected_limit=100
  local total_requests=120
  
  echo -e "${YELLOW}Testing ${endpoint} (${expected_limit} req/min limit)...${NC}"
  
  success_count=0
  rate_limited_count=0
  
  for i in $(seq 1 $total_requests); do
    response=$(curl -s -o /dev/null -w "%{http_code}" \
      -X GET "${BASE_URL}${endpoint}" \
      -H "Authorization: Bearer ${AUTH_TOKEN}")
    
    if [ "$response" = "200" ]; then
      ((success_count++))
    elif [ "$response" = "429" ]; then
      ((rate_limited_count++))
    fi
    
    echo -ne "\rRequests: $i/$total_requests | Success: $success_count | Rate Limited: $rate_limited_count"
  done
  
  echo ""
  
  if [ $success_count -le $expected_limit ] && [ $rate_limited_count -ge 10 ]; then
    echo -e "${GREEN}✓ PASS: Rate limiting working correctly${NC}"
    echo "  Success: $success_count (≤ $expected_limit)"
    echo "  Rate Limited: $rate_limited_count (≥ 10)"
  else
    echo -e "${RED}✗ FAIL: Rate limiting not working as expected${NC}"
    echo "  Success: $success_count (expected ≤ $expected_limit)"
    echo "  Rate Limited: $rate_limited_count (expected ≥ 10)"
    return 1
  fi
  
  echo ""
}

# Main test execution
echo "Starting rate limit tests..."
echo ""

# Test AI endpoints
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AI Endpoints (Strict Limits)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_ai_endpoint "/api/chat" 20
# Note: Uncomment to test other AI endpoints (they are expensive)
# test_ai_endpoint "/api/image" 10
# test_ai_endpoint "/api/code" 20

# Test query endpoints
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Data Access Endpoints (Standard Limits)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_query_endpoint "/api/conversations"
test_query_endpoint "/api/memory/count"
test_query_endpoint "/api/memory/analytics"

# Test rate limit reset
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Rate Limit Reset Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${YELLOW}Making initial request...${NC}"
response=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/api/chat" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Reset test 1"}')

if [ "$response" = "200" ]; then
  echo -e "${GREEN}✓ Initial request successful${NC}"
else
  echo -e "${RED}✗ Initial request failed: $response${NC}"
fi

echo -e "${YELLOW}Waiting 61 seconds for rate limit window to reset...${NC}"
sleep 61

echo -e "${YELLOW}Making request after reset...${NC}"
response=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${BASE_URL}/api/chat" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Reset test 2"}')

if [ "$response" = "200" ]; then
  echo -e "${GREEN}✓ PASS: Rate limit reset working correctly${NC}"
else
  echo -e "${RED}✗ FAIL: Rate limit did not reset properly${NC}"
  exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  All rate limit tests completed!${NC}"
echo "=========================================="
