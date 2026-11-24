# AP0_IMPLEMENTATION_PLAN.md

**AP0 — Implementation Plan** · RFC-0001 §13 P0 · Lattice OS 2027
**Source:** main @ 113e7ba6 · verified by direct file reads · 2026-11-23
**Status:** Documentation only · bounded slices + acceptance criteria · no calendar commitments

## 1. AP0 deliverables (this phase)

| Deliverable | File | Status |
|-------------|------|--------|
| Current state inventory | docs/architecture/AP0_CURRENT_STATE.md | Complete |
| Resource model mapping | docs/architecture/AP0_RESOURCE_MODEL.md | Complete |
| Trust boundaries matrix | docs/architecture/AP0_TRUST_BOUNDARIES.md | Complete |
| Dependency graph | docs/architecture/AP0_DEPENDENCY_GRAPH.md | Complete |
| Gap analysis (reuse/extend/replace/retire) | docs/architecture/AP0_GAP_ANALYSIS.md | Complete |
| Implementation plan (this document) | docs/architecture/AP0_IMPLEMENTATION_PLAN.md | Complete |

AP0 requires no runtime code. It is evidence and decision capture only.

## 2. Phase plan (dependency-ordered)

| Phase | Name | Depends on | Scope | Exit criteria |
|-------|------|------------|-------|---------------|
| P0/AP0 | Repository evidence and consolidation | — | Inventory, trust boundaries, dependency graph, gap analysis, this plan | All 6 AP0 documents complete; RFC-0001 architecture reviewed by maintainers |
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
|-------|-------------|---------------------|
| AP1.1 | AgentDefinition store | Immutable versioned definitions; capability refs; limits; extension references; CRUD with versioning |
| AP1.2 | AgentInstance | Durable identity pinned to approved revision; lifecycle registered→idle→active→waiting→idle; suspended/retired deny new work |
| AP1.3 | Mailbox | Durable message acceptance with idempotency keys; at-most-one writer via generation fencing + checkpoint CAS; duplicate delivery expected (no exactly-once claim) |
| AP1.4 | AgentSession | Checkpointed private execution context independent of conversation; persist checkpoints before ack; crash reconciliation; poison message quarantine |
| AP1.5 | Delegation policies | Agent authority cannot exceed delegated permissions; cannot self-grant capabilities; cannot modify enforcement; cannot select own trusted evaluator |

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

## 6. Open ADRs (owners + acceptance criteria to be assigned in AP0)

| ADR | Decision needed |
|-----|-----------------|
| Actor persistence/backend and mailbox semantics | Which backend; generation fencing; checkpoint CAS |
| Canonical identity and resource scope mapping | Map existing IDs/tables to RFC resource model |
| Filesystem consistency/storage | Logical namespace vs POSIX; object-backed revision API |
| Workflow definition format and version migration | Graph vs code-defined; revision pinning |
| Approval policy and external-effect reconciliation | Atomic consumption; ambiguous outcome handling |
| App packaging and renderer trust | Manifest format; CSP/network constraints |
| Placement/cost model | Tenant/task-level bounds; spend admission |
| Tenant deletion/export | Data retention; source export |

## 7. What is explicitly NOT in scope

- No production activation (RFC §16: acceptance authorizes planning, not activation)
- No real customer data or regulated production use
- No competing implementation without explicit replacement ADR
- No calendar commitments inferred from dependency order
- No vendor adoption assumption (Trigger.dev retained unless ADR demonstrates superior alternative)
- No public sharing until #479 or verified successor
