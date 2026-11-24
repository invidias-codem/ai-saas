# RFC-0001: The Agent-Native Operating Environment

- Status: Proposed; not accepted or production-qualified
- Version: 0.1.0
- Date: 2026-11-23
- Horizon: 2027
- Scope: Lattice OS architecture, documentation only

## 1. Abstract

Lattice OS evolves its memory-native, workspace-first platform into an agent-native operating environment in which humans delegate durable work, agents coordinate authorized execution, and organizations build and own portable software. This RFC consolidates existing planes rather than replacing them. It defines boundaries, resource identities, security invariants, migration order, and acceptance gates. Implementation requires separately reviewed changes.

## 2. Motivation and source

The user-supplied "Agent platform 2027" thesis proposes independent actor runtimes, N agents to M computers, an RBAC filesystem, separation of sessions and conversations, approval inboxes, tenant-configurable listeners, durable code-defined workflows, and customizable apps with multiple presentation containers. Its predictions are architectural hypotheses, not established industry facts. Lattice adopts the useful abstractions but does not assume actors replace durable orchestration or constitute a security sandbox. Shared plaintext .env files are not an acceptable credential architecture.

## 3. Baseline evidence

Preliminary source inventory from default-branch search indexed at 80c49ad6c6c01f6f665b839695b6f26135041a54 and README read on main. Presence is not proof of live qualification. Before implementation, inventory the exact current main SHA, open stacks, flags, migrations, owners and tests. No competing implementation may be introduced without an explicit replacement ADR.

| Primitive | Existing evidence | Disposition |
|---|---|---|
| UCOL and memory | README.md | Retain context and model resolution |
| Execution | lib/intelligence/execution/contracts.ts | Retain provider-neutral ExecutionRuntime |
| Decision | lib/intelligence/decision/replay/promotion.ts | Retain evaluation; canary eligibility is not activation |
| Capability | lib/agents/core/capabilityManifest.ts | Extend Weaver-only identity deliberately |
| Workspace access | lib/security/workspaceAccess.ts | Reuse accepted membership and role checks |
| Account compute | supabase/migrations/20261113000000_account_compute_vms.sql; supabase/migrations/20261113000001_account_compute_guest_leases.sql | Preserve reservation, generation CAS and lock ordering |
| Guest admission | app/api/account/compute/guest/route.ts | Qualify real isolation; flags remain off |
| Conversation runs | lib/ucol/continuity/runStore.ts; app/api/conversations/[id]/runs/route.ts | Extend existing continuity |
| Durable execution | src/trigger/agentLoopTask.ts; lib/trigger/dispatch.ts | Retain Trigger.dev |
| Acquisition | lib/acquisition/contracts.ts | Reuse neutral acquisition policy |
| Preview apps | lib/code-builder/sandboxAdapter.ts; supabase/migrations/20261108000000_preview_sandboxes.sql | Reuse owner-only previews |
| Native execution | docs/architecture/macos-desktop-foundation.md | Preserve native Rust authority and no host fallback |
| Credentials | src-tauri/credential-broker/src/lib.rs; lib/credentials/credential-broker-client.ts | Keep native secrets outside agent filesystem |
| Research | lib/research/verification/policy.ts | Reuse evidence and verification semantics |

Historical work references (status must be reconciled against current main): #501, #510, #512–#515, #518, #519, #526, #530. Public preview sharing remains subject to #479 or its verified successor.

## 4. Architectural decisions

- UCOL resolves context, provider, capability and execution requirements. Weaver coordinates and delegates tasks. Neither grants authority.
- Identity/authorization, Decision Plane, Credential Broker and resource admission are cross-cutting controls, not agent tools that can override policy.
- Agent Actor Plane manages durable agent definitions, instances, mailboxes, checkpoints and sessions. Actor state is independent of process placement.
- Execution Plane remains the provider-neutral execution abstraction. Account Compute owns persistent account resources; a future scheduler leases eligible compute to runs.
- Acquisition Plane obtains external data through registered adapters. Event and Workflow Plane turns authenticated events into durable work.
- Workspace Filesystem Plane owns logical names, revisions, access policies and artifact metadata independently of compute placement.
- Application Runtime Plane manages versioned app definitions, installations, state, rendering and deployment.
- Conversation and Approval surfaces are projections of authorized durable records, not raw model transcripts.
- Research Plane is a specialized consumer of execution and evidence contracts, not a second generic execution platform.

## 5. Canonical resource model (conceptual, not migration DDL)

Every tenant-owned resource has a stable ID, authoritative tenant/workspace scope, lifecycle state, version and audit provenance. Scope derives from server-verified identity and membership, never a client-supplied owner field alone.

| Resource | Meaning |
|---|---|
| Principal | Human, service or agent identity with explicit delegation |
| AgentDefinition / AgentRevision | Immutable versioned harness, capabilities, limits and extension references |
| AgentInstance | Durable identity pinned to an approved revision |
| AgentSession | Checkpointed private execution context, independent of conversation |
| Task / Run / Attempt | Durable intent, logical execution, retry attempt |
| Conversation / Message | Human-facing communication; authorized publication |
| ComputeResource / ExecutionLease | Provider-neutral resource and bounded, fenced grant |
| WorkspaceResource / Revision | Logical file or object identity with versioned content |
| WorkflowDefinition / WorkflowRun | Versioned durable steps and persisted execution |
| Listener / Event / Signal | Authorized subscription, immutable input, derived trigger |
| AppDefinition / AppInstallation | Versioned portable software and tenant-scoped deployed state |
| Approval / Receipt | Exact action authorization and auditable execution outcome |

These are proposed logical contracts; map existing IDs and tables before creating new ones. Conversation-to-run links are many-to-many where needed; a run has one authoritative scope and may publish only to explicitly authorized destinations. Agent definitions may be shared as code without sharing tenant data or credentials.

## 6. Agent actors and execution

A mailbox durably accepts messages with idempotency keys. At most one valid writer owns an instance state transition at a time, using generation fencing and checkpoint CAS. Duplicate delivery is expected; no blanket exactly-once claim. Persist checkpoints before acknowledging durable work, reconcile crashes, and quarantine poison messages. Retries are bounded. Cancellation and revocation stop new grants and fence stale holders; providers that cannot enforce required isolation or cancellation are ineligible.

Agent definitions, instances, sessions, runs and computers have separate lifecycles. One persistent VM per account remains the baseline entitlement, not an invariant for every future resource. Additional ephemeral sandboxes require explicit quotas, placement policy and admission. Multiple agents may share a VM only with qualified workload isolation, distinct leases and resource accounting. Preserve account VM -> guest -> lease lock order. No live multi-tenant compute enablement without two-connection database races and real provider isolation evidence.

Lifecycle proposal: instance registered -> idle -> active -> waiting -> idle; suspended and retired states deny new work. Run queued -> admitted -> running -> waiting/terminal, with cancellation, failure and recovery transitions. Durable orchestration remains on Trigger.dev unless an ADR demonstrates a superior alternative. Evaluate actor backends on replay, fencing, placement, isolation, portability and cost; do not adopt a vendor solely from the thesis.

## 7. Workspace filesystem

Start with a logical resource namespace and object-backed revision API, not a distributed POSIX implementation. Example workspace paths: agents/, apps/, documents/, projects/, workflows/, research/, shared/. Memory is a separate scoped service exposed only through authorized projections. System resources are immutable to tenant agents. Git repositories and external sources retain their own authority; mounted data does not silently become writable.

Resolve authorization per operation (list/read/write/rename/share/delete), including parent and target scopes, version preconditions and revocation. Deny path traversal, symlink escapes, cross-tenant object IDs and stale grants. Define atomic publication, concurrent write conflicts, deletion/retention, encryption, backup and export. Introduce POSIX mounts only after evaluating consistency, lock semantics, identity mapping and isolation. Never place reusable secrets in shared files; broker short-lived scoped credentials via authorized runtime mechanisms.

## 8. Conversations, approvals and receipts

A user-facing conversation is not an agent session. Agents explicitly publish messages/artifacts through a scoped service; stream sanitized progress where useful. Restricted diagnostics may expose authorized operational traces, not hidden model reasoning, raw secrets or private data from another scope. Conversation continuity must survive model switching, client disconnect and retries.

A universal inbox projects approvals, questions and exceptions. Each approval binds principal, tenant/workspace, exact action and resource revision/hash, limits, expiry and nonce. Execution revalidates approval and current authority and consumes it atomically where feasible; edited actions require fresh approval. Denial, expiry, cancellation and revocation are first-class. Record external side-effect receipts, reconcile ambiguous outcomes before retrying, and do not treat an LLM assertion as a receipt.

## 9. Events and durable workflows

Listeners are tenant-scoped versioned definitions with authorized source, event filters, schedule/window, quotas, expiry and owner. Support authenticated webhook, polling and scheduled adapters first; streaming/CDC later through isolated registered adapters. Verify signatures, reject replay, normalize payloads, minimize retained data, deduplicate, apply backpressure and dead-letter handling. Untrusted event content is data, never authority or executable instruction. Prevent SSRF, arbitrary egress and recursive trigger storms.

Workflows are code-defined, versioned, reviewable graphs or programs with deterministic and agentic steps, explicit capability requirements, retry policies, timeouts, checkpoints and human gates. Visual editors may generate the same definitions. Pin running workflows to a revision, support cancellation and compensation where possible. Use outbox/idempotency keys for side effects; document provider-specific delivery semantics. Agents may propose listener/workflow changes; activation requires applicable authorization.

## 10. Applications

Unify artifacts, Code Builder projects, embedded widgets and installable apps under a versioned application manifest. Declare renderer, entrypoint, artifact hashes, storage, capabilities, network policy, migrations and export format. Support declarative UI and sandboxed web apps initially; split panels, app-first chat, canvases and windowed shells are presentation adapters. Default apps may have tenant-owned extensions or forks without granting access to platform internals.

Generated code is untrusted. Isolate app origins and storage, validate host bridge messages, constrain CSP/network, prohibit ambient credentials, and require explicit permission for external side effects. Preview is not publication. Keep public sharing disabled pending its independent security gate. Support revision rollback, compatible migrations, source export and license/provenance records; do not promise universal portability where external dependencies prevent it.

## 11. Governed self-improvement

Agents may propose extensions, tools, prompts and workflow changes as immutable candidates. Decision Plane evaluates evidence with independent checks, signed or hashed provenance, holdout tests where applicable, canary limits, human approval where required and rollback. Candidates cannot grant themselves capabilities, modify enforcement, select their own trusted evaluator, or auto-promote on historical replay scores. Research verification must preserve the distinction between a verified artifact and a broader scientific claim. No self-modification of security policy at runtime.

## 12. Security and operational invariants

- Deny by default; effective authority is the intersection of initiator delegation, agent revision, workspace policy, resource permissions and runtime capability.
- No cross-tenant access, ambient service-role authority, shared secrets, implicit host execution fallback or privilege escalation through delegation.
- All control-plane mutations have authorization checks and audit records; all compute leases have expiry, fencing and revocation.
- Bound tokens, runtime, storage, network, concurrency and spend at tenant/task levels; stop admission on exhausted budget.
- Correlate tenant, task, run, attempt, lease, event and receipt IDs; redact secrets and minimize PII. Provide operational inspection, incident response, retention/deletion and export.
- Default-off feature gates, staged rollout, rollback procedures and kill switches. A passing mocked test is not provider qualification.

## 13. Dependency-ordered delivery

P0 / AP0: repository evidence and consolidation. Pin main SHA, inventory routes/schemas/contracts/flags/open PRs, trace trust boundaries, record reuse/extend/retire decisions, resolve overlaps, and reconcile existing qualification gates. No runtime code required.
P1 / AP1: resource identity and actor contracts, versioned definitions, durable mailbox/session state and delegation policies. No autonomous extensions. Depends on P0.
P2 / AP2: logical workspace resource namespace, revision and permission APIs. Depends on P0 and shared identity contracts.
P3 / AP3: conversation projection, run linkage, approval inbox and receipts. Depends on P1 identity and existing run store; filesystem integration uses P2.
P4 / AP4: listeners and workflows using existing Trigger.dev; depends on P1 and P3 approval boundaries.
P5 / AP5: application manifest, private install/preview/export and renderer isolation; depends on P2 and P3.
P6 / AP6: many-to-many compute scheduler and sandbox pools; depends on P1, P2 and verified Account Compute/native execution qualification.
P7 / AP7: governed extension improvement; depends on P1–P6 as applicable and Decision Plane evidence gates.
P2 and P3 can proceed in bounded parallel after identity contracts stabilize; no calendar commitments inferred.

## 14. Acceptance and release gates

Every phase requires a contract inventory, threat model, migration/backfill and rollback plan, unit/contract tests, integration evidence, review and explicit enablement decision. Required negative tests include cross-tenant access, revoked membership, stale lease replay, duplicate events, crash recovery, cancellation races, path escapes, approval replay, secret leakage and quota exhaustion. Use disposable PostgreSQL and independent connections for locking/fencing tests, then real isolated provider environments and physical-device tests for native features. Record tested commit, environment, exact commands, results and unresolved limitations.

First end-to-end product pilot: synthetic accounting engagement, authorized document ingestion -> durable task -> specialized review agent -> private app/report -> human approval -> receipt/export. Demonstrate disconnect/reconnect, retry without duplicate external effects, tenant isolation, evidence trace and user-owned source export. No real client data or regulated production use until separate privacy/compliance and security gates pass. Measure completion, review time, cost per engagement, duplicate effects, recovery success and denied-access coverage; establish baselines before numerical SLOs.

## 15. Alternatives and open decisions

Alternatives: keep only chat-centric orchestration (simpler but weaker durable identity); use a single mega-agent (useful as UX, not a universal authority model); replace Trigger.dev immediately (unjustified migration); build a global POSIX filesystem first (premature consistency and security complexity). Retain hybrid actors plus durable workflows and logical resource APIs.

Open ADRs: actor persistence/backend and mailbox semantics; canonical identity and resource scope mapping; filesystem consistency/storage; workflow definition format and version migration; approval policy and external-effect reconciliation; app packaging and renderer trust; placement/cost model; tenant deletion/export. Assign owners and acceptance criteria in AP0. No assumption of vendor adoption, public sharing, production enablement, legal compliance or release date.

## 16. RFC acceptance

Approve the architecture only after maintainers review the boundaries, reconcile current branches and verify the dependency graph. Acceptance authorizes separately scoped implementation planning, not immediate production activation. This PR is documentation only; no migrations, flags, secrets, dependencies or runtime changes.
