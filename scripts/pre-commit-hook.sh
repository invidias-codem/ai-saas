#!/bin/bash

# Pre-commit hook for security validation
# Install: Copy to .git/hooks/pre-commit and chmod +x

set -e

echo "🔒 Running pre-commit security checks..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if security files exist
if [ ! -f "lib/security/apiAuth.ts" ] || \
   [ ! -f "lib/security/rateLimit.ts" ] || \
   [ ! -f "lib/security/inputValidation.ts" ]; then
    echo -e "${RED}❌ Security utility files missing${NC}"
    exit 1
fi

# Run unit tests for security utilities
echo "Running security unit tests..."
if ! npm run test:security:unit --silent > /dev/null 2>&1; then
    echo -e "${RED}❌ Security unit tests failed${NC}"
    echo "Run 'npm run test:security:unit' to see details"
    exit 1
fi

# Check for common security issues
echo "Checking for security anti-patterns..."

# Check if any API routes don't have requireAuth
api_routes=$(find app/api -name "route.ts" -type f)
missing_auth=0

for route in $api_routes; do
    # Skip non-critical routes
    if [[ "$route" == *"guest"* ]] || [[ "$route" == *"public"* ]]; then
        continue
    fi
    
    if ! grep -q "requireAuth\|auth()" "$route" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Missing auth in: $route${NC}"
        ((missing_auth++))
    fi
done

if [ $missing_auth -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $missing_auth routes without authentication${NC}"
    echo "Consider adding requireAuth() to these routes"
fi

# Check TypeScript compilation
echo "Checking TypeScript..."
if ! npx tsc --noEmit --skipLibCheck lib/security/*.ts > /dev/null 2>&1; then
    echo -e "${RED}❌ TypeScript errors in security files${NC}"
    exit 1
fi

# Check for hardcoded secrets
echo "Checking for hardcoded secrets..."
if git diff --cached --name-only | xargs grep -E "sk_test_|sk_live_|pk_test_|pk_live_|AKIA" 2>/dev/null; then
    echo -e "${RED}❌ Potential hardcoded secrets detected${NC}"
    echo "Remove secrets before committing"
    exit 1
fi

echo -e "${GREEN}✅ All pre-commit checks passed${NC}"
exit 0
