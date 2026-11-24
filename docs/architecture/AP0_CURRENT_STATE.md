# AP0_CURRENT_STATE.md

**AP0 — Infrastructure Inventory** · RFC-0001 · Lattice OS 2027
**Source:** reviewed main @ 80c49ad6c6c01f6f665b839695b6f26135041a54 (2026-11-24); earlier inventory @ 113e7ba6ae9f615c8c8cd3019735f418f5a371da. Selected paths re-read, not exhaustive runtime qualification.
**Status:** Documentation only · no runtime changes

## 1. Repository baseline

| Item | Value |
|------|-------|
| Main SHA (PR #533 base) | 80c49ad6c6c01f6f665b839695b6f26135041a54 |
| RFC baseline SHA | 80c49ad6 (referenced in RFC-0001 §3) |
| RFC PR | #532 (docs/rfc-0001-agent-native-operating-environment, draft) |
| Related open PRs | #526 (C0 foundation), #530 (C1 demo) |
| Baseline delta | Main is 17 commits ahead of 113e7ba6 (GitHub compare), including Research Plane and architecture docs. |
| Inventory coverage | Selected paths only; full route/migration/flag coverage requires checkout-based enumeration. |

## 2. API routes (app/api/)

| Route | Purpose | Auth | Feature flag |
|-------|---------|------|-------------|
| app/api/account/compute/guest/route.ts | Guest workspace supervisor (create/start/suspend/destroy/health/inspect) | Clerk + workspace admission + account VM | ENABLE_ACCOUNT_COMPUTE + LIFECYCLE + GUEST_RUNTIME + real provider |
| app/api/code-builder/build/route.ts | Code Builder build initiation | — | — |
| app/api/code-builder/build/[buildId]/route.ts | Build status | — | — |
| app/api/code-builder/stream/route.ts | Build stream | — | — |
| app/api/preview/* (sandbox, share) | Preview sandbox provisioning/share | Owner-only | ENABLE_PREVIEW_SANDBOX |
| app/api/conversations/[id]/runs/route.ts | Conversation run list | — | — |
| app/api/v1/* | Metrics, tasks, memory, MCP, docs, query, webhooks, health, stream | varies | varies |
| app/api/memory/* | Memory CRUD (episodic, preferences, scope, backfill, sync, list, delete, extend, feedback, CLI) | — | — |
| app/api/settings/* | Partner keys, digest, keys, claim | — | — |

Selected route table; full path index contains 186 routes. A dash means not reviewed, not unauthenticated. Conversation run listing is owner-scoped in runStore.ts.

## 3. Database migrations (supabase/migrations/)

| Migration | Purpose | Disposition |
|-----------|---------|-------------|
| 20261113000000_account_compute_vms.sql | Account VM reservation + workspaces + generation CAS RPCs + RLS | Retain; qualify real isolation |
| 20261113000001_account_compute_guest_leases.sql | Guest execution leases | Retain; qualify |
| 20261109000000_conversation_continuity.sql | Conversation continuity / run store | Retain; extend |
| 20261108000000_preview_sandboxes.sql | Preview sandbox rows | Retain; owner-only previews |
| 20261108000001_preview_shares.sql | Preview shares | Subject to #479 |
| 20261108000002_unified_sessions.sql | Unified sessions | — |
| 20261018000000_acquisition_rls.sql | Acquisition RLS | — |
| 20261019000000_acquisition_evidence.sql | Acquisition evidence | — |
| 15+ earlier migrations | VDI fleet, alerts, remediation, video artifacts, budget | VDI plane closed 2026-10-14 |

## 4. Feature flags

| Flag | File | Default | Notes |
|------|------|---------|-------|
| ENABLE_ACCOUNT_COMPUTE | lib/intelligence/execution/accountCompute/reservation.ts | false (=== 'true') | One VM per account |
| ENABLE_ACCOUNT_COMPUTE_LIFECYCLE | lib/intelligence/execution/accountCompute/lifecycle.ts | false | Lifecycle ops |
| ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME | lib/intelligence/execution/accountCompute/lifecycle.ts | false | Guest runtime |
| ENABLE_PREVIEW_SANDBOX | lib/code-builder/sandboxAdapter.ts | false | Vercel Sandbox previews |
| ENABLE_HEAVY_CONTEXT | lib/llm/conversationEngine.ts | true (!== 'false') | Heavy context |
| ENABLE_WEB_RESEARCH | lib/llm/conversationEngine.ts | false | Web research |
| ENABLE_DELTA_AUDIT | lib/llm/conversationEngine.ts | false | Delta audit |
| ENABLE_LLM_BUDGET_ENFORCEMENT | lib/budget/redisKillSwitch.ts | false | LLM budget |
| ENABLE_JEPA_WASM | lib/jepa/treeSitterLoader.ts | false | JEPA WASM |
| LATTICE_ENABLE_LOCAL_HARNESS | lib/harness/IOHarness.ts | false | Local harness |

## 5. Key components (verified by direct read)

| Component | File | Status |
|-----------|------|--------|
| ExecutionRuntime contracts | lib/intelligence/execution/contracts.ts | Provider-neutral contract; adapters exist separately |
| Decision Plane promotion gate | lib/intelligence/decision/replay/promotion.ts | Canary-eligible ≠ activation |
| Capability manifest | lib/agents/core/capabilityManifest.ts | Weaver identity · per-request |
| Workspace access | lib/security/workspaceAccess.ts | owner/admin/member/viewer + 16 permissions |
| Account compute VMs | supabase/migrations/20261113000000*.sql | CAS · RLS · service_role RPCs |
| Guest compute supervisor | app/api/account/compute/guest/route.ts | Mock provider · 3 flags + real provider required |
| Run store (read-only) | lib/ucol/continuity/runStore.ts | Owner-scoped list; other write paths require inventory |
| Trigger.dev agent loop | src/trigger/agentLoopTask.ts | ReAct loop worker · retry policy |
| Acquisition contracts | lib/acquisition/contracts.ts | Provider-neutral · EvidenceObjectV1 |
| Sandbox adapter | lib/code-builder/sandboxAdapter.ts | Vercel Sandbox · default-off |
| Credential broker (TS client) | lib/credentials/credential-broker-client.ts | Tauri IPC · opaque refs · no raw-key readback |
| Credential broker (native) | src-tauri/credential-broker/src/lib.rs | macOS Keychain / Windows Credential Manager / Linux Secret Service |
| macOS desktop foundation | docs/architecture/macos-desktop-foundation.md | Evaluation-only · execution disabled |

## 6. PR reconciliation (GitHub metadata)

- #501, #510, #512, #513, #514, #515, #518, #519: merged. Stacked merges do not individually prove main ancestry; account compute and research paths directly re-read on pinned main.
- #526 C0: open draft, mergeable=false at inspection; #530 C1: open draft, mergeable=true, based on C0. Reconcile C0 before pilot integration.
- #532 RFC: open draft, targets main. #533 AP0: open draft, targets main. Accept RFC before AP0; no duplicate branches.
- Source-level default flags are not observed deployment settings. No live provider/DB/device tests performed in this review.

## 7. Capabilities not established by this inventory

- No Agent Actor Plane (persistent agent identities, mailboxes, sessions)
- No Workspace Filesystem Plane (logical namespace, revision API)
- No universal approval inbox established; durable approvals already exist
- No unified tenant-defined listener/workflow registry established; existing acquisition adapters and durable ingestion must be reused.
- No application manifest/install/export plane
- No multi-agent compute scheduler
- No governed self-improvement plane
- Real guest isolation qualification not established; guest route constructs mock provider and denies admission. Other adapters are not universally mocked.
- Research policy exists on pinned main: lib/research/verification/policy.ts; leanAdapter.ts requires an isolated executor; isolatedLeanExecutor.ts defines Daytona execution. Real isolation evidence still required.

## 8. Re-read evidence and remaining coverage

Direct reads at pinned main: execution/contracts.ts, workspaceAccess.ts, capabilityManifest.ts, runStore.ts, agentLoopTask.ts, guest route, both account compute migrations, sandboxAdapter.ts, research verification policy/Lean adapter/isolated executor, Apify provider. Search also located lib/acquisition/durable/ingestion.ts and src/trigger/acquisitionIngestTask.ts. Unrechecked inventory rows are provisional. AP0 exit requires a checkout-generated complete route/schema/flag/owner/test matrix, CI evidence and maintainer sign-off; do not infer absence from this sample.

Complete path inventory: 186 API routes, 132 Supabase migrations, 179 JS/TS tests under test directories. Semantic checks remain open.

See [AP0.2 pinned inventory and acceptance evidence](./AP0_ACCEPTANCE_EVIDENCE.md) for enumerated paths, CI diagnosis and proposed ADR ownership. No production qualification inferred.
