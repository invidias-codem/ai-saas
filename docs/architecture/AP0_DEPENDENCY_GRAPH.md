# AP0_DEPENDENCY_GRAPH.md

**AP0 — Infrastructure Dependencies** · RFC-0001 §13 · Lattice OS 2027
**Source:** main @ 113e7ba6 · verified by direct file reads · 2026-11-23
**Status:** Documentation only · no runtime changes

## 1. Dependency ordering (RFC-0001 §13)

```
P0/AP0: Repository evidence and consolidation (this document)
  │
  ├── P1/AP1: Agent Actor Plane — identities, definitions, mailboxes, sessions
  │           Depends on: P0
  │
  ├── P2/AP2: Workspace Filesystem Plane — namespace, revision, permissions
  │           Depends on: P0 + shared identity contracts
  │
  ├── P3/AP3: Conversation/Approval Plane — projections, run linkage, inbox, receipts
  │           Depends on: P1 identity + existing run store; filesystem via P2
  │
  ├── P4/AP4: Event/Workflow Plane — listeners, durable workflows (Trigger.dev)
  │           Depends on: P1 + P3 approval boundaries
  │
  ├── P5/AP5: Application Runtime — manifest, install/preview/export, renderer isolation
  │           Depends on: P2 + P3
  │
  ├── P6/AP6: Multi-agent Compute Fabric — scheduler, sandbox pools
  │           Depends on: P1 + P2 + verified Account Compute/native execution
  │
  └── P7/AP7: Governed Self-Improvement — extensions, evidence gates, rollback
            Depends on: P1–P6 + Decision Plane evidence gates
```

P2 and P3 may proceed in bounded parallel after identity contracts stabilize.
No calendar commitments inferred.

## 2. Existing dependency chains (verified by code)

```
Clerk auth (requireAuth)
  │
  ├── workspaceAccess (getWorkspaceAccess)
  │     │
  │     ├── requireWorkspacePermission → all API routes
  │     │
  │     └── account/compute/guest/route.ts (admission + VM check)
  │
  readEnforcement (lib/context/readEnforcement.ts)
  │
  ├── capabilityManifest (buildCapabilityManifest)
  │     │
  │     └── buildWeaverSystemInstruction → agent system prompt
  │
  └── derivePreparedCapabilityInputs → prepared-path capability inputs

account_compute_vms (SQL: CAS RPCs, RLS, service_role)
  │
  ├── reservation (getAccountVm, claim VM)
  │
  ├── guest/route.ts (admitWorkspace + requireAccountVm)
  │
  └── DurableGuestSupervisor (mock provider; lease TTL/renewal)

Trigger.dev (agentLoopTask)
  │
  ├── runReActLoop (lib/agents/core/reactLoop.ts)
  │
  ├── buildAgenticRuntime (registry + manifest-derived instruction)
  │
  └── getAgenticContext (user/workspace/conversation context)

lib/acquisition/contracts.ts
  │
  ├── AcquisitionProvider (5 ops: supports/start/status/collect/cancel)
  │
  └── EvidenceObjectV1 (normalized evidence, provenance hash)

lib/code-builder/sandboxAdapter.ts
  │
  ├── PreviewManifest (assembled by previewAssembler)
  │
  └── preview_sandboxes table (status, expires_at, sandbox_url)

src-tauri/credential-broker (native)
  │
  └── credential-broker-client.ts (Tauri IPC; opaque refs)
```

## 3. Cross-plane dependencies

| From (consumer) | To (provider) | Type | Evidence |
|-----------------|---------------|------|----------|
| Capability manifest | readEnforcement | Runtime values | lib/agents/core/capabilityManifest.ts:233 |
| Capability manifest | Weaver system instruction | Same manifest gates catalog | capabilityManifest.ts:351 |
| Agent loop task | Capability manifest | buildAgenticRuntime uses manifest | src/trigger/agentLoopTask.ts:47 |
| Guest compute route | Workspace access | admitWorkspace (server-verified membership) | app/api/account/compute/guest/route.ts:106 |
| Guest compute route | Account VM | requireAccountVm (ownership + ready state) | app/api/account/compute/guest/route.ts:112 |
| Sandbox adapter | Preview manifest | makePreviewManifest from build files_json | lib/code-builder/sandboxAdapter.ts:118 |
| Sandbox adapter | Supabase | Build lookup + preview row persistence | lib/code-builder/sandboxAdapter.ts:93,124 |
| Promotion gate | Replay records + diagnostics | evaluatePromotion(input) | lib/intelligence/decision/replay/promotion.ts:105 |
| ExecutionRuntime | Registered adapters | resolveRuntime(requirement, adapters) | lib/intelligence/execution/contracts.ts:143 |

## 4. Missing dependencies (to be built)

| Dependency | Needed by | Phase |
|------------|-----------|-------|
| AgentDefinition / AgentRevision store | Agent instances | AP1 |
| AgentSession checkpoint store | Agent sessions | AP1 |
| Workspace resource namespace + revision API | Filesystem isolation | AP2 |
| Universal approval inbox + receipt store | Human approval | AP3 |
| Listener registry + event subscription | Durable workflows | AP4 |
| Workflow definition format + version migration | Programmable workflows | AP4 |
| Application manifest + install/export | Portable apps | AP5 |
| Multi-agent compute scheduler | Many-to-many allocation | AP6 |
| Governed extension improvement + rollback | Self-improvement | AP7 |

## 5. Circular dependency check

| Potential cycle | Resolution |
|-----------------|------------|
| Workspace access → Account VM → Guest compute → Workspace admission | Linear: auth → workspaceAccess → VM check → guest op. No cycle. |
| Capability manifest → readEnforcement → context plan → manifest | readEnforcement is pure over plan options; manifest is output. No cycle. |
| Trigger.dev agent loop → buildAgenticRuntime → capability manifest → readEnforcement | All linear, no feedback to trigger. |
| Approval inbox ←→ Workflow run | AP3 defines approval boundaries; AP4 consumes them. One-way dependency. |

## 6. Qualification gates before progression

| Gate | Phase | Evidence required |
|------|-------|-------------------|
| Repository inventory complete | AP0 | This document + AP0_CURRENT_STATE/TRUST_BOUNDARIES/GAP_ANALYSIS |
| Trust boundaries traced | AP0 | AP0_TRUST_BOUNDARIES.md |
| Identity contracts stabilize | AP0→AP1 | AgentDefinition/AgentInstance contracts defined |
| Account compute isolation qualified | AP0→AP6 | Two-connection DB races + real provider isolation evidence |
| Native execution qualified | AP0→AP6 | Physical Mac tests (M0 doc: Intel + Apple Silicon macOS 26) |
