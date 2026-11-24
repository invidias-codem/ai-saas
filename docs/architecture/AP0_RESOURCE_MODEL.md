# AP0_RESOURCE_MODEL.md

**AP0 — Canonical Resource Model** · RFC-0001 §5 · Lattice OS 2027
**Source:** reviewed main @ 80c49ad6c6c01f6f665b839695b6f26135041a54 (2026-11-24); earlier inventory @ 113e7ba6ae9f615c8c8cd3019735f418f5a371da. Selected paths re-read, not exhaustive runtime qualification.
**Status:** Documentation only · conceptual mapping · not migration DDL

## 1. Method

RFC-0001 §5 defines 12 grouped resource rows. This document maps each to
existing code evidence, or marks it as absent. Scope derives from
server-verified identity and membership (workspaceAccess.ts), never from a
client-supplied owner field alone.

## 2. Resource model mapping

| RFC resource | Meaning | Existing evidence | Disposition |
|--------------|---------|-------------------|-------------|
| **Principal** | Human, service or agent identity with explicit delegation | Clerk userId via `requireAuth()` (lib/security/apiAuth.ts); workspace membership via `getWorkspaceAccess()` | Retain · reuse |
| **AgentDefinition / AgentRevision** | Immutable versioned harness, capabilities, limits, extension references | `CapabilityManifest` (identity: 'weaver', resolvedMode, capabilities map) at lib/agents/core/capabilityManifest.ts | Extend beyond Weaver |
| **AgentInstance** | Durable identity pinned to an approved revision | Trigger.dev task definition is a reusable execution mechanism, not a durable agent instance | New identity contract required |
| **AgentSession** | Checkpointed private execution context, independent of conversation | `runStore.ts` (read-only list) at lib/ucol/continuity/runStore.ts; Trigger.dev task runs | Extend · actor checkpoints not established by this reader |
| **Task / Run / Attempt** | Durable intent, logical execution, retry attempt | `conversation_runs` table (migration 20261109000000_conversation_continuity.sql); `agentLoopTask` retry (maxAttempts: 3) | Retain · extend |
| **Conversation / Message** | Human-facing communication; authorized publication | `conversations` table; `app/api/conversations/[id]/runs/route.ts` | Retain |
| **ComputeResource / ExecutionLease** | Provider-neutral resource, bounded fenced grant | `account_compute_vms` + `account_compute_workspaces` (migration 20261113000000); guest leases (20261113000001); generation CAS RPCs | Retain · qualify isolation |
| **WorkspaceResource / Revision** | Logical file/object identity with versioned content | `workspaces` + `workspace_members` tables; workspaceAccess.ts roles/perms | Extend to revision API |
| **WorkflowDefinition / WorkflowRun** | Versioned durable steps, persisted execution | Trigger.dev task execution and acquisition ingestion; unified definition not established | Absent · build in AP4 |
| **Listener / Event / Signal** | Authorized subscription, immutable input, derived trigger | Acquisition contracts, Apify provider and durable ingestion; unified listener registry not established | Absent · build in AP4 |
| **AppDefinition / AppInstallation** | Versioned portable software, tenant-scoped deployed state | `lib/code-builder/sandboxAdapter.ts` (preview only); `preview_sandboxes` table | Retain · extend to install/export |
| **Approval / Receipt** | Exact action authorization and auditable outcome | lib/execution/durableApprovalStore.ts; app/api/approval/resume/route.ts; volatile approvalStore.ts | Reuse and harden; universal inbox/effect receipts not established |

## 3. Source-level scope controls (runtime qualification pending)

| Boundary | Mechanism | File |
|----------|-----------|------|
| Workspace membership | `getWorkspaceAccess(userId, workspaceId)` → accepted membership OR owner fallback | lib/security/workspaceAccess.ts |
| Role → permissions | `WORKSPACE_ROLE_PERMISSIONS` map (owner=all 16, viewer=3) | lib/security/workspaceAccess.ts |
| Per-operation auth | `requireWorkspacePermission(userId, workspaceId, permission)` → 403 | lib/security/workspaceAccess.ts |
| Account VM access | RLS: users read own VMs; service_role owns all; RPCs exec-only service_role | supabase/migrations/20261113000000_account_compute_vms.sql |
| Generation CAS | Monotonic counter on every VM/workspace state change | account_compute_*_vm RPCs |
| Credential secrecy | No raw-key readback; opaque CredentialRef + status | src-tauri/credential-broker/src/lib.rs |
| Sandbox isolation | No SUPABASE_SERVICE_ROLE_KEY/NVIDIA_API_KEY injected; separate origin | lib/code-builder/sandboxAdapter.ts |

## 4. Resource gaps (to be confirmed by full inventory)

| RFC resource | Why absent | AP phase |
|--------------|------------|----------|
| AgentDefinition revision store | Capability manifest is Weaver-only, no revision history | AP1 |
| AgentSession checkpoint store | runStore is read-only; no checkpoint writes | AP1 |
| Universal approval inbox / effect receipts | Durable approval persistence exists; authorization and effect reconciliation need remediation | AP3 |
| WorkflowDefinition graph store | No workflow definition format | AP4 |
| Listener registry | No listener definition or event subscription | AP4 |
| AppDefinition manifest | Code Builder builds exist but no installable app manifest | AP5 |
| Compute scheduler lease pool | One VM per account baseline; no multi-agent scheduler | AP6 |

## 5. ID correlation (RFC §14)

Proposed independent identifiers: tenant_id, workspace_id, initiator_id, agent_definition_id, agent_revision_id, agent_instance_id, agent_session_id, task_id, run_id, attempt_id, lease_id, event_id, receipt_id. Generation is a fencing version, not a lease ID. A conversation is not a task or tenant. Trigger.dev task/run IDs are external execution references, not agent/session identities. No existing end-to-end correlation chain is verified. AP1.0 must map account/Clerk subject, workspace ownership/membership and DB JWT subject (auth.uid()::text) explicitly; deny ambiguous mapping, including service-role paths. No DDL until the canonical mapping ADR is approved.

Interactive unifiedSession identifies workspace/artifact control, not a private actor session. Preserve separate identities.

See [AP0.2 pinned inventory and acceptance evidence](./AP0_ACCEPTANCE_EVIDENCE.md) for enumerated paths, CI diagnosis and proposed ADR ownership. No production qualification inferred.
