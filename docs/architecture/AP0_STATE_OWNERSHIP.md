# AP0.3 — Canonical state ownership

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Single authoritative owner per resource

Logical ownership below is a proposed write-boundary contract, not a claim of existing schema. Existing sources must be mapped before migrations; no duplicate stores merely to match naming.

| Resource | Authoritative service / existing anchor | Writer and consistency |
|---|---|---|
| Human identity | Clerk + verified account mapping | Identity service; stable issuer/subject mapping; deny ambiguity |
| Workspace membership | Supabase workspaces/workspace_members; workspaceAccess.ts | Workspace administration; accepted membership and policy revision |
| Agent definition/revision | AP1 definition registry | Authorized maintainer; append immutable revision; approval separate |
| Agent instance/mailbox/session | AP1 actor store | Fenced instance writer; durable inbox idempotency and checkpoint CAS |
| Task/run/attempt | Durable coordinator; conversation_runs / continuity contracts | Single run transition writer; journal and state transaction, attempt IDs separate |
| Human conversation | Existing conversation/message store | Owner-authorized publication; conversation not agent checkpoint |
| Workspace interactive session | unifiedSession store | Control-generation CAS, owner/human handoff; separate from actor session |
| Compute resource/lease | Account Compute reservation and guest leases; ExecutionRuntime | Authoritative lifecycle CAS; provider IDs external refs; lock VM -> guest -> lease |
| Workspace file/revision | AP2 logical namespace; existing object stores/repo refs | ACL and version preconditions; immutable content hash, atomic publish |
| Evidence/memory | Existing scoped memory and acquisition/research stores | Source authorization, provenance; derived summary never overwrites evidence |
| Approval / effect receipt | Existing durableApprovalStore extended in AP3 | Scoped atomic resolution; separate receipt records and ambiguous outcome state |
| Workflow/listener/event | AP4 durable registry, Trigger execution | Version pins and event dedupe; queue is delivery, not authoritative intent |
| App/installation | AP5 manifest and installation registry; Code Builder builds | Versioned artifact, permissions and rollback; preview not publication |
| Budget reservation/usage | Proposed admission ledger; existing budget/credit services | Transactional hold, consume/release once, append usage and reconcile |
| Credential reference | Native credential broker / authorized server connection service | Secret stays with issuer; revocation and lease scoped; no secret copy into actor state |

## State transition rules

1. Commands include verified scope, expected version, operation/idempotency key and correlation IDs. Distinguish generation (fence), logical resource ID and provider ID.
2. Atomically commit state+journal or state+outbox where possible. Worker acknowledges only after durable checkpoint; events delivered at least once, dedup by logical key. No exactly-once external effects claim.
3. Derived UI, cache, model output, Trigger metadata and provider observation cannot independently mutate authoritative state. Reconcile discrepancies; quarantine orphaned or ambiguous operations.
4. Terminal results immutable except separately audited reconciliation or superseding revision; no stale writer resurrection. Revoke grants, rotate fences, stop new admission, verify provider termination.
5. Retention and deletion cover source records, derived indexes, backups and credentials; export authorized artifacts with provenance. Tenant boundary persists through restore.

AP1.0 ADR must map principal/account/workspace identity. AP1.3/4 prove concurrent claim/checkpoint/replay. AP2/AP3 reconcile existing tables, no migration until owner, rollback and backfill accepted.
