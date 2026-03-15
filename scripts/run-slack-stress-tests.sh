#!/bin/bash

# Slack Features Stress Test Runner
# Runs all stress tests for the new Slack agentic features

echo "🧪 Running Slack Features Stress Tests"
echo "======================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test suite
run_test_suite() {
  local test_file=$1
  local test_name=$2
  
  echo -e "${YELLOW}Running: ${test_name}${NC}"
  
  if npm test -- "$test_file" --verbose 2>&1 | tee /tmp/test_output.log; then
    echo -e "${GREEN}✓ ${test_name} PASSED${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}✗ ${test_name} FAILED${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo ""
}

# Run all stress test suites
echo "📋 Test Suite: Intent Router"
echo "----------------------------"
run_test_suite "__tests__/slack/intentRouter.stress.test.ts" "Intent Router Stress Tests"

echo "🎨 Test Suite: Image Handler"
echo "----------------------------"
run_test_suite "__tests__/slack/imageHandler.stress.test.ts" "Image Handler Stress Tests"

echo "📊 Test Suite: Slide Handler"
echo "----------------------------"
run_test_suite "__tests__/slack/slideHandler.stress.test.ts" "Slide Handler Stress Tests"

echo "📅 Test Suite: Calendar Handler"
echo "-------------------------------"
run_test_suite "__tests__/slack/calendarHandler.stress.test.ts" "Calendar Handler Stress Tests"

# Summary
echo ""
echo "======================================="
echo "📊 Test Summary"
echo "======================================="
echo -e "Total Test Suites: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✓ All stress tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some stress tests failed. Check the output above.${NC}"
  exit 1
fi
