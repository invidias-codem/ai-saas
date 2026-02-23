#!/bin/bash

# Pre-Deployment Verification Script
# Comprehensive checks before deploying to production

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Tracking
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNINGS=0

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Pre-Deployment Verification Checklist║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
check_start() {
    ((TOTAL_CHECKS++))
    echo -e "${CYAN}▶ Checking: $1${NC}"
}

check_pass() {
    ((PASSED_CHECKS++))
    echo -e "${GREEN}  ✓ PASS${NC}"
    echo ""
}

check_fail() {
    ((FAILED_CHECKS++))
    echo -e "${RED}  ✗ FAIL: $1${NC}"
    echo ""
}

check_warn() {
    ((WARNINGS++))
    echo -e "${YELLOW}  ⚠ WARNING: $1${NC}"
    echo ""
}

# 1. Environment Variables Check
check_start "Environment Variables"
required_vars=(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
    "CLERK_SECRET_KEY"
    "UPSTASH_REDIS_REST_URL"
    "UPSTASH_REDIS_REST_TOKEN"
    "NEXT_PUBLIC_SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ] && ! grep -q "^${var}=" .env.local 2>/dev/null; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -eq 0 ]; then
    check_pass
else
    check_fail "Missing environment variables: ${missing_vars[*]}"
fi

# 2. TypeScript Compilation
check_start "TypeScript Compilation"
if npm run build > /tmp/build.log 2>&1; then
    check_pass
else
    check_fail "Build failed. Check /tmp/build.log for details"
    tail -20 /tmp/build.log
fi

# 3. Linting
check_start "ESLint"
if npm run lint > /tmp/lint.log 2>&1; then
    check_pass
else
    check_warn "Linting issues found. Check /tmp/lint.log"
fi

# 4. Security Tests - Unit
check_start "Security Unit Tests"
if npm run test:security:unit > /tmp/test-unit.log 2>&1; then
    check_pass
else
    check_fail "Unit tests failed"
    tail -20 /tmp/test-unit.log
fi

# 5. Security Tests - Integration
check_start "Security Integration Tests"
if npm run test:security:integration > /tmp/test-integration.log 2>&1; then
    check_pass
else
    check_fail "Integration tests failed"
    tail -20 /tmp/test-integration.log
fi

# 6. Security File Existence
check_start "Security Files"
security_files=(
    "lib/security/apiAuth.ts"
    "lib/security/rateLimit.ts"
    "lib/security/inputValidation.ts"
)

missing_files=()
for file in "${security_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -eq 0 ]; then
    check_pass
else
    check_fail "Missing files: ${missing_files[*]}"
fi

# 7. Upstash Configuration Check
check_start "Upstash Redis Configuration"
if grep -q "UPSTASH_REDIS_REST_URL" .env.local && grep -q "UPSTASH_REDIS_REST_TOKEN" .env.local; then
    # Check if URLs are not placeholder values
    if grep -q "https://.*upstash.io" .env.local; then
        check_pass
    else
        check_fail "Upstash credentials appear to be placeholders"
    fi
else
    check_fail "Upstash credentials not found in .env.local"
fi

# 8. Critical Endpoints Check
check_start "Critical API Endpoints Exist"
critical_endpoints=(
    "app/api/chat/route.ts"
    "app/api/code/route.ts"
    "app/api/image/route.ts"
    "app/api/conversations/[id]/route.ts"
    "app/api/memory/preferences/route.ts"
)

missing_endpoints=()
for endpoint in "${critical_endpoints[@]}"; do
    if [ ! -f "$endpoint" ]; then
        missing_endpoints+=("$endpoint")
    fi
done

if [ ${#missing_endpoints[@]} -eq 0 ]; then
    check_pass
else
    check_fail "Missing endpoints: ${missing_endpoints[*]}"
fi

# 9. Security Imports Check
check_start "Security Imports in API Routes"
if grep -r "requireAuth\|limitApiEndpoint" app/api/chat/route.ts app/api/conversations/route.ts > /dev/null 2>&1; then
    check_pass
else
    check_fail "Security utilities not imported in API routes"
fi

# 10. Rate Limit Configuration
check_start "Rate Limit Configuration"
if grep -q "AI_RATE_LIMIT" lib/security/rateLimit.ts && grep -q "QUERY_RATE_LIMIT" lib/security/rateLimit.ts; then
    check_pass
else
    check_warn "Rate limit configuration may be incomplete"
fi

# 11. Package Dependencies
check_start "Required Package Dependencies"
required_packages=(
    "@upstash/ratelimit"
    "@upstash/redis"
    "zod"
    "@clerk/nextjs"
)

missing_packages=()
for package in "${required_packages[@]}"; do
    if ! grep -q "\"$package\"" package.json; then
        missing_packages+=("$package")
    fi
done

if [ ${#missing_packages[@]} -eq 0 ]; then
    check_pass
else
    check_fail "Missing packages: ${missing_packages[*]}"
fi

# 12. Git Status
check_start "Git Status"
if [ -z "$(git status --porcelain)" ]; then
    check_pass
else
    uncommitted=$(git status --porcelain | wc -l)
    check_warn "$uncommitted uncommitted changes. Consider committing before deploy."
fi

# 13. Test Scripts in package.json
check_start "Test Scripts Configuration"
if grep -q "\"test:security\"" package.json; then
    check_pass
else
    check_fail "Test scripts not configured in package.json"
fi

# 14. Documentation
check_start "Documentation Files"
doc_files=(
    "__tests__/security/README.md"
    ".gemini/antigravity/brain/*/walkthrough.md"
    ".gemini/antigravity/brain/*/testing-guide.md"
)

docs_exist=true
for pattern in "${doc_files[@]}"; do
    if ! ls $pattern > /dev/null 2>&1; then
        docs_exist=false
        break
    fi
done

if [ "$docs_exist" = true ]; then
    check_pass
else
    check_warn "Some documentation files may be missing"
fi

# Summary Report
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  Verification Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo "Total Checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
if [ $FAILED_CHECKS -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
else
    echo "Failed: 0"
fi
if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
else
    echo "Warnings: 0"
fi
echo ""

# Final verdict
if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║      ✓ READY FOR DEPLOYMENT!          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "All critical checks passed!"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Note: $WARNINGS warning(s) found. Review above.${NC}"
    fi
    echo ""
    echo "Next steps:"
    echo "  1. Review changes: git diff"
    echo "  2. Commit changes: git add . && git commit -m 'feat: implement API security'"
    echo "  3. Push to GitHub: git push origin main"
    echo "  4. Monitor deployment logs"
    echo "  5. Verify Upstash dashboard shows connections"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║      ✗ NOT READY FOR DEPLOYMENT        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}$FAILED_CHECKS critical check(s) failed.${NC}"
    echo ""
    echo "Please fix the issues above before deploying."
    echo ""
    exit 1
fi
