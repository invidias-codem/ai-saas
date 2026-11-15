# Personal Compute Plane — one VM per Lattice account

**Status:** A0 contract only, rollout disabled. No provider provisioning, migration, background worker, or preview-origin change is performed by this slice.

## Decision

Each **Clerk user account**, not each workspace, is entitled to **one logical personal Linux VM**. Workspaces are independent execution and data security scopes within the account's computer, not additional VMs. Code Builder preview sandboxes remain separate ephemeral untrusted-code environments, referenced by the existing unified session. Account VM resources must not be used as the public preview origin.

- Account: authoritative compute owner and billing/quota principal.
- Workspace: authorized project context with an isolated filesystem, process namespace, network policy, credentials, and execution lease.
- Conversation: a task with a workspace-owned execution lease; no implicit host authority.
- VDI: provider-neutral broker, desktop lifecycle, machine and human control leases, reconciliation, evidence.
- Preview: Vercel Sandbox/VM under its existing feature flag. UnifiedSession can correlate the VM desktop ID with a sandbox build/preview; it does not merge their trust boundaries.

## A0: contracts (implemented)

`lib/intelligence/execution/accountCompute/contracts.ts` defines `planAccountCompute()` and stable account reservation/broker scope helpers.

- Account reservation key is stable across *all* workspaces and VM resize/image changes.
- VDI tenant scope is derived from Clerk user ID; its broker workspace is a reserved constant (`__lattice_account_vm__`), never a user-provided workspace ID.
- A workspace namespace is an opaque digest of (account, workspace), **not** a security boundary on its own.
- Only an authenticated user with an accepted, authorized owner/admin/member workspace role can request compute; viewer and pending invite cannot.
- An account VM must be verified `linux_vm`. Existing Daytona `container` capability must not be silently relabeled.
- Filesystem/process/network/secrets workspace isolation must all be provider-attested before any operation.
- Account quotas must fit provider-verified limits. Concurrency is a later admission gate, not a promise that each project has a dedicated vCPU.
- Ready VM is reused; suspended VM is resumed only when durable suspend is supported; provisioning is waited on; degraded/failed/destroyed/quarantined state triggers reconciliation, **never** auto-create.
- Entire plane is dark until `ENABLE_ACCOUNT_COMPUTE=true` is explicitly deployed and all subsequent gates are ready. A0 itself does not read or set that environment variable.

**Security note:** A role returned by `getWorkspaceAccess(userId, workspaceId)` must be checked immediately before every creation, lease, or execution. That helper ignores unaccepted memberships. No client can supply user/owner identity or a role as a source of truth. Shared-workspace members use their **own** personal VM; they never receive the workspace owner's host credentials or access to other projects.

## Existing system touchpoints

| Current component | Integration direction |
| --- | --- |
| `lib/intelligence/execution/contracts.ts` | Retain UCOL provider-neutral execution requirement resolution. |
| `lib/intelligence/execution/vdi/contracts.ts` | Keep `DesktopBroker`; account allocator owns the reserved account-level VDI scope. |
| `lib/intelligence/execution/vdi/daytonaAdapter.ts` | Current advertised runtime is `container`. No true VM activation until staging confirms organization's VM snapshot/runtime availability. |
| `lib/vdi/store/desktopStore.ts` | Reuse generation fencing, operation-key reconciliation, leases, and VDI audit evidence; do not bypass budget admission. |
| `lib/security/workspaceAccess.ts` | Authenticated owner/accepted member access per request; viewers do not gain execution. |
| `lib/code-builder/unifiedSession/*` | Link workspace / build / preview / desktop identities without sharing authorization or raw provider credentials. |
| `lib/code-builder/sandboxAdapter.ts` | Preserve distinct ephemeral previews and `ENABLE_PREVIEW_SANDBOX` gate. `ENABLE_PREVIEW_SHARING` remains separately gated. |

## Next implementation slices (not yet implemented)

**A1 — durable account reservation** (Supabase, isolated reviewed migration):
1. Create `account_compute_vms` with `owner_user_id TEXT NOT NULL UNIQUE`, stable operation key, provider/sandbox IDs, VM class, generation, state, timestamps, and verified entitlement snapshot. Enable RLS, revoke `anon`/`authenticated` access, and require server service-role access after Clerk authentication.
2. Allocate claim *before* any provider create using a transactional UNIQUE/CAS operation, with a durable in-progress lease, timeout/reconciliation, and idempotency key. A spec/image change is an update or explicit replacement, never a second account VM.
3. Create `account_compute_workspaces` with composite unique (owner_user_id, workspace_id), namespace, generation, status. Enforce ownership by validated memberships on **every** operation, including previously attached shared workspaces after revocation.
4. Use idempotent, monotonic generation compare-and-swap for attach, lease, teardown, and orphan reconciliation; no duplicate concurrent claims.
5. Add an authenticated server-only `/api/account/compute` status/ensure endpoint behind its own default-off flag, with per-user rate limits and no provider URL/secret leakage.

**A2 — real VM provider qualification**:
1. Verify Daytona's `linux_vm` eligibility **in this org** with a VM-class snapshot; `daytona-vm-small`/medium are potential candidates, not an assumption.
2. Run a smoke test: provision, provider-class lookup, stop/pause/resume, command timeout, nested-workspace isolation, resume after worker restart, quota and owner tests.
3. Only then advertise `linux_vm` via registered capabilities. If unavailable, abstain: no container fallback and no paid VM promise.
4. Reuse VDI budget admission, accounting, health, evidence, teardown and idle suspension. Define storage retention/deletion and billing caps.

**A3 — guest workspace supervisor**:
1. Install one authenticated guest supervisor with rootless containers or equivalently verified guest compartments per workspace, **without** Docker socket, host-home, cross-workspace mounts, metadata service, or privileged network access.
2. Workspaces get distinct mounts, UID/process/network controls, egress allowlist, secret broker tokens, vCPU/RAM/disk quotas, and a workspace-specific execution lease. Block cross-workspace read/write and concurrent overcommit.
3. Human/agent input handoff uses the existing VDI generation-fenced exclusive control lease. Shared-workspace members do not access one another's account VM.

**A4 — Code Builder micro-app preview**:
1. Keep build-time execution untrusted and isolated in Vercel Sandbox. Resolve completed build by authenticated owner, then associate preview ID and account VM desktop ID through `UnifiedSession` only after both authorizations pass.
2. Stream preview logs/status back to Code Builder, retaining separate Preview/Code/Logs surfaces. If VDI is unavailable, Code Builder must still work through existing sandbox preview.
3. No public preview URL or interactive share by default. Complete Issue #479 origin/session isolation, TTL, CSP, auth, network restrictions and consent before private sharing.
4. End-to-end verify: account A owns VM A, two project workspaces attach without duplicate VM, account B is denied A, viewer is denied compute, paused machine resumes, one micro-app preview runs isolated, human takes/relinquishes control, leases and budgets reconcile.

## Rollout boundaries

- **No changes to production flags, payments, VDI provider entitlement, or production DB in A0.**
- This is **not** ready for November 16 Product Hunt production exposure.
- Gate A1–A4 independently in preview/staging; don't claim personal VMs are live until actual VM-class evidence and human acceptance exist.
