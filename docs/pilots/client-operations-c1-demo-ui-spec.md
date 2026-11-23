# C1 — Protected Demo UI Specification

**Status:** Proposed specification (not implemented). Follows C0.1 hardening.
**Branch:** `feat/client-ops-c0` (PR #526 remains draft; C1 is a separate PR)
**Scope:** Synthetic-only, default-off, owner-authenticated preview UI.
**No:** real customer data, external connectors, outbound messaging, production deployment.

## Purpose

A protected, human-reviewed demo surface for the Client Operations C0
evaluation engine. Demonstrates intake-checklist classification and
review-only follow-up drafts using synthetic fixtures. Precedes any customer
data ingestion; requires threat model and authorization review before C2.

## Security Boundary

| Property | Enforcement |
|----------|-------------|
| Default-off | Feature gate `ENABLE_CLIENT_OPS_DEMO` defaults to `false` |
| Owner authentication | Clerk user identity derived server-side on every request |
| Workspace authorization | `requireWorkspacePermission(workspaceId, 'workspace:read')` via `lib/security/workspaceAccess.ts` |
| Synthetic-only | Fixtures only; no real customer data path exists in C1 |
| No external effects | Follow-up drafts are read-only display; no send/dispatch/mutate |
| No network effects | All computation is local; no outbound HTTP from UI |
| Review-only | Human must explicitly approve before any C2 mutation path |

## Routes (all owner-only, behind flag)

| Path | Purpose | Auth |
|------|---------|------|
| `/demo/client-ops` | Engagement overview (screen 1) | Clerk + workspace read |
| `/demo/client-ops/:engagementId/checklist` | Document checklist (screen 2) | Clerk + workspace read |
| `/demo/client-ops/:engagementId/evidence` | Cited evidence (screen 3) | Clerk + workspace read |
| `/demo/client-ops/:engagementId/uncertainty` | Uncertainty review (screen 4) | Clerk + workspace read |
| `/demo/client-ops/:engagementId/approval` | Follow-up draft approval (screen 5) | Clerk + workspace read |

No public route exists. All routes return 404 when `ENABLE_CLIENT_OPS_DEMO` is unset.

## Screen 1 — Engagement Overview

**Purpose:** Summarize the synthetic engagement and evaluation result at a glance.

**Data sources:** `EvaluationResult` from C0 evaluator (`lib/pilots/clientOps/evaluate`).

**UI elements:**
- Engagement ID, tenant, workspace, checklist version
- Metrics cards: total / received / missing / uncertain / required completeness / mean confidence / evidence spans cited
- Status badge: "Synthetic demo — no customer data"
- Navigation to screens 2–5

**Security:** No PII. All names/numbers are synthetic fixtures.

## Screen 2 — Document Checklist

**Purpose:** Show each checklist item with its determination status.

**Data sources:** `ChecklistDetermination[]` + `EngagementChecklist.items`.

**UI elements:**
- Table: item description | category | required flag | status (received/missing/uncertain) | confidence | match count
- Status color coding: green (received), red (missing), amber (uncertain)
- Required items flagged with asterisk
- Navigation to screen 4 for uncertain items

**Security:** Determinations are derived from keyword matching on synthetic fixtures only.

## Screen 3 — Cited Evidence

**Purpose:** Show which source evidence spans support each received/uncertain determination.

**Data sources:** `EvaluationResult.citedEvidence` (`SourceSpan[]`).

**UI elements:**
- List: evidence ID | source description | char range | SHA-256 content hash
- Each span links back to the checklist item(s) that cite it
- Hash verification note: "SHA-256 digest of source text; tamper detection"

**Security:** SHA-256 hashes are for provenance integrity only, not cryptographic signing.

## Screen 4 — Uncertainty Review

**Purpose:** Surface items that could not be confidently classified, with reasons.

**Data sources:** `ChecklistDetermination[]` filtered to `status === 'uncertain'`.

**UI elements:**
- List of uncertain items with `uncertaintyReason`
- Match count vs required minMatches
- Cited evidence spans for each uncertain item
- "Needs human clarification" flag for each

**Security:** Uncertain items are never auto-resolved; human review required.

## Screen 5 — Follow-Up Draft Approval

**Purpose:** Display the human-review-only follow-up draft; no send capability.

**Data sources:** `ReviewProposal.followUpDraft` (`FollowUpDraft`).

**UI elements:**
- Subject line
- Full body text (read-only display)
- Action items list
- Tone indicator (professional/concise/detailed)
- Generated timestamp
- Explicit notice: "This is a review-only draft. No message has been sent. No external system has been contacted."
- No send button. No dispatch button. No mutate button.
- Optional: "Export draft" (copy-to-clipboard of body text only)

**Security:** The `FollowUpDraft` type has no `send()`, `dispatch()`, or `mutate()` methods. The UI must not add any.

## Non-Goals (explicitly excluded from C1)

- Real customer data ingestion
- External connectors (read or write)
- Outbound email or messaging
- Production deployment
- SOC 2 / compliance claims
- Measured ROI / customer evidence
- Model training or fine-tuning
- Database migrations

## Success Criteria (before C2)

- [ ] All five screens render with synthetic data only
- [ ] Owner authentication enforced on every route (Clerk)
- [ ] Workspace authorization enforced via `workspaceAccess.ts`
- [ ] Feature gate defaults off; no leakage when disabled
- [ ] No send/dispatch/mutate UI elements exist
- [ ] Threat model review completed
- [ ] Authorization review completed
- [ ] C0.1 tests (45/45) continue to pass

## Next Engineering Milestone

After C1 spec review and authorization approval: implement C1 as a separate
default-off PR, then proceed to C2 (read-only connectors with customer
consent, RLS tests) only after C1 security review passes.
