# AP0_GAP_ANALYSIS.md

**AP0 — Reuse / Extend / Replace / Retire** · RFC-0001 §13 P0 · Lattice OS 2027
**Source:** reviewed main @ 80c49ad6c6c01f6f665b839695b6f26135041a54 (2026-11-24); earlier inventory @ 113e7ba6ae9f615c8c8cd3019735f418f5a371da. Selected paths re-read, not exhaustive runtime qualification.
**Status:** Documentation only · no runtime changes

## 1. Decision framework (RFC-0001 §13)

| Decision | Meaning |
|----------|---------|
| **Retain** | Reuse candidate; contract review and qualification still required |
| **Extend** | Existing implementation is a valid foundation; add planes on top without replacing |
| **Replace** | Existing implementation conflicts with RFC boundaries; explicit ADR required |
| **Not established** | No unified implementation identified in reviewed evidence; exhaustive search before build |

Rule from RFC §3: No competing implementation may be introduced without an explicit replacement ADR.

## 2. Component decisions

| RFC plane | Component | File(s) | Decision | Rationale |
|-----------|-----------|---------|----------|-----------|
| Execution | ExecutionRuntime contracts | lib/intelligence/execution/contracts.ts | **Retain** | Provider-neutral 6-op surface; contracts only, no I/O |
| Execution | Runtime resolver | resolveRuntime() in contracts.ts | **Retain** | Pure, deterministic, abstention-capable |
| Decision | Promotion gate | lib/intelligence/decision/replay/promotion.ts | **Retain** | Canary-eligible ≠ activation; explicit evidence gates |
| Decision | Replay/normalize/metrics | lib/intelligence/decision/replay/* | **Extend** | Needed for governed self-improvement (AP7) |
| Capability | Capability manifest | lib/agents/core/capabilityManifest.ts | **Extend** | Weaver-only today; generalize beyond Weaver in AP1 |
| Capability | readEnforcement | lib/context/readEnforcement.ts | **Retain** | Context read policy; not a substitute for delegation/tool admission |
| Workspace | Workspace access | lib/security/workspaceAccess.ts | **Extend** | Roles/perms verified; extend to resource-level ops in AP2 |
| Account compute | VMs + workspaces + CAS RPCs | supabase/migrations/20261113000000*.sql | **Retain + qualify** | Generation CAS + RLS present; live races/identity mapping unqualified; real provider isolation not yet verified |
| Account compute | Guest supervisor | app/api/account/compute/guest/route.ts + DurableGuestSupervisor | **Extend** | Mock provider; qualify real Linux VM before enabling |
| Conversation | Run store | lib/ucol/continuity/runStore.ts | **Extend** | Owner-scoped list reader; inventory existing writers before choosing actor checkpoint storage |
| Durable execution | Trigger.dev agentLoopTask | src/trigger/agentLoopTask.ts | **Retain** | ReAct loop worker; durable orchestration stays on Trigger.dev unless ADR |
| Acquisition | Contracts + EvidenceObjectV1 | lib/acquisition/contracts.ts | **Retain** | Provider-neutral; access promotion conservative |
| Acquisition | Provider implementation + durable ingestion | lib/acquisition/providers/apify/provider.ts; lib/acquisition/durable/ingestion.ts; src/trigger/acquisitionIngestTask.ts | **Retain + extend** | Registered provider and ingestion already present; AP4 adds tenant listener/workflow abstraction |
| Preview | Sandbox adapter | lib/code-builder/sandboxAdapter.ts | **Retain** | Owner-only; default-off; public sharing blocked by #479 |
| Credentials | Credential broker (native + TS) | src-tauri/credential-broker/ + lib/credentials/ | **Retain** | No raw-key readback; opaque refs; keep security boundary |
| Native execution | macOS desktop foundation | docs/architecture/macos-desktop-foundation.md | **Retain** | Evaluation-only; execution disabled pending qualification |
| Research | Verification policy and Lean executor | lib/research/verification/policy.ts; leanAdapter.ts; isolatedLeanExecutor.ts (same directory) | **Retain + qualify** | Present on main; required injected isolated executor, Daytona adapter; live validation pending |

## 3. Unified plane gaps (candidate; confirm before building)

| RFC plane | Resource | Phase | Build vs reuse |
|-----------|----------|-------|----------------|
| Agent Actor | AgentDefinition / AgentRevision store | AP1 | Build new |
| Agent Actor | AgentInstance / AgentSession / mailbox | AP1 | Build new |
| Agent Actor | Delegation policies | AP1 | Build new |
| Workspace Filesystem | Logical resource namespace | AP2 | Build new |
| Workspace Filesystem | Revision + permission APIs | AP2 | Build new |
| Conversation/Approval | Universal approval inbox | AP3 | Extend existing durable approval store; harden authorization |
| Conversation/Approval | Effect receipts | AP3 | Reconcile existing evidence and execution receipts before building |
| Event/Workflow | Listener registry | AP4 | Build new |
| Event/Workflow | Workflow definition format | AP4 | Build new |
| Application Runtime | AppDefinition manifest | AP5 | Build new |
| Application Runtime | Install/preview/export | AP5 | Extend sandbox adapter |
| Multi-agent compute | Compute scheduler | AP6 | Build new |
| Multi-agent compute | Sandbox pool | AP6 | Extend sandbox adapter |
| Self-improvement | Extension candidates + rollback | AP7 | Build new |

## 4. Overlaps to resolve

| Overlap | Components | Resolution |
|---------|------------|------------|
| Workspace access vs workspace:read scope | workspaceAccess.ts grants workspace:read to viewer/member/owner; C1 requires owner-only | C1 uses explicit `role === 'owner'` check (not workspace:read); AP0 records this as a trust-boundary refinement |
| Preview sandbox vs application runtime | Sandbox adapter provisions isolated previews; AP5 needs installable apps | AP5 extends sandbox adapter for install/export; public sharing remains gated by #479 |
| Trigger.dev agent loop vs Agent Actor Plane | agentLoopTask is a durable task, not an actor with mailbox/session | AP1 adds actor identity/mailbox on top; Trigger.dev remains the execution backend unless ADR |
| Account compute VM vs multi-agent compute | One VM per account baseline; AP6 needs many-to-many | AP6 adds scheduler/pool on top; one-VM-per-account remains the baseline entitlement |

## 5. Retire candidates

| Component | Reason | Phase |
|-----------|--------|-------|
| None identified | No retirement identified in sampled inventory; exhaustive overlap review pending | — |

RFC §3 rule: No competing implementation without explicit replacement ADR. No ADR has been proposed to replace any existing component.

## 6. Qualification gaps

| Gap | Current evidence | Required | Phase |
|-----|-----------------|----------|-------|
| Real provider isolation | Mock provider in guest route | Two-connection DB races + real Linux VM isolation | AP0→AP6 |
| Native execution on physical Mac | M0 doc describes requirements; no test records | Physical supported Intel + Apple Silicon tests | AP0→AP6 |
| Public sharing | Blocked by #479 | Independent ingress authorization | Post-AP5 |
| C0/C1 in main | PRs #526/#530 are draft, not merged | Security review + merge decision | Post-AP0 |

The main baseline is 17 commits newer than the original inventory; review the Model Plane and Neural Memory Plane architecture docs, existing unified sessions, Slack/webhook ingestion, CLI promotion and authorization records before creating overlapping stores. No replacement or retirement ADR accepted.

Model and memory RFCs are proposed, not deployed. Preserve their versioned references and scoped evidence semantics. No duplicate session or approval table without ADR.

See [AP0.2 pinned inventory and acceptance evidence](./AP0_ACCEPTANCE_EVIDENCE.md) for enumerated paths, CI diagnosis and proposed ADR ownership. No production qualification inferred.
