#!/bin/bash

# Quick Security Test Runner
# Runs all security tests with proper setup and reporting

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================="
echo "  Security Test Suite"
echo -e "==========================================${NC}"
echo ""

# Check for required dependencies
if ! command -v npm &> /dev/null; then
    echo -e "${RED}ERROR: npm is not installed${NC}"
    exit 1
fi

# Function to run tests with nice output
run_test_suite() {
    local test_name=$1
    local test_path=$2
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  Running: ${test_name}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if npm test -- "$test_path" --verbose; then
        echo -e "${GREEN}✓ ${test_name} PASSED${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ ${test_name} FAILED${NC}"
        echo ""
        return 1
    fi
}

# Track results
total_suites=0
passed_suites=0
failed_suites=0

# Run unit tests
((total_suites++))
if run_test_suite "Unit Tests (Security Utilities)" "__tests__/security/security-utils.test.ts"; then
    ((passed_suites++))
else
    ((failed_suites++))
fi

# Run integration tests
((total_suites++))
if run_test_suite "Integration Tests (API Endpoints)" "__tests__/security/api-security.integration.test.ts"; then
    ((passed_suites++))
else
    ((failed_suites++))
fi

# Check if E2E tests should run
if [ -n "$TEST_AUTH_TOKEN" ]; then
    echo -e "${BLUE}Found TEST_AUTH_TOKEN - running E2E tests...${NC}"
    echo ""
    
    ((total_suites++))
    if run_test_suite "E2E Tests (Security Flows)" "__tests__/security/security-e2e.test.ts"; then
        ((passed_suites++))
    else
        ((failed_suites++))
    fi
else
    echo -e "${YELLOW}⚠ Skipping E2E tests (TEST_AUTH_TOKEN not set)${NC}"
    echo "  To run E2E tests:"
    echo "  TEST_AUTH_TOKEN=your_token ./scripts/run-security-tests.sh"
    echo ""
fi

# Print summary
echo -e "${BLUE}=========================================="
echo "  Test Summary"
echo -e "==========================================${NC}"
echo ""
echo "Total Suites: $total_suites"
echo -e "${GREEN}Passed: $passed_suites${NC}"
if [ $failed_suites -gt 0 ]; then
    echo -e "${RED}Failed: $failed_suites${NC}"
else
    echo "Failed: 0"
fi
echo ""

# Print recommendations
if [ $failed_suites -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Your API security is production-ready! 🎉"
    echo ""
    echo "Next steps:"
    echo "  1. Review Upstash dashboard for rate limit activity"
    echo "  2. Deploy to staging for final verification"
    echo "  3. Monitor error rates after deployment"
    echo ""
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Please fix failing tests before deploying."
    echo ""
    echo "Common issues:"
    echo "  - Mocks not configured correctly"
    echo "  - Environment variables missing"
    echo "  - Upstash Redis not connected"
    echo ""
    echo "See __tests__/security/README.md for troubleshooting"
    echo ""
    exit 1
fi
