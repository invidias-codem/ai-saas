# AP0_TRUST_BOUNDARIES.md

**AP0 — Authorization and Isolation Matrix** · RFC-0001 §12 · Lattice OS 2027
**Source:** reviewed main @ 80c49ad6c6c01f6f665b839695b6f26135041a54 (2026-11-24); earlier inventory @ 113e7ba6ae9f615c8c8cd3019735f418f5a371da. Selected paths re-read, not exhaustive runtime qualification.
**Status:** Documentation only · no runtime changes

## 1. Non-negotiable invariants (RFC-0001 §12)

| Invariant | Current state | Evidence |
|-----------|---------------|----------|
| Deny by default | Partial | workspaceAccess.ts denies missing membership; guest route default-off |
| Effective authority = intersection of delegation ∩ revision ∩ workspace policy ∩ resource perms ∩ runtime capability | Partial | capabilityManifest + workspaceAccess + readEnforcement |
| No cross-tenant access | Source control only; qualification pending | RLS on account_compute_vms (owner_user_id = auth.uid()::text); workspaceAccess owner/member scoping |
| No ambient service-role authority | Partial | RPC grants restricted to service_role; server caller checks and JWT identity mapping still require verification |
| No shared secrets | Source control only; qualification pending | Credential broker: opaque refs, no raw-key readback; sandbox: no platform secrets injected |
| No implicit host execution fallback | Source control only; qualification pending | macOS desktop foundation: execution disabled pending qualification; never raw host after VM failure |
| No privilege escalation through delegation | Source control only; qualification pending | capabilityManifest never advertises unenforced reads; readEnforcement covers context reads; delegation and side-effect checks remain unproven |
| All control-plane mutations audited | Partial | workspaceAccess logs access outcomes via telemetry; no centralized audit table yet |
| All compute leases have expiry/fencing/revocation | Partial | account_compute_vms generation CAS; guest lease TTL/renewal; sandbox expires_at |
| Bound tokens/runtime/storage/network/concurrency/spend | Partial | AcquisitionBudget (maxProviderCostUsd, maxRecords, maxActors, maxSources, deadlineMs); guest lease TTL |

## 2. Authorization matrix

| Plane | Resource | Check | Enforcement point | Default |
|-------|----------|-------|-------------------|---------|
| Workspace | workspaces/:id | `getWorkspaceAccess(userId, workspaceId)` | lib/security/workspaceAccess.ts | Denied (null) |
| Workspace | per-operation (read/write/delete/invite) | `requireWorkspacePermission(userId, workspaceId, permission)` | lib/security/workspaceAccess.ts | 403 |
| Account compute | VM claim/attach/detach | service_role RPCs only; EXECUTE revoked from PUBLIC/authenticated | supabase/migrations/20261113000000*.sql | Revoked |
| Account compute | guest create/start/suspend/destroy | Clerk auth + workspace admission + account VM ready + 3 flags + real provider | app/api/account/compute/guest/route.ts | 503 (not enabled) |
| Preview sandbox | provision/destroy | Owner-only via build.user_id === userId | lib/code-builder/sandboxAdapter.ts | Feature-flagged off |
| Capability | per-session capabilities | `buildCapabilityManifest()` derived from readEnforcement | lib/agents/core/capabilityManifest.ts | unavailable/unsupported |
| Credential | store/get/delete | Tauri IPC → native broker; no TS-side secret access | lib/credentials/credential-broker-client.ts | Native store only |
| Acquisition | provider start/collect/start | AcquisitionBudget caps cost/records/sources/deadline | lib/acquisition/contracts.ts | Default budget $0.10 |

## 3. Isolation matrix

| Boundary | Mechanism | Status | Gap |
|----------|-----------|--------|-----|
| Tenant ↔ tenant | RLS owner_user_id = auth.uid()::text; workspaceAccess scoping | Source control only; qualification pending | Coverage and runtime denial evidence pending |
| User ↔ user within tenant | Role-based permissions (owner > admin > member > viewer) | Source control only; qualification pending | Viewer/member share workspace:read (C1 finding) |
| Agent ↔ agent | No agent identity plane yet | Absent | AP1: AgentDefinition/AgentInstance isolation |
| Compute ↔ compute | One VM per account; guest leases with TTL | Partial | No multi-tenant compute enablement (RFC §6) |
| Secret ↔ filesystem | Credential broker outside agent filesystem; opaque refs | Source control only; qualification pending | Coverage and runtime denial evidence pending |
| Sandbox ↔ host | Separate origin; no platform secrets; egress restrictions require provider validation | Source control only; qualification pending | Public sharing blocked by #479 |
| Preview ↔ production | Preview sandbox on sandbox URL, never gen1e.xyz | Source control only; qualification pending | #479 ingress authorization pending |

## 4. Default-off feature gate matrix

| Feature | Flags required | Additional gate | Source default (live state unverified) |
|---------|---------------|-----------------|---------------|
| Account compute VM | ENABLE_ACCOUNT_COMPUTE | None (claim only) | Default-off; deployment not checked |
| Guest compute lifecycle | ENABLE_ACCOUNT_COMPUTE + LIFECYCLE + GUEST_RUNTIME | Real (non-mock) provider qualified | Default-off; deployment not checked |
| Preview sandbox | ENABLE_PREVIEW_SANDBOX | VERCEL_OIDC_TOKEN | Default-off; deployment not checked |
| C1 demo UI | ENABLE_CLIENT_OPS_DEMO | Both NODE_ENV and VERCEL_ENV must not be production (verify C1 source before merge) | Not on main (PR #530) |
| C0 evaluation | None (demo entrypoint) | Synthetic data only | Not on main (PR #526) |
| LLM budget enforcement | ENABLE_LLM_BUDGET_ENFORCEMENT | — | Default-off; deployment not checked |
| JEPA WASM | ENABLE_JEPA_WASM | — | Default-off; deployment not checked |
| Local harness | LATTICE_ENABLE_LOCAL_HARNESS | — | Default-off; deployment not checked |

## 5. Revocation and expiry

| Resource | Revocation mechanism | Expiry | Evidence |
|----------|---------------------|--------|----------|
| Workspace membership | Row deletion from workspace_members | Immediate on next getWorkspaceAccess call | lib/security/workspaceAccess.ts |
| Account VM | state → destroyed/quarantined via generation CAS | N/A | account_compute VM RPCs |
| Guest lease | Lease TTL (5 min) + renewal (1 min) | TTL expiration | DurableGuestSupervisor config |
| Preview sandbox | expires_at + destroySandbox() stops VM | expires_at | lib/code-builder/sandboxAdapter.ts |
| Credential | delete-api-key/delete-refresh-token/delete-local-endpoint | Store deletion; outstanding grants/tokens need separate revocation | credential-broker-client.ts |

## 6. Known gaps (to be resolved in AP1–AP7)

| Gap | RFC reference | Phase |
|-----|---------------|-------|
| No persistent AgentDefinition/AgentInstance store | §6 agent lifecycle | AP1 |
| No universal approval inbox / effect receipt store; durable approvals exist | §8 conversations/approvals | AP3 |
| No listener registry / event subscription | §9 events/workflows | AP4 |
| No application manifest / installable app plane | §10 applications | AP5 |
| No multi-agent compute scheduler | §6 compute fabric | AP6 |
| No governed self-improvement / extension promotion | §11 self-improvement | AP7 |
| End-to-end cross-tenant denial coverage not established | §14 acceptance gates | AP0 gap analysis |

## 7. AP0 review gates

The SQL uses TEXT Clerk owner IDs compared with auth.uid()::text; prove actual JWT subject mapping and service-role caller admission, not merely policy presence. Test cross-tenant denial, role change during queued work, stale leases, cancellation, duplicate delivery, secret exposure and quota exhaustion. The Research Lean adapter requires an isolated executor on pinned main; verify real network/host isolation and teardown independently. No production flag values, live tests or global absence of host fallback were established. Effective delegation must be enforced at admission and execution before actors can run; manifests are not authorization tokens.

## AP0.2 approval boundary finding

Pinned approval resume route performs approval-state mutation before verifying owner, and the durable store transition is not explicitly owner/expiry scoped. Source-level authorization-order issue; no live exploit tested. Scope atomic approve/deny and idempotent reads by authenticated identity and expiry, revalidate current workspace permission and action revision before execution, verify migrations and all callers, and add negative tests. Do not add new actor approval flows until remediated. Existing durable storage is not qualified authorization.

See [AP0.2 pinned inventory and acceptance evidence](./AP0_ACCEPTANCE_EVIDENCE.md) for enumerated paths, CI diagnosis and proposed ADR ownership. No production qualification inferred.
