# AP0.3 — Unified authority matrix

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Decision

Reuse Clerk identity, workspaceAccess, UCOL delegation and capability manifest; do not create a parallel identity provider or a new blanket superuser. The policy contract is shared; enforcement remains at every resource boundary. Models propose, never authorize.

Effective permission = verified initiator and active delegation ∩ current workspace membership/role ∩ approved agent revision capabilities ∩ resource policy ∩ runtime capability ∩ action approval ∩ budget/admission constraints. All applicable checks must affirm; unknown, unavailable, stale, ambiguous or revoked denies. Inapplicable constraints require explicit policy, not absent values. No client-provided tenant/owner/role grants authority.

## Principal and grant contract (AP1.0 candidate, not DDL)

- Principal: typed human/service/agent ID, issuer, verified subject, tenant/account binding and status. Agent definition/revision/instance IDs are distinct. A service worker proves service identity and loads an authorized initiating principal; it cannot impersonate from queued JSON.
- Scope: tenant/account, workspace, resource type/id/revision, operation; private account-only scopes explicitly tagged, never null-as-global. Map Clerk subject vs DB JWT and shared workspace ownership before persistence.
- Grant: immutable ID, issuer, subject, parent grant, scope, allowed action vocabulary, policy revision, constraints, issued/not-before/expiry, revocation state/generation, maximum depth and spend. Child grant is strict subset or equal and no longer-lived; cumulative constraints preserved. No wildcard default, recursive cycles or self-issuance.
- Decision: allow/deny plus typed reason, observed policy versions, grant ID and correlation ID. No raw secret, prompt or private reasoning in logs. Trusted clock injected; reject invalid times; deny at expiry. Admission rechecked before sensitive read/write, grant renewal and external effect; stale decisions are not reusable bearer credentials.
- Mutation: bind approval to normalized action digest, resource revision, caller, scope, expiry and one-time nonce; consume atomically with authority where possible. Reconcile external outcomes before retry; approval alone is not success.

## Enforcement matrix

| Surface | Existing source | Required control / gate |
|---|---|---|
| Human HTTP | lib/security/apiAuth.ts; lib/security/workspaceAccess.ts | Authenticated subject, accepted membership, per-action resource check, owner-scoped queries; never client owner |
| UCOL / agent | lib/ucol/continuity/contracts.ts validateDelegation; lib/agents/core/capabilityManifest.ts | Extend typed scope/cap/budget validation; manifest is descriptive; check every tool execution |
| Trigger worker | lib/trigger/dispatch.ts; src/trigger/agentLoopTask.ts | Rehydrate durable grant and current authority; fenced writer, no ambiguous inline fallback |
| Account VM / guests | app/api/account/compute/guest/route.ts; account compute migrations | Account owner plus workspace admission plus runtime lease; distinguish account compute owner from workspace tenant; real provider required |
| Native host | docs/architecture/macos-desktop-foundation.md; credential broker | OS-owned local permission and command/path policy; no host fallback, no ambient secrets |
| Acquisition/webhooks | app/api/webhooks/apify/route.ts; lib/acquisition/durable/ingestion.ts | Authenticated source, persisted scope, dedup, bounded provider budget; event payload not authority |
| Files/memory | workspaceAccess; Neural Memory RFC | Recheck source/resource ACL, revision, retention; no unauthorized projection or training |
| Approval | app/api/approval/resume/route.ts; lib/execution/durableApprovalStore.ts | Current user/workspace/action and expiry enforced in atomic transition, scoped reads/denials; external receipt separate |
| App/preview | app/api/preview/share/route.ts; previewIngressPolicy | Isolated origin, bridge policy, scoped installation capabilities; #479 or verified successor remains independent |
| DB service role | supabase/migrations/20261113000000_account_compute_vms.sql | Explicit owner/scope server checks and least privilege; RLS is not protection from service role |

## Acceptance

AP1.0 pure tests: forged subject, foreign tenant/workspace, missing/expired/revoked grant, unknown action, mismatched revision, parent narrowing, invalid clock, recursion/depth, budget failure, disabled feature and deterministic decision. AP1.2 tests admission and execute-time revalidation; independent DB connections prove atomic denial under revocation. AP3 must harden existing approval path first. Source audit findings in AP0_SOURCE_AUDIT.md require separate remediation; no new active actor integrations before affected gates pass.
