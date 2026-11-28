# Correction-derived rules — review-gated pattern evidence (foundation slice)

## Decision

A successful fix to one file needs one confirmation to remain a **local fix**.
A reusable coding rule requires **two verified file-level occurrences of the same
canonical error-and-correction pattern**, regardless of whether they happened
in one session, on one calendar day, or in separate tasks.

For example, fixing the same regex anchoring error in **auth.ts** and **webhook.ts**
on November 5 counts as **two confirmations**. The outcome is a **proposed
rule**, not an automatically activated instruction.

## State machine

- **observing** — one verified occurrence; no global or workspace rule.
- **proposed** — at least two distinct verified (changeId, filePath) occurrences.
- **approved** — an explicitly identified reviewer accepted a proposed rule.
- **rejected** — an explicitly identified reviewer rejected it.
- Both reviewed states are closed; a future revision needs a new proposal/version.
- The evaluator does **not** write to the instruction store, bypass review, or
  imply that an approved rule is already published.

## Evidence and deduplication

- Every occurrence has a stable event ID, trusted scope ID, canonical pattern ID,
  repo-relative file path, change/patch ID, ISO timestamp, verified flag and
  optional independent validation-run ID.
- An identical event ID or repeated (changeId, filePath) is a replay, not
  another confirmation.
- Two different files in the same change **count twice** toward proposing a
  rule, but count as **one independent validation** if they share a validation ID.
  Show both measures during review; do not claim separate corroboration.
- Calendar-day and session boundaries do not affect counts.
- A fix not confirmed successful is not counted.
- Near-duplicate messages/files can share a pattern only **after a trusted
  classifier or reviewer assigns the same canonicalPatternId**. Raw string
  similarity does not auto-merge patterns and must not cross tenant/workspace
  scope boundaries.
- Never store credentials, entire file contents, or raw secret-bearing diffs as
  evidence. Link to a redacted change and verification result instead.

## Integration contract

**lib/ucol/correctionPatterns.ts** provides pure functions for:

1. **recordCorrection(previous, evidence, draftRule)**: append validated evidence,
   enforce idempotency, and advance to proposed after two confirmations.
2. **assessCorrectionRule(candidate)**: expose occurrence and independent
   validation counts.
3. **reviewCorrectionRule(candidate, reviewerId, decision, reviewedAt)**: record a
   review decision, **without** publishing or activating the rule.

This is a **foundation patch only**. It does not yet subscribe to editor/agent
patch events or persist the returned candidates, so it does not automatically
learn in production. The next integration slice must provide a durable,
transactional, tenant-isolated evidence store, trusted verification/classification,
and an authenticated review API. The eventual instruction publisher must require
approved state and enforce tenant/workspace rule scope before any injection.
Concurrent writes need a uniqueness constraint on event IDs and
(scopeId, canonicalPatternId, changeId, filePath) to preserve the same logic
across workers.

The existing **lib/ucol/proceduralMemory.ts** macro promotion (successful tool
sequences) is intentionally **not** modified. A successful tool call alone does
not establish that a coding correction should become a reusable instruction.

## Regression tests

**__tests__/ucol/correctionPatterns.test.ts** covers same-day two-file fixes,
different changes in one file, same-patch replays, unverified fixes, tenant and
pattern isolation, path normalization, review-only promotion, rejection and
independent validation counts.

Run with: **pnpm test -- __tests__/ucol/correctionPatterns.test.ts --runInBand**
