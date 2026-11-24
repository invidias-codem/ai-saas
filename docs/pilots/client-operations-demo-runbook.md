# Client Operations C0 — Local Demo Runbook

**Status:** Synthetic-only foundation slice. No production routes, no external effects.
**Date:** 2026-11-22
**Branch:** `feat/client-ops-c0`

## Purpose

This runbook demonstrates the Client Operations C0 evaluation engine running
against purely synthetic/fictional data. It produces:
- Checklist determinations (received/missing/uncertain) with evidence citations
- Aggregate metrics (no invented ROI or time-savings)
- A human-review-only follow-up draft (never sent automatically)

## Prerequisites

```bash
# From repository root
cd /Users/jjem/Projects/ai-saas

# Install dependencies (if not already done)
pnpm install

# Verify TypeScript compiles
pnpm tsc --noEmit --skipLibCheck
```

## Quick Start — Single Command Demo

```bash
# Run the committed synthetic demo entrypoint
pnpm tsx lib/pilots/clientOps/demo.ts
```

Or run the contract tests which include the demo:

```bash
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts --verbose
```

## Manual Demo — Step by Step

### 1. Run the committed demo entrypoint

The demo is committed at `lib/pilots/clientOps/demo.ts`. Run it from the repository root:

```bash
pnpm tsx lib/pilots/clientOps/demo.ts
```

It imports `evaluateAndPropose` from `lib/pilots/clientOps/evaluate` and the synthetic
fixtures from `lib/pilots/clientOps/fixtures`, then prints a human-readable report.

Expected output (counts match the contract tests):

```
METRICS:
  Total items:           15
  Received:              11
  Missing:               4
  Uncertain:             0
  Required completeness: 60.0%
  Mean confidence:       84.3%
  Evidence spans cited:  10
```

### 2. Expected determination summary

| Item | Status | Required |
|------|--------|----------|
| drivers_license | received | yes |
| ssn | missing | yes |
| w2 | received | yes |
| 1099 | received | no |
| self_employment | received | no |
| mortgage | received | no |
| property_tax | received | no |
| charitable | received | no |
| medical | received | no |
| education | received | no |
| dependent_care | received | no |
| healthcare_coverage | received | yes |
| bank_accounts | missing | yes |
| prior_year_return | missing | no |
| estimated_payments | missing | no |

## Running Contract Tests

```bash
# Run all C0 contract tests
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts

# Run with coverage
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts --coverage

# Run specific test suites
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts -t "Happy Path"
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts -t "Tenant Mismatch"
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts -t "Prompt Injection"
```

## Security Boundary Verification

The tests verify these security properties:

| Property | Test | Expected |
|----------|------|----------|
| Cross-tenant denial | `Tenant Mismatch` suite | `TENANT_MISMATCH` error |
| Workspace mismatch | `Tenant Mismatch` suite | `WORKSPACE_MISMATCH` error |
| Instruction injection rejection | `Prompt Injection` suite | `UNTRUSTED_INSTRUCTION_DETECTED` |
| Oversized input rejection | `Oversized Inputs` suite | `OVERSIZED_INPUT` error |
| Malformed input rejection | `Malformed Inputs` suite | `MALFORMED_INPUT` error |
| No external effects | `Review-Only Behavior` suite | No send/dispatch methods |

## Limitations (C0 Scope)

| Limitation | Status | Follow-on |
|------------|--------|-----------|
| No public API route | Intentional | C1: Protected demo UI |
| No real document ingestion | Intentional | C2: Read-only connectors |
| No customer data | Intentional | C2: Customer consent + RLS |
| No outbound email/mutation | Intentional | C3: Approved mutations |
| No production deployment | Intentional | C4: Commercial operations |
| No SOC 2 / compliance claims | Not verified | C4: DPA review |
| No measured ROI | Not measured | C5: Customer evidence |

## Architecture Notes

### Reused Components

| Component | File | Purpose |
|-----------|------|---------|
| Workspace authorization | `lib/security/workspaceAccess.ts` | Tenant/workspace scope validation |
| Context Sieve | `lib/context/sieve.ts` | Evidence filtering patterns (adapted) |
| UCOL contracts | `lib/ucol/routing/types.ts` | Request/decision type patterns |
| Vector store | `lib/memory/vectorStore.ts` | Evidence ID / hash patterns |

### New Components (C0 Only)

| Component | File | Purpose |
|-----------|------|---------|
| Contracts | `lib/pilots/clientOps/contracts.ts` | Pure typed schemas |
| Evaluation engine | `lib/pilots/clientOps/evaluate.ts` | Deterministic classification |
| Fixtures | `lib/pilots/clientOps/fixtures/index.ts` | Synthetic test data |
| Demo entrypoint | `lib/pilots/clientOps/demo.ts` | Runnable synthetic demo |
| Contract tests | `__tests__/contracts/client-ops-foundation.contract.test.ts` | Verification suite |

### Data Flow (C0)

```
Synthetic Fixture → Strict Schema → Tenant/Workspace Admission
                                    ↓
                        Evidence-Linked Checklist Matcher
                                    ↓
                        Review-Only Follow-Up Proposal
                                    ↓
                        Metrics & Receipts → STOP
```

## Troubleshooting

### TypeScript Errors

```bash
# Full project typecheck
pnpm tsc --noEmit --skipLibCheck
```

### Test Failures

```bash
# Re-run with full output
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts --verbose 2>&1 | less
```

## Next Steps (After C0)

1. **C1** — Protected demo UI with synthetic data, threat model review
2. **C2** — Read-only connectors with customer consent, RLS tests
3. **C3** — Approved mutations with durable jobs, human approval gates
4. **C4** — Commercial operations (DPA, incident response, SLAs)
5. **C5** — Repeatability packages, pricing grounded in cost/value

---

**Reminder:** This is a synthetic-only foundation. No production behavior is changed.
No customer data is processed. No external systems are called.
