# Lattice Systems — Client Operations Pilot Foundation

**Status:** Proposed foundation; not a launched customer product. **Date:** 2026-11-22.
**Owner:** Lattice Systems / Lattice OS.
**Target:** Small and midsize accounting/advisory practices, beginning with Delaware.
**First offer:** Client Operations Automation. Land one controlled, valuable workflow and expand only after verified results.

## Instruction to implementation agent

Build Client Ops C0 as a small, reviewable, synthetic-data-only implementation PR on current main. First audit existing code and reuse the authorization, UCOL, memory, review, and workflow contracts where appropriate. No production deployment, real data ingestion, connector authorization, paid infrastructure or customer outreach in C0. Preserve existing production behavior. Provide actual file references and verification evidence, never unsupported claims.

### Why we are building this

Do not sell a generic chatbot, a superintelligence claim or a model benchmark. Sell a reliable, permission-scoped workflow that reduces repetitive coordination between existing business systems. We complement accounting, productivity and document tools rather than replace them. Data portability, human control and transparent evidence are deliberate product benefits; customer lock-in is not the strategy.

Three long-term business layers:
- Lattice Solutions: implementation, onboarding, support and pilots; customer needs and early revenue.
- Lattice OS: repeatable workspace, authentication, integration, execution, verification, memory and approvals.
- Lattice Intelligence: versioned model training, specialist inference, neural retrieval and compression research. Do not make the custom LLM a blocker for the first pilot.

## Customer discovery / commercial hypothesis

Target economic buyer: firm owner, operations manager, or practice administrator. Daily user: staff coordinating client documents and follow-up.

Pain hypothesis: incoming engagement emails and attachments are manually inspected, compared to requirements, and chased repeatedly. Validate this with interviews; do not assume demand or ROI.

Discovery target: 15–20 firms, three substantive pilot conversations and one agreed pilot. These are goals, not forecasted conversions. Record existing process time, exceptions, software, security requirements, data classification, review authority and who has the budget. Use consent for recordings; do not put real customer details in the public repo.

Proposed 2–4-week bounded pilot: identify intake gaps, prepare evidence-linked follow-ups, get staff approval. Pricing is unvalidated; do not quote hard-coded rates before costing/market feedback.

## First product workflow — Client Operations Agent

1. Ingest a **fictional/synthetic** client message, attachment metadata and engagement checklist.
2. Determine which requested materials are received, missing or uncertain.
3. Link each determination to precise source IDs/spans and a document revision.
4. Prepare an internal task summary and a draft follow-up message.
5. Require human review; never send a message or mutate any client system in C0.
6. Produce a testable event/decision receipt and compare results to staff-labeled expectations.

No automated tax, legal, lending or financial decisions. No external email or record updates. Avoid claims of SOC 2, customer-VPC operation, zero data egress or production readiness unless formally verified.

## Current repo components to audit before coding

- UCOL decision/provider routing: lib/ucol/routing/decision.ts and lib/ucol/routing/providerResolver.ts
- Provider fallback: lib/llm/routing/fallbackRouter.ts
- Existing scope-aware memory: lib/memory/vectorStore.ts and lib/ragMemory.ts
- Engram compression: packages/ucol-node/src/engram/index.ts
- Context Sieve: lib/context/sieve.ts — source/strategy protections and non-destructive context filtering
- Durable-work architecture: docs/architecture/conversation-continuity-and-generation-coordinator.md
- Research provenance/isolated verifier: draft PR #519 — not a production dependency
- Model/memory research architecture: draft PR #522 — documentation only; not required for C0
- Older positioning docs: WIP Ideas 💡/Lattice-Partnership-Strategy.md and WIP Ideas 💡/Lattice-Outreach-Pack.md. Revalidate unqualified or outdated claims before reusing them.

Do not assume unmerged PRs are production capabilities. No new memory database or model-training subsystem for this customer slice.

## Implementation contract: Client Ops C0

Proposed code arrangement; adjust to repository conventions after audit:
- lib/pilots/clientOps/contracts.ts — typed schemas for fictional engagement, checklist, source evidence, confidence/uncertainty, review proposal and metrics.
- lib/pilots/clientOps/evaluate.ts — pure deterministic classification/matching logic with evidence pointers; never invent documents or require a live LLM.
- lib/pilots/clientOps/fixtures/ — fictional engagement requirements, sample messages and expected results; absolutely no real PII, bank details or client records.
- __tests__/contracts/client-ops-foundation.contract.test.ts — happy path, contradictory docs, uncertain evidence, missing docs, tenant mismatch, prompt-injection-as-data, unsafe instructions, oversized inputs, review-only behavior, stable metrics.
- docs/pilots/client-operations-demo-runbook.md — clean-checkout local demo and limitation statements.

Architecture:

Synthetic fixture -> strict schema -> tenant/workspace admission -> evidence-linked checklist matcher -> review-only follow-up proposal -> metrics and receipts -> STOP (no external effects).

Use existing auth/review boundaries where needed, but keep C0 a pure local foundation without public endpoints, migrations, real connector credentials, customer memory ingestion or production flags. The LLM is optional and must never grant its own access or execute outbound messages.

### Explicit C0 acceptance

- TypeScript and targeted tests pass; report exact commands/results and any skipped checks.
- Outputs either cite fixture evidence identifiers or are labeled missing/uncertain; no hallucinated received documents.
- Identity and workspace scopes are explicit and cross-tenant fixture access is denied.
- Review proposal has no route to external dispatch in C0.
- Malformed/oversize inputs are rejected; untrusted document text is never interpreted as tool instructions.
- At least one deterministic end-to-end demo from synthetic inputs to a review proposal and metrics report.
- Metrics present only measured values or clearly marked manual placeholders; no invented time-savings.
- No production routes, paid resources, migrations, model weights or actual customer information changed.
- PR is draft; no auto-merges. Document limitations and follow-on gates.

## Subsequent slices — do NOT implement in C0

**C1 Preview pilot:** protected, human-reviewed demo UI using synthetic data; threat model and authorization review before any customer data.
**C2 Read-only connectors:** explicit customer consent, narrowly scoped credentials, source revisions, tenant RLS tests, retention/deletion controls. Security review required.
**C3 Approved mutations:** durable idempotent jobs, outbox/retry fencing, auditable human approval before outbound emails or source updates.
**C4 Commercial operations:** support/onboarding/offboarding, DPA review, incident response, service boundaries and outcome measurement.
**C5 Repeatability:** customer evidence, reusable integration packages, pricing grounded in cost/value, partner/SDK distribution if warranted.

**Parallel track:** PR #522 custom model and neural memory research. Use Lattice-trained models only when evaluated and eligible; do not export private pilot data to shared model training without affirmative rights and consent.

## Agent reporting requirements

Return a draft PR with: audited file:line references, explanation of reused components, exact tests/build results, tenant/injection/side-effect threat boundary, local demo output, limitations and next approval gates. Do not claim C1–C5 are shipped and do not enable production behavior.

## Success criteria for the first real pilot (later, after authorization)

Compare staff-approved ground truth to output: document detection precision/recall, source citation correctness, review/edit frequency, time per engagement, cost per case, errors, unauthorized actions, and customer satisfaction. Safety gates are no unauthorized external actions and no cross-tenant data leakage. Neither measurable ROI nor customer demand is established by this document.
