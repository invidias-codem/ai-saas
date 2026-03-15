# CI/CD Pipeline Documentation

## Overview

Automated CI/CD pipeline for security testing and deployment using GitHub Actions. Ensures all code changes are tested before merging and deploying to production.

---

## GitHub Actions Workflows

### 1. [Security Tests](.github/workflows/security-tests.yml)

**Triggers**: Push to `main`, `develop`, `staging` or pull requests

**What it does**:
- ✅ Runs security unit tests
- ✅ Runs security integration tests
- ✅ Checks TypeScript compilation
- ✅ Runs ESLint
- ✅ Uploads test results as artifacts
- ✅ Comments on PRs if tests fail

**Jobs**:
1. **security-tests** - Runs all security test suites
2. **build-verification** - Verifies production build succeeds
3. **security-audit** - Runs npm audit for vulnerabilities

**Required secrets** (configure in GitHub Settings → Secrets):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 2. [Production Deployment](.github/workflows/deploy-production.yml)

**Triggers**: Push to `main` or manual dispatch

**What it does**:
- ✅ Runs all security checks first (mandatory)
- ✅ Builds the application
- ✅ Deploys to Vercel only if all tests pass
- ✅ Notifies on success/failure

**Jobs**:
1. **security-checks** - Must pass before deployment
2. **deploy** - Deploys to Vercel production

**Additional required secrets**:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### 3. [Rate Limit Check](.github/workflows/rate-limit-check.yml)

**Triggers**: Daily at 3 AM UTC or manual dispatch

**What it does**:
- ✅ Verifies Upstash connectivity
- ✅ Checks rate limit configuration
- ✅ Generates monitoring report
- ✅ Uploads report as artifact

---

## Local Git Hooks

### Setup

Install Git hooks locally:

```bash
npm run setup:hooks
```

This installs:
1. **Pre-commit hook** - Runs security tests before commit
2. **Commit-msg hook** - Enforces conventional commit format

### Pre-commit Hook

**What it checks**:
- ✅ Security utility files exist
- ✅ Security unit tests pass
- ✅ TypeScript compiles without errors
- ✅ No hardcoded secrets in code
- ✅ API routes have authentication

**Bypass** (not recommended):
```bash
git commit --no-verify
```

### Commit Message Format

Enforces [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope?): description

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
```

**Examples**:
```bash
git commit -m "feat: add user authentication"
git commit -m "fix(api): resolve rate limiting issue"
git commit -m "docs: update API documentation"
```

---

## Setting Up GitHub Secrets

### Required Secrets

Navigate to: `Settings → Secrets and variables → Actions → New repository secret`

**Production Environment**:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  = pk_live_xxxxx
CLERK_SECRET_KEY                   = sk_live_xxxxx
NEXT_PUBLIC_SUPABASE_URL           = https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY          = eyJxxxxx
UPSTASH_REDIS_REST_URL             = https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN           = AxxxXX
```

**Vercel Deployment**:
```
VERCEL_TOKEN      = Get from: https://vercel.com/account/tokens
VERCEL_ORG_ID     = Found in: .vercel/project.json
VERCEL_PROJECT_ID = Found in: .vercel/project.json
```

### Getting Vercel Credentials

```bash
# Link to Vercel project
npx vercel link

# Find IDs in generated file
cat .vercel/project.json
```

---

## Workflow Status Badges

Add to your README.md:

```markdown
![Security Tests](https://github.com/YOUR_USERNAME/ai-saas/actions/workflows/security-tests.yml/badge.svg)
![Deploy](https://github.com/YOUR_USERNAME/ai-saas/actions/workflows/deploy-production.yml/badge.svg)
```

---

## Development Workflow

### Feature Development

```bash
# 1. Create feature branch
git checkout -b feat/new-feature

# 2. Make changes
# ... code ...

# 3. Run tests locally
npm run test:security

# 4. Commit (pre-commit hook runs automatically)
git commit -m "feat: add new feature"

# 5. Push to GitHub
git push origin feat/new-feature

# 6. Create pull request
# GitHub Actions will run security tests automatically
```

### Deployment to Production

```bash
# 1. Merge PR to main
git checkout main
git merge feat/new-feature

# 2. Push to main
git push origin main

# GitHub Actions will:
# - Run security tests
# - Build application
# - Deploy to Vercel (if tests pass)
```

---

## Monitoring CI/CD

### GitHub Actions Tab

View workflow runs:
1. Go to repository → **Actions** tab
2. See all workflow runs
3. Click on run for detailed logs

### Failed Workflow

If a workflow fails:

1. **Check the logs** in GitHub Actions
2. **Fix the issue** locally
3. **Push the fix**
4. Workflow will automatically re-run

### Debugging Failed Tests

```bash
# Run the same tests locally
npm run test:security

# Run specific test suite
npm run test:security:unit
npm run test:security:integration

# Run with verbose output
npm test -- __tests__/security --verbose
```

---

## NPM Scripts Reference

### Testing
```bash
npm run test:security              # Run all security tests
npm run test:security:unit         # Unit tests only
npm run test:security:integration  # Integration tests
npm run test:security:e2e          # E2E tests (requires auth)
npm run test:rate-limits           # Rate limit stress test
```

### Deployment Checks
```bash
npm run deploy:check         # Full pre-deployment check
npm run deploy:check:lite    # Lightweight check (no build)
```

### Setup
```bash
npm run setup:hooks          # Install Git hooks
```

---

## Continuous Improvement

### Adding New Tests

When adding new security tests:

1. Add test files to `__tests__/security/`
2. Tests will automatically run in CI
3. Update this documentation if needed

### Modifying Workflows

To modify GitHub Actions workflows:

1. Edit `.github/workflows/*.yml`
2. Test locally with [act](https://github.com/nektos/act) (optional)
3. Push and monitor in Actions tab

### Adjusting Rate Limits

If changing rate limits:

1. Update `lib/security/rateLimit.ts`
2. Update tests with new values
3. Update rate-limit-check workflow
4. Document changes

---

## Troubleshooting

### Workflow Fails: "Secret not found"

**Solution**: Add required secrets in GitHub Settings

### Pre-commit Hook Not Running

**Solution**: Run `npm run setup:hooks` again

### Tests Pass Locally But Fail in CI

**Causes**:
- Environment variables different
- Node version mismatch
- Dependency version differences

**Solution**:
```bash
# Match CI Node version
nvm use 20

# Use CI dependency install
npm ci

# Run tests
npm run test:security
```

### Deployment Succeeds But Site Broken

**Check**:
1. Vercel deployment logs
2. Environment variables in Vercel dashboard
3. Build logs for warnings

---

## Best Practices

### Before Merging PRs

- ✅ All CI checks pass
- ✅ Code reviewed by at least one person
- ✅ No merge conflicts
- ✅ Tests added for new features
- ✅ Documentation updated

### For Production Deployments

- ✅ All security tests pass
- ✅ Build succeeds
- ✅ Tested in staging environment
- ✅ Database migrations completed
- ✅ Monitor deployment for 5-10 minutes

### Security Updates

- ✅ Run `npm audit` regularly
- ✅ Update dependencies quarterly
- ✅ Review Dependabot PRs
- ✅ Test security patches before merging

---

## Support

**Issues with CI/CD?**
1. Check workflow logs in GitHub Actions
2. Review this documentation
3. Check `.github/workflows` directory
4. Test locally before pushing

**Resources**:
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Vercel Deployment](https://vercel.com/docs)
- [Conventional Commits](https://www.conventionalcommits.org/)
