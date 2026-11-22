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
# Run the synthetic evaluation and produce a review proposal
pnpm tsx --test lib/pilots/clientOps/evaluate.ts 2>&1 | head -100
```

Or run the contract tests which include the demo:

```bash
pnpm test __tests__/contracts/client-ops-foundation.contract.test.ts --verbose
```

## Manual Demo — Step by Step

### 1. Create a Demo Script

Create a temporary file `demo-client-ops.ts`:

```typescript
// demo-client-ops.ts
import {
  evaluateAndPropose,
  SYNTHETIC_TENANT_ID,
  SYNTHETIC_WORKSPACE_ID,
  SYNTHETIC_ENGAGEMENT_ID,
  SYNTHETIC_USER_ID,
  SYNTHETIC_CHECKLIST,
  SYNTHETIC_CLIENT_MESSAGE,
  SYNTHETIC_ATTACHMENTS,
} from './lib/pilots/clientOps/fixtures';

console.log('═══════════════════════════════════════════════════════════════');
console.log('CLIENT OPERATIONS C0 — SYNTHETIC DEMO');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Tenant:', SYNTHETIC_TENANT_ID);
console.log('Workspace:', SYNTHETIC_WORKSPACE_ID);
console.log('Engagement:', SYNTHETIC_ENGAGEMENT_ID);
console.log('Checklist version:', SYNTHETIC_CHECKLIST.version);
console.log('Checklist items:', SYNTHETIC_CHECKLIST.items.length);
console.log('Attachments:', SYNTHETIC_ATTACHMENTS.length);
console.log('');

const { result, proposal } = evaluateAndPropose({
  clientMessage: SYNTHETIC_CLIENT_MESSAGE,
  attachments: SYNTHETIC_ATTACHMENTS,
  checklist: SYNTHETIC_CHECKLIST,
  context: {
    tenantId: SYNTHETIC_TENANT_ID,
    workspaceId: SYNTHETIC_WORKSPACE_ID,
    userId: SYNTHETIC_USER_ID,
  },
}, 'professional');

console.log('═══════════════════════════════════════════════════════════════');
console.log('EVALUATION RESULT');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('Evaluated at:', result.evaluatedAt);
console.log('Evaluator version:', result.evaluatorVersion);
console.log('');
console.log('METRICS:');
console.log('  Total items:          ', result.metrics.totalItems);
console.log('  Received:             ', result.metrics.receivedCount);
console.log('  Missing:              ', result.metrics.missingCount);
console.log('  Uncertain:            ', result.metrics.uncertainCount);
console.log('  Required completeness:', (result.metrics.requiredCompleteness * 100).toFixed(1) + '%');
console.log('  Mean confidence:      ', (result.metrics.meanConfidence * 100).toFixed(1) + '%');
console.log('  Evidence spans cited: ', result.metrics.evidenceSpanCount);
console.log('');

console.log('DETERMINATIONS:');
for (const d of result.determinations) {
  const item = SYNTHETIC_CHECKLIST.items.find(i => i.id === d.itemId);
  const req = item?.required ? ' [REQUIRED]' : '';
  console.log(`  ${d.status.toUpperCase().padEnd(10)} ${d.itemId}${req}`);
  console.log(`    Confidence: ${(d.confidence * 100).toFixed(0)}% | Evidence: ${d.evidenceIds.length} | Matches: ${d.matchCount ?? 0}`);
  if (d.uncertaintyReason) console.log(`    Note: ${d.uncertaintyReason}`);
}
console.log('');

console.log('CITED EVIDENCE SPANS:');
for (const span of result.citedEvidence) {
  console.log(`  ${span.evidenceId}: ${span.description} (${span.charEnd - span.charStart} chars)`);
}
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('REVIEW PROPOSAL (HUMAN-ONLY, NEVER SENT AUTOMATICALLY)');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('SUMMARY:');
console.log(proposal.summary);
console.log('');
console.log('FOLLOW-UP DRAFT:');
console.log('  Subject:', proposal.followUpDraft.subject);
console.log('  Tone:', proposal.followUpDraft.tone);
console.log('  Action items:', proposal.followUpDraft.actionItems.length);
console.log('');
console.log('  BODY PREVIEW:');
console.log(proposal.followUpDraft.body.substring(0, 500) + '...');
console.log('');
console.log('REQUIRES HUMAN VERIFICATION:', proposal.requiresHumanVerification.length, 'items');
console.log('FLAGGED FOR REVIEW:', proposal.flaggedForReview.length, 'items');
console.log('');

console.log('═══════════════════════════════════════════════════════════════');
console.log('DEMO COMPLETE — NO EXTERNAL EFFECTS');
console.log('═══════════════════════════════════════════════════════════════');
```

### 2. Run the Demo

```bash
pnpm tsx demo-client-ops.ts
```

### 3. Expected Output

```
════════════════════════════════════════════════════════════════
CLIENT OPERATIONS C0 — SYNTHETIC DEMO
════════════════════════════════════════════════════════════════
Tenant: tenant_synth_acme_advisory_001
Workspace: ws_synth_acme_advisory_main
Engagement: eng_synth_2026_q4_tax_prep_001
Checklist version: 2026.4.0
Checklist items: 15
Attachments: 10

EVALUATION RESULT
METRICS:
  Total items:           15
  Received:              8
  Missing:               5
  Uncertain:             2
  Required completeness: 62.5%
  Mean confidence:       64%
  Evidence spans cited:  10

DETERMINATIONS:
  RECEIVED    item_identity_drivers_license [REQUIRED]
    Confidence: 65% | Evidence: 1 | Matches: 1
  UNCERTAIN   item_identity_ssn [REQUIRED]
    Confidence: 40% | Evidence: 1 | Matches: 1
    Note: Only 1 of 1 required keyword matches found
  RECEIVED    item_income_w2 [REQUIRED]
    Confidence: 80% | Evidence: 2 | Matches: 2
  ...
```

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

### Demo Script Not Found

Ensure you're running from the repository root:
```bash
cd /Users/jjem/Projects/ai-saas
pnpm tsx demo-client-ops.ts
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