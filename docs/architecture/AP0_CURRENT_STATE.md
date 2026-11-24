# AP0_CURRENT_STATE.md

**AP0 — Infrastructure Inventory** · RFC-0001 · Lattice OS 2027
**Source:** main @ 113e7ba6 · verified by direct file reads · 2026-11-23
**Status:** Documentation only · no runtime changes

## 1. Repository baseline

| Item | Value |
|------|-------|
| Main SHA | 113e7ba6 (fix(compute): A3.4.2 staging readiness) |
| RFC baseline SHA | 80c49ad6 (referenced in RFC-0001 §3) |
| RFC PR | #532 (docs/rfc-0001-agent-native-operating-environment, draft) |
| Related open PRs | #526 (C0 foundation), #530 (C1 demo) |
| Open dependabot PRs | 20+ (Next, node-forge, hono, codeql, etc.) |
| Local feature branches | 25+ (account-compute-a3-*, client-ops-*, preview-assembler, etc.) |

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

Full route inventory: ~50 route.ts files under app/api/.

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
| ENABLE_JEPA | .env.local | [SENSITIVE] | JEPA model |
| ENABLE_WEB_RESEARCH | lib/llm/conversationEngine.ts | false | Web research |
| ENABLE_DELTA_AUDIT | lib/llm/conversationEngine.ts | false | Delta audit |
| ENABLE_LLM_BUDGET_ENFORCEMENT | lib/budget/redisKillSwitch.ts | false | LLM budget |
| ENABLE_JEPA_WASM | lib/jepa/treeSitterLoader.ts | false | JEPA WASM |
| LATTICE_ENABLE_LOCAL_HARNESS | lib/harness/IOHarness.ts | false | Local harness |

## 5. Key components (verified by direct read)

| Component | File | Status |
|-----------|------|--------|
| ExecutionRuntime contracts | lib/intelligence/execution/contracts.ts | Contracts only · 6 ops · provider-neutral |
| Decision Plane promotion gate | lib/intelligence/decision/replay/promotion.ts | Canary-eligible ≠ activation |
| Capability manifest | lib/agents/core/capabilityManifest.ts | Weaver identity · per-request |
| Workspace access | lib/security/workspaceAccess.ts | owner/admin/member/viewer + 14 perms |
| Account compute VMs | supabase/migrations/20261113000000*.sql | CAS · RLS · service_role RPCs |
| Guest compute supervisor | app/api/account/compute/guest/route.ts | Mock provider · 3 flags + real provider required |
| Run store (read-only) | lib/ucol/continuity/runStore.ts | Owner-scoped · no creation yet |
| Trigger.dev agent loop | src/trigger/agentLoopTask.ts | ReAct loop worker · retry policy |
| Acquisition contracts | lib/acquisition/contracts.ts | Provider-neutral · EvidenceObjectV1 |
| Sandbox adapter | lib/code-builder/sandboxAdapter.ts | Vercel Sandbox · default-off |
| Credential broker (TS client) | lib/credentials/credential-broker-client.ts | Tauri IPC · opaque refs · no raw-key readback |
| Credential broker (native) | src-tauri/credential-broker/src/lib.rs | macOS Keychain / Windows Credential Manager / Linux Secret Service |
| macOS desktop foundation | docs/architecture/macos-desktop-foundation.md | Evaluation-only · execution disabled |

## 6. Open workstreams (local branches)

- feat/client-ops-c0 → C0 synthetic evaluation foundation (PR #526)
- feat/client-ops-c1 → C1 protected demo UI (PR #530, stacked on C0)
- feat/account-compute-a3-3-rootless-guest → A3.3 rootless guest
- feat/account-compute-a3-4-durable-leases → A3.4 durable leases
- feat/account-compute-a3-4-reconciled → A3.4 reconciliation
- feat/account-compute-a3-guest-supervisor → A3 guest supervisor
- feat/account-compute-plane-contract-v1 → Account compute plane contract
- feat/preview-assembler → Code Builder preview assembler
- feat/research-plane-r0-contracts → Research plane R0 contracts

## 7. What is NOT present

- No Agent Actor Plane (persistent agent identities, mailboxes, sessions)
- No Workspace Filesystem Plane (logical namespace, revision API)
- No universal approval inbox
- No listener/event/workflow plane beyond Trigger.dev agent loop
- No application manifest/install/export plane
- No multi-agent compute scheduler
- No governed self-improvement plane
- No real provider isolation qualification (mock providers everywhere)
- `lib/research/verification/policy.ts` referenced in RFC §3 does NOT exist
