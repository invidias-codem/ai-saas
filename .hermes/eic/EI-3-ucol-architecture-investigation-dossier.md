# EI-3 Investigation C — UCOL Architecture Investigation Dossier

## Investigation Objective

Establish a reproducible package baseline for the reported 39 TypeScript errors and three failing test suites in `packages/ucol-node/`, and implement independently reviewable recovery slices.

## Current UCOL Package State

**Package**: `@lattice-os/ucol-node` (in `packages/ucol-node/`)  
**Reported baseline**: 39 TypeScript errors, 3 failing test suites  
**Failing test suites**: `security.test.ts`, `engram.test.ts`, `router.test.ts`  
**All pre-existing on main @ 80c49ad6** (not caused by Cycle 3/4 changes)

## Package Structure

```
packages/ucol-node/
├── package.json          (hono ^4.13.16, bumped from ^4.12.34 in WP-C)
├── package-lock.json     (npm lockfile, hono 4.13.23)
├── src/
│   ├── router/
│   │   ├── index.ts          (ContextStore, SECURITY_TIER_ORDER)
│   │   ├── classify.ts       (TaskIntent)
│   │   └── format.ts
│   ├── store/
│   │   ├── index.ts          (ContextStore)
│   │   └── schema.ts         (SECURITY_TIER_ORDER)
│   ├── session/
│   │   └── index.ts          (Session management, DEFAULT_TTL_SECONDS)
│   └── ...
```

## Key Source Files

### `src/router/index.ts`
- Uses `ContextStore` from `../store/index.js`
- Uses `SECURITY_TIER_ORDER` from `../store/schema.js`
- Router with store-based knowledge search

### `src/router/classify.ts`
- Imports `TaskIntent` from `../store/schema.js`

### `src/router/format.ts`
- Imports from `../store/schema.js`

### `src/store/index.ts`
- `ContextStore` class
- Session persistence with upsert

### `src/store/schema.ts`
- `SECURITY_TIER_ORDER` constant
- `TaskIntent` type

### `src/session/index.ts`
- Session management with TTL (default `DEFAULT_TTL_SECONDS`)
- `upsertSession(session)`

## Reported Issues

| Issue | Count | Status |
|-------|-------|--------|
| TypeScript errors | 39 | Pre-existing on main |
| Failing test suites | 3 | `security.test.ts`, `engram.test.ts`, `router.test.ts` |
| All pre-existing | Yes | Not caused by Cycle 3/4 changes (WP-C hono bump verified clean) |

## WP-C Verification (Hono Bump)

| Check | Result |
|-------|--------|
| hono ^4.12.34 → ^4.13.16 | Done |
| `packages/ucol-node/package-lock.json` regenerated (npm, hono 4.13.23) | Done |
| Root `pnpm-lock.yaml` regenerated (minimal 5-line change) | Done |
| `pnpm install --frozen-lockfile` | Passes |
| ucol-node typecheck | Only pre-existing errors (unrelated to hono) |
| ucol-node tests | Only pre-existing failures (unrelated to hono) |
| PR #547 | Created (draft), closed #502 and #503 |

## Required Recovery Slices (WP-P)

### Slice 1 — Package Exports, Dependency Declarations, RootDir Boundaries

**Required behavior**:
- Valid package exports (no broken import paths)
- Correct dependency declarations (no missing/extraneous deps)
- RootDir boundaries respected (TypeScript `rootDir` not violated)

**Reference evidence**: REA `tsconfig.build.json`, `tsconfig.scripts.json` for TypeScript project structure patterns

**Unknowns**:
- Exact `tsconfig.json` configuration for ucol-node
- Which imports violate rootDir
- What the intended public API surface is

**Lattice security invariants**: No weakened authorization; no broad `any` casts

**Tests**: `tsc --noEmit` zero errors; package builds successfully

**Acceptance evidence**: `tsc` clean; `pnpm build` (if defined) succeeds

---

### Slice 2 — Task and Mission Validators (`isTask`, `isMissionSpec`)

**Required behavior**:
- Reconcile `isTask` and `isMissionSpec` validators
- Fail-closed validation (reject invalid, accept only valid)
- Clear error messages for invalid input

**Reference evidence**: REA `AnalysisInputError` with `conformsToInputContract`, `ambiguousSelector`; REA `fixedCeilingConstraint` for fixed ceilings

**Unknowns**:
- Current validator implementations (not yet inspected)
- What constitutes a valid task vs mission spec
- How validators are called (callers)

**Lattice security invariants**: Fail-closed authorization; no silent acceptance of invalid input

**Tests**: Validator unit tests (valid/invalid inputs); integration tests through router

**Acceptance evidence**: All validator tests pass; no invalid input accepted

---

### Slice 3 — API Handlers and Fail-Closed Request Authentication

**Required behavior**:
- Repair handler contracts
- Implement or restore `authenticateRequest`
- Fail-closed: unauthenticated requests rejected
- No handler bypasses auth

**Reference evidence**: REA `AnalysisAccessDeniedError` for EACCES/EPERM; REA `ProviderSelectionError` for provider unavailability; REA tagged error algebra

**Unknowns**:
- Current handler implementations
- What `authenticateRequest` looked like (if it existed)
- How auth is integrated with Clerk/Supabase

**Lattice security invariants**: C1 `role === 'owner'`; fail-closed; no bypass

**Tests**: Auth middleware tests (missing/invalid/valid tokens); handler tests with unauthenticated requests

**Acceptance evidence**: 401 on missing auth; 403 on insufficient role; 200 on valid owner auth

---

### Slice 4 — Router and Store Type Contracts

**Required behavior**:
- Correct router type contracts
- Resolve store inference failures
- Preserve routing determinism
- Preserve execution ownership and authorization

**Reference evidence**: REA `TargetIdentity` for typed identities; REA `AnalysisPartialObservation` union type for structured observations

**Unknowns**:
- Current store type definitions
- Router type signatures
- Inference failure locations

**Lattice security invariants**: No `any` casts; no compiler suppression

**Tests**: Type-level tests; routing determinism tests

**Acceptance evidence**: `tsc --noEmit` zero errors; router tests pass

---

### Slice 5 — Recovery of Failing Test Suites

**Required behavior**:
- Restore `security.test.ts`
- Restore `engram.test.ts`
- Restore `router.test.ts`
- No disabled tests; no suppressed errors

**Reference evidence**: REA vitest with project boundaries; REA "do not disable failing tests" principle

**Unknowns**:
- Why tests fail (assertion errors? import errors? runtime errors?)
- Test file contents
- Test dependencies

**Lattice security invariants**: Do not suppress errors or disable tests to obtain passing CI

**Tests**: All 3 test suites pass; no test skipped/disabled

**Acceptance evidence**: `pnpm test` (ucol-node) all suites pass

---

### Slice 6 — Independent Qualification of #547 Hono Consolidation

**Required behavior**:
- Verify hono 4.13.23 compatibility
- Confirm no regressions from hono bump
- Independent review of lockfile changes

**Reference evidence**: WP-C verification results (all checks pass)

**Unknowns**: None (WP-C already verified)

**Lattice security invariants**: No unrelated dependency changes

**Tests**: `pnpm install --frozen-lockfile`; ucol-node tests; typecheck

**Acceptance evidence**: PR #547 CI green; no regressions

---

## Acceptance Criteria (WP-P)

| Criterion | Detail |
|-----------|--------|
| Zero package TypeScript errors | `tsc --noEmit` clean for `packages/ucol-node/` |
| All package test suites pass | `security.test.ts`, `engram.test.ts`, `router.test.ts` all pass |
| Relevant repository-wide regression tests pass | No regressions from ucol-node changes |
| No weakened authorization contracts | C1, fail-closed preserved |
| No broad `any` casts | Type safety maintained |
| No compiler suppression | No `@ts-ignore`, `ts-expect-error` for real errors |
| No disabled tests | All tests enabled and passing |

---

## What Remains Unknown

| Unknown | Impact |
|---------|--------|
| Exact TypeScript error messages (39 errors) | Needed to plan slice 1 and 4 |
| Exact test failure reasons (3 suites) | Needed to plan slice 5 |
| Whether `isTask`/`isMissionSpec` exist or need creation | Needed to plan slice 2 |
| Whether `authenticateRequest` existed or needs creation | Needed to plan slice 3 |
| Store schema type definitions | Needed to plan slice 4 |
| Test file contents and dependencies | Needed to plan slice 5 |

---

## How Lattice Enforces Its Own Security Invariants (UCOL Context)

| Invariant | Application to UCOL |
|-----------|-------------------|
| C1: `role === 'owner'` | Router/auth handlers must check owner role |
| Fail-closed | Validators reject invalid input; no silent acceptance |
| No `any` casts | Type safety through proper type definitions |
| No disabled tests | All 3 failing suites must be restored, not skipped |
| Evidence provenance | UCOL observations should carry source identity (REA TargetIdentity pattern) |