# AP0_RESOURCE_MODEL.md

**AP0 — Canonical Resource Model** · RFC-0001 §5 · Lattice OS 2027
**Source:** main @ 113e7ba6 · verified by direct file reads · 2026-11-23
**Status:** Documentation only · conceptual mapping · not migration DDL

## 1. Method

RFC-0001 §5 defines 13 logical resource types. This document maps each to
existing code evidence, or marks it as absent. Scope derives from
server-verified identity and membership (workspaceAccess.ts), never from a
client-supplied owner field alone.

## 2. Resource model mapping

| RFC resource | Meaning | Existing evidence | Disposition |
|--------------|---------|-------------------|-------------|
| **Principal** | Human, service or agent identity with explicit delegation | Clerk userId via `requireAuth()` (lib/security/apiAuth.ts); workspace membership via `getWorkspaceAccess()` | Retain · reuse |
| **AgentDefinition / AgentRevision** | Immutable versioned harness, capabilities, limits, extension references | `CapabilityManifest` (identity: 'weaver', resolvedMode, capabilities map) at lib/agents/core/capabilityManifest.ts | Extend beyond Weaver |
| **AgentInstance** | Durable identity pinned to an approved revision | Trigger.dev `agentLoopTask` (id: "agent-loop", retry policy) at src/trigger/agentLoopTask.ts | Retain · qualify |
| **AgentSession** | Checkpointed private execution context, independent of conversation | `runStore.ts` (read-only list) at lib/ucol/continuity/runStore.ts; Trigger.dev task runs | Extend · creation not yet implemented |
| **Task / Run / Attempt** | Durable intent, logical execution, retry attempt | `conversation_runs` table (migration 20261109000000_conversation_continuity.sql); `agentLoopTask` retry (maxAttempts: 3) | Retain · extend |
| **Conversation / Message** | Human-facing communication; authorized publication | `conversations` table; `app/api/conversations/[id]/runs/route.ts` | Retain |
| **ComputeResource / ExecutionLease** | Provider-neutral resource, bounded fenced grant | `account_compute_vms` + `account_compute_workspaces` (migration 20261113000000); guest leases (20261113000001); generation CAS RPCs | Retain · qualify isolation |
| **WorkspaceResource / Revision** | Logical file/object identity with versioned content | `workspaces` + `workspace_members` tables; workspaceAccess.ts roles/perms | Extend to revision API |
| **WorkflowDefinition / WorkflowRun** | Versioned durable steps, persisted execution | Trigger.dev `agentLoopTask` only; no workflow graph definition | Absent · build in AP4 |
| **Listener / Event / Signal** | Authorized subscription, immutable input, derived trigger | `lib/acquisition/contracts.ts` (AccessState, provider contract); no listener registry | Absent · build in AP4 |
| **AppDefinition / AppInstallation** | Versioned portable software, tenant-scoped deployed state | `lib/code-builder/sandboxAdapter.ts` (preview only); `preview_sandboxes` table | Retain · extend to install/export |
| **Approval / Receipt** | Exact action authorization, auditable outcome | `approvalRequest` field in agentLoopTask result; no persistent approval/receipt store | Absent · build in AP3 |

## 3. Scope enforcement (verified)

| Boundary | Mechanism | File |
|----------|-----------|------|
| Workspace membership | `getWorkspaceAccess(userId, workspaceId)` → accepted membership OR owner fallback | lib/security/workspaceAccess.ts |
| Role → permissions | `WORKSPACE_ROLE_PERMISSIONS` map (owner=all 14, viewer=3) | lib/security/workspaceAccess.ts |
| Per-operation auth | `requireWorkspacePermission(userId, workspaceId, permission)` → 403 | lib/security/workspaceAccess.ts |
| Account VM access | RLS: users read own VMs; service_role owns all; RPCs exec-only service_role | supabase/migrations/20261113000000_account_compute_vms.sql |
| Generation CAS | Monotonic counter on every VM/workspace state change | account_compute_*_vm RPCs |
| Credential secrecy | No raw-key readback; opaque CredentialRef + status | src-tauri/credential-broker/src/lib.rs |
| Sandbox isolation | No SUPABASE_SERVICE_ROLE_KEY/NVIDIA_API_KEY injected; separate origin | lib/code-builder/sandboxAdapter.ts |

## 4. Absent resources (to be built)

| RFC resource | Why absent | AP phase |
|--------------|------------|----------|
| AgentDefinition revision store | Capability manifest is Weaver-only, no revision history | AP1 |
| AgentSession checkpoint store | runStore is read-only; no checkpoint writes | AP1 |
| Approval / Receipt persistent store | approvalRequest is ephemeral in task result | AP3 |
| WorkflowDefinition graph store | No workflow definition format | AP4 |
| Listener registry | No listener definition or event subscription | AP4 |
| AppDefinition manifest | Code Builder builds exist but no installable app manifest | AP5 |
| Compute scheduler lease pool | One VM per account baseline; no multi-agent scheduler | AP6 |

## 5. ID correlation (RFC §14)

| Correlation chain | Existing field |
|-------------------|----------------|
| tenant → task → run → attempt → lease → event → receipt | workspace_id → conversation_id → run.id → attempt → generation → event_sequence → result_ref |
| agent definition → instance → session → run | capabilityManifest identity → agentLoopTask id → Trigger.dev run id |
