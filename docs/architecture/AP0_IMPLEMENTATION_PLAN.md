# AP0_IMPLEMENTATION_PLAN.md

**AP0 — Implementation Plan** · RFC-0001 §13 P0 · Lattice OS 2027
**Source:** reviewed main @ 80c49ad6c6c01f6f665b839695b6f26135041a54 (2026-11-24); earlier inventory @ 113e7ba6ae9f615c8c8cd3019735f418f5a371da. Selected paths re-read, not exhaustive runtime qualification.
**Status:** Documentation only · bounded slices + acceptance criteria · no calendar commitments

## 1. AP0 deliverables (this phase)

| Deliverable | File | Status |
|-------------|------|--------|
| Current state inventory | docs/architecture/AP0_CURRENT_STATE.md | Draft present; review pending |
| Resource model mapping | docs/architecture/AP0_RESOURCE_MODEL.md | Draft present; review pending |
| Trust boundaries matrix | docs/architecture/AP0_TRUST_BOUNDARIES.md | Draft present; review pending |
| Dependency graph | docs/architecture/AP0_DEPENDENCY_GRAPH.md | Draft present; review pending |
| Gap analysis (reuse/extend/replace/retire) | docs/architecture/AP0_GAP_ANALYSIS.md | Draft present; review pending |
| Implementation plan (this document) | docs/architecture/AP0_IMPLEMENTATION_PLAN.md | Draft present; review pending |

AP0 requires no runtime code. Six documents exist; sampled re-review does not establish AP0 exit or production qualification.

## 2. Phase plan (dependency-ordered)

| Phase | Name | Depends on | Scope | Exit criteria |
|-------|------|------------|-------|---------------|
| P0/AP0 | Repository evidence and consolidation | — | Inventory, trust boundaries, dependency graph, gap analysis, this plan | All six reviewed; exhaustive inventory reconciled; RFC #532 accepted and AP0 #533 approved |
| P1/AP1 | Agent Actor Plane | P0 | Persistent agent identities, definitions, mailboxes, sessions, delegation policies | AgentDefinition/AgentRevision store; AgentInstance pinned to revision; mailbox with idempotency keys; generation-fenced state transitions; no autonomous extensions |
| P2/AP2 | Workspace Filesystem Plane | P0 + identity contracts | Logical resource namespace, revision and permission APIs | Logical paths (agents/, apps/, documents/, etc.); object-backed revision API; per-operation auth (list/read/write/rename/share/delete); path traversal denial; cross-tenant object ID denial |
| P3/AP3 | Conversation and Approval Plane | P1 + existing run store; P2 filesystem | Conversation projections, run linkage, approval inbox, receipts | Universal inbox projects approvals/questions/exceptions; approval binds principal/tenant/workspace/action/revision/hash/limits/expiry/nonce; atomic consumption; denial/expiry/cancellation/revocation first-class; receipt store for external side effects |
| P4/AP4 | Event and Workflow Plane | P1 + P3 | Listeners, durable workflows (Trigger.dev) | Tenant-scoped versioned listeners; webhook/polling/scheduled adapters; signature verification; replay rejection; deduplication; dead-letter handling; code-defined versioned workflows with checkpoints and human gates |
| P5/AP5 | Application Runtime Plane | P2 + P3 | App manifest, install/preview/export, renderer isolation | Versioned app manifest; private install/preview/export; generated code untrusted + isolated; preview not publication; source export + rollback |
| P6/AP6 | Multi-agent Compute Fabric | P1 + P2 + verified Account Compute/native execution | Compute scheduler, sandbox pools | Many-to-many agent/computer allocation; qualified multi-tenant compute; real provider isolation evidence |
| P7/AP7 | Governed Self-Improvement | P1–P6 + Decision Plane | Extension candidates, evidence gates, rollback | Immutable extension candidates; Decision Plane evaluation with signed provenance; holdout tests; canary limits; human approval where required; rollback; no self-modification of security policy |

P2 and P3 may proceed in bounded parallel after identity contracts stabilize.

## 3. AP1 slice plan (first implementation phase)

| Slice | Deliverable | Acceptance criteria |
|---|---|---|
| AP1.0 | Identity/scope/delegation ADR and pure contracts | Trusted principal, account/workspace/DB mapping, grants, expiry, revocation, policy intersection; no schema/runtime changes |
| AP1.1 | Versioned agent definitions | Immutable approved revisions, capabilities, limits, provenance |
| AP1.2 | Agent instance and enforceable admission | Pin revision, recheck delegation and current scope, deny inactive/revoked actors |
| AP1.3 | Durable mailbox | Idempotency, fenced writer, bounded retries, poison quarantine |
| AP1.4 | Session/checkpoint | Separate from conversation, checkpoint CAS before ack, recovery and stale-writer rejection |
| AP1.5 | Inert integration and qualification | Trigger adapter, synthetic tests, concurrency and denial evidence; default-off, no approval-gated effects before AP3 |

## 4. Acceptance gates (every phase, RFC §14)

| Gate | Requirement |
|------|-------------|
| Contract inventory | Every phase documents contracts it touches |
| Threat model | Cross-tenant access, revoked membership, stale lease replay, duplicate events, crash recovery, cancellation races, path escapes, approval replay, secret leakage, quota exhaustion |
| Migration/backfill/rollback plan | Required for any schema change |
| Unit/contract tests | Negative tests for each denial property |
| Integration evidence | Real isolated provider environments; disposable PostgreSQL + independent connections for locking/fencing tests |
| Review | Maintainer review of boundaries |
| Explicit enablement decision | Default-off feature gate; staged rollout; kill switch |
| Records | Tested commit, environment, exact commands, results, unresolved limitations |

## 5. First end-to-end pilot (RFC §14)

**Scenario:** synthetic accounting engagement

```
Client documents received
  → Authorized workspace ingestion
  → Listener detects new documents
  → Durable workflow initiated
  → Weaver delegates work
  → Specialized accounting review agent
  → Agent executes analysis (isolated compute, scoped permissions)
  → Review application generated (private, versioned workspace artifact)
  → Professional reviews exceptions (human approval inbox)
  → Engagement completed (auditable receipt + exportable results)
```

**Acceptance evidence:**
- Disconnect/reconnect without data loss
- Retry without duplicate external effects
- Tenant isolation (cross-tenant denial)
- Evidence trace (SHA-256 provenance hashes)
- User-owned source export
- **No real client data or regulated production use** until separate privacy/compliance and security gates pass

**Metrics to baseline before SLOs:** completion rate, review time, cost per engagement, duplicate effects, recovery success, denied-access coverage.

## 6. Open ADRs (proposed ownership roles; maintainer assignment pending)

| ADR | Decision needed / proposed responsible role |
|-----|-----------------|
| Actor persistence/backend and mailbox semantics | Which backend; generation fencing; checkpoint CAS — Runtime |
| Canonical identity and resource scope mapping | Map existing IDs/tables to RFC resource model — Security + Data |
| Filesystem consistency/storage | Logical namespace vs POSIX; object-backed revision API — Storage |
| Workflow definition format and version migration | Graph vs code-defined; revision pinning — Workflow |
| Approval policy and external-effect reconciliation | Atomic consumption; ambiguous outcome handling — Security |
| App packaging and renderer trust | Manifest format; CSP/network constraints — Application Runtime |
| Placement/cost model | Tenant/task-level bounds; spend admission — Compute |
| Tenant deletion/export | Data retention; source export — Data Governance |

## 7. What is explicitly NOT in scope

- No production activation (RFC §16: acceptance authorizes planning, not activation)
- No real customer data or regulated production use
- No competing implementation without explicit replacement ADR
- No calendar commitments inferred from dependency order
- No vendor adoption assumption (Trigger.dev retained unless ADR demonstrates superior alternative)
- No public sharing until #479 or verified successor

## 8. AP0 exit checklist

- [x] Six draft artifacts exist; RFC source reopened; key PRs reconciled.
- [x] Selected source re-read on full pinned main SHA and material discrepancies corrected.
- [x] Complete recursive Git tree enumeration and model/memory/session/approval overlap review.
- [ ] Finish semantic route/auth/flag/test matrix and actual migration verification.
- [x] Confirm current base and diagnose prior-head CI failures.
- [ ] Verify fresh-head CI; obtain maintainer approval of RFC #532 then AP0 #533.
- [x] Proposed ADR roles and acceptance evidence recorded.
- [ ] Assign actual owners and approve AP1.0 criteria before code.
- [ ] Existing live DB/provider/device qualifications tracked separately; required before enabling affected execution paths.

AP1.0 acceptance: pure contract tests for foreign workspace, forged principal, insufficient delegation, expiry/revocation and disabled flags; no runtime integration, migration, external calls or production changes. Existing application/agent behavior must remain unchanged. Do not start active actor execution before AP1 admission and qualification.


See [AP0.2 pinned inventory and acceptance evidence](./AP0_ACCEPTANCE_EVIDENCE.md) for enumerated paths, CI diagnosis and proposed ADR ownership. No production qualification inferred.

## AP0.3 operational milestone

- [AP0_AUTHORITY_MATRIX.md](./AP0_AUTHORITY_MATRIX.md)
- [AP0_STATE_OWNERSHIP.md](./AP0_STATE_OWNERSHIP.md)
- [AP0_QUALIFICATION_MATRIX.md](./AP0_QUALIFICATION_MATRIX.md)
- [AP0_FAILURE_MODEL.md](./AP0_FAILURE_MODEL.md)
- [AP0_COST_MODEL.md](./AP0_COST_MODEL.md)
- [AP0_SYSTEM_ACCEPTANCE.md](./AP0_SYSTEM_ACCEPTANCE.md)
- [AP0_SOURCE_AUDIT.md](./AP0_SOURCE_AUDIT.md)

These proposed specifications are committed for review, not accepted runtime controls. Bounded semantic audit advances AP0 but does not close remaining source coverage or migration verification. F-01–F-03 are separately scoped security remediation candidates; no active actor integration until applicable fixes and qualification pass. Prior AP0.2 head dd7281e2 passed 187 suites/1,759 tests (156 skipped), 14 check runs successful, one skipped and PR Agent failed credential preflight; new head requires fresh CI. RFC #532 and AP0 #533 remain unapproved. AP1.0 starts only after AP0 acceptance.


## AP0.4 semantic audit progress

See AP0_SOURCE_AUDIT.md pass 2: 44/186 route files have bounded source review, 142 remain; five migration sources re-read, not applied. F-06–F-11 added to prior findings. Existing security hardening must be separately reviewed; full transitive method/test/flag/SQL audit and disposable verification remain open. No runtime changes or activation.


## AP0.4 pass 3 — parallel remediation

60/186 route files bounded source-reviewed, 126 outstanding. F-12–F-17 recorded. S1 security draft #534 against main independently addresses F-01/F-02/F-06; tests authored, CI and review pending. Urgent Telegram and payment authenticity candidates require separate remediation review. AP0 not accepted; no persistent actor activation.


## AP0.4 pass 4

78/186 bounded route reviews; F-18–F-23 recorded. S1 #534 regression suite passes but dedicated security TypeScript and PR Agent checks fail. S2A #535 and S7A #536 are separate draft mitigation candidates; tests authored, CI/review and runtime qualification pending. S8 source trace only; verify deployed financial RPCs before changing ledger. No activation.
