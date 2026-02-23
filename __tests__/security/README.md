# Security Testing Guide

## Overview

This directory contains comprehensive security tests for all API endpoints. Tests verify:
- ✅ Authentication & authorization
- ✅ Rate limiting (AI & data endpoints)
- ✅ Input validation
- ✅ Ownership validation
- ✅ Error handling

## Test Structure

```
__tests__/security/
├── security-utils.test.ts           # Unit tests for security utilities
├── api-security.integration.test.ts # Integration tests for API endpoints
└── security-e2e.test.ts             # End-to-end security flows
```

## Running Tests

### All Security Tests
```bash
npm test -- __tests__/security
```

### Unit Tests Only
```bash
npm test -- __tests__/security/security-utils.test.ts
```

### Integration Tests
```bash
npm test -- __tests__/security/api-security.integration.test.ts
```

### E2E Tests (requires running server)
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run E2E tests
TEST_AUTH_TOKEN=your_token TEST_USER_ID=your_id npm test -- __tests__/security/security-e2e.test.ts
```

### Rate Limit Stress Test
```bash
TEST_AUTH_TOKEN=your_token ./scripts/test-rate-limits.sh
```

## Test Coverage

### Unit Tests (`security-utils.test.ts`)

**apiAuth.ts**
- ✅ Authentication validation
- ✅ Ownership verification
- ✅ IP address extraction
- ✅ Error handling

**inputValidation.ts**
- ✅ UUID validation
- ✅ Prompt validation (length limits)
- ✅ Request size validation
- ✅ Image generation parameters
- ✅ Schema validation

### Integration Tests (`api-security.integration.test.ts`)

**AI Endpoints**
- ✅ `/api/chat` - Authentication, rate limiting (20 req/min), prompt validation
- ✅ `/api/image` - Authentication, rate limiting (10 req/min), parameter validation
- ✅ `/api/code` - Authentication, rate limiting, file validation
- ✅ `/api/video` - Authentication, rate limiting
- ✅ `/api/music` - Authentication, rate limiting

**Conversation Endpoints**
- ✅ `/api/conversations` - List with user scoping
- ✅ `/api/conversations/[id]` - Ownership validation, CRUD operations
- ✅ `/api/conversations/new` - Creation with validation
- ✅ `/api/conversations/vault` - Filter validation

**Memory Endpoints**
- ✅ `/api/memory/preferences` - CRUD with rate limiting
- ✅ `/api/memory/delete` - UUID validation,  authentication
- ✅ `/api/memory/extend` - TTL extension with validation
- ✅ `/api/memory/scope` -  Enum validation, ownership check
- ✅ `/api/memory/count` - Count aggregation
- ✅ `/api/memory/analytics` - Analytics with user scoping

### E2E Tests (`security-e2e.test.ts`)

**Rate Limiting Flows**
- ✅ AI endpoint burst testing (20 req/min)
- ✅ Image endpoint strict limiting (10 req/min)
- ✅ Rate limit window reset verification

**Ownership Validation Flows**
- ✅ Cross-user access prevention
- ✅ Own resource access
- ✅ Update/delete authorization

**Input Validation Flows**
- ✅ Malformed UUID rejection across all endpoints
- ✅ Oversized payload rejection
- ✅ Empty/invalid parameter rejection

**Authentication Flows**
- ✅ Unauthenticated request rejection
- ✅ Invalid token rejection

**Multi-Step Flows**
- ✅ Complete CRUD cycle with security checks

## Environment Variables

For E2E tests, set these environment variables:

```bash
# Required for E2E tests
export TEST_AUTH_TOKEN="your_clerk_auth_token"
export TEST_USER_ID="your_user_id"
export NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional - for testing against production
export NEXT_PUBLIC_APP_URL="https://your-production-domain.com"
```

## Test Data Setup

Before running E2E tests:

1. **Create test user**: Sign up at your app's `/sign-up` page
2. **Get auth token**: Use browser dev tools to extract the Clerk token
3. **Create test data** (optional):
   ```bash
   curl -X POST http://localhost:3000/api/conversations/new \
     -H "Authorization: Bearer $TEST_AUTH_TOKEN" \
     -d '{"title":"Test Conversation"}'
   ```

## Expected Results

### Unit Tests
- **Duration**: ~2-5 seconds
- **Coverage**: All security utilities
- **Expected**: 100% pass rate

### Integration Tests
- **Duration**: ~10-30 seconds
- **Coverage**: All API endpoints
- **Expected**: 100% pass rate

### E2E Tests
- **Duration**: ~2-5 minutes
- **Coverage**: Complete security flows
- **Expected**: 100% pass rate (with valid auth)

### Rate Limit Stress Test
- **Duration**: ~3-5 minutes
- **Coverage**: Rate limiting across endpoints
- **Expected Output**:
  ```
  Testing /api/chat (20 req/min limit)...
  ✓ PASS: Rate limiting working correctly
    Success: 20 (≤ 20)
    Rate Limited: 10 (≥ 5)
  ```

## Troubleshooting

### Tests Failing with 401 Unauthorized

**Problem**: Auth token expired or invalid

**Solution**:
```bash
# Get fresh token from browser dev tools
export TEST_AUTH_TOKEN="new_token_here"
```

### Rate Limit Tests Showing 0 Rate Limited

**Problem**: Upstash Redis not configured or not working

**Solution**:
1. Check `.env.local` has Upstash credentials
2. Verify Upstash dashboard shows connections
3. Check console logs for rate limit fallback messages

### E2E Tests Timing Out

**Problem**: Server not running or rate limits too aggressive

**Solution**:
```bash
# Ensure dev server is running
npm run dev

# Or increase test timeouts in jest.config.js
```

### Ownership Tests Failing

**Problem**: Test data belongs to different user

**Solution**:
```bash
# Create fresh test conversation
curl -X POST http://localhost:3000/api/conversations/new \
  -H "Authorization: Bearer $TEST_AUTH_TOKEN" \
  -d '{"title":"Test"}' | jq .conversationId

# Use returned ID in tests
export OWNED_CONVERSATION_ID="returned_id"
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run unit tests
        run: npm test -- __tests__/security/security-utils.test.ts
        
      - name: Run integration tests
        run: npm test -- __tests__/security/api-security.integration.test.ts
        env:
          NODE_ENV: test
          
      # E2E tests require running server - run in separate job
```

## Continuous Monitoring

After deployment, set up monitoring:

1. **Upstash Dashboard**: Monitor rate limit hits
2. **Error Tracking**: Watch for 429, 403, 401 errors
3. **Performance**: Track endpoint response times

## Security Test Checklist

Before deploying:

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Rate limit stress test shows correct limiting
- [ ] E2E ownership validation working
- [ ] Upstash Redis connected (check dashboard)
- [ ] No authentication bypasses
- [ ] All input validation working
- [ ] Error messages don't leak sensitive info

## Adding New Tests

When adding a new secured endpoint:

1. **Add unit test** for any new validation schemas
2. **Add integration test** for the endpoint
3. **Add E2E test** if it involves multi-step flows
4. **Update this README** with new test coverage

Example:
```typescript
describe('/api/new-endpoint', () => {
  test('should authenticate', async () => {
    // Test authentication
  });
  
  test('should rate limit', async () => {
    // Test rate limiting
  });
  
  test('should validate input', async () => {
    // Test input validation
  });
});
```

## Support

For questions or issues with tests:
1. Check this README
2. Review test output for specific errors
3. Check security utility implementations
4. Verify environment variables are set correctly
