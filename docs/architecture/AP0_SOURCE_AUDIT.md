# AP0.3 — Semantic source audit (bounded first pass)

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Coverage and method

AP0_ACCEPTANCE_EVIDENCE.md enumerates 186 app/api route files, 132 migration SQL files and 179 JS/TS test paths under test directories. This pass directly fetched the following route files at pinned main; it is not exhaustive, not a live exploit test, and not proof of deployed config. Test paths below are candidate coverage, not claim of exercised route or assertion. Unknown remains open.

| Route (app/api/) | Observed identity / scope / flag | Candidate verification or gap |
|---|---|---|
| workspaces/[workspaceId]/route.ts GET | service-role lookup by requested workspace ID; no route-local auth or membership check | F-01; inspect middleware and negative cross-tenant read |
| workspaces/[workspaceId]/route.ts PATCH | Clerk and owner check before update; update by workspace ID | owner-scoped mutation/recheck test |
| workspaces/[workspaceId]/harness/grants/route.ts GET/POST | Clerk; read filters user+workspace; POST writes supplied workspace/path flags without route-local membership check | F-02; validate workspace role and native enforcement |
| workspaces/[workspaceId]/sources/query/route.ts POST | Clerk owner filter before embedding/RPC | workspace-access and source RPC scope coverage |
| workspaces/[workspaceId]/sources/ingest/route.ts POST | Clerk and user_id filter | review write/rollback and source ACL |
| account/compute/route.ts GET/POST | requireAuth; rate limit; ENABLE_ACCOUNT_COMPUTE | account-compute-reservation/flag contracts |
| account/compute/guest/route.ts POST | requireAuth, rate limit, admitWorkspace, caller VM ready; three flags + nonmock provider required | account-compute-guest/durable-leases/rootless contracts; live qualification absent |
| approval/resume/route.ts POST | requireAuth but approval mutation precedes owner check | F-03; atomic owner+expiry and current permission tests |
| conversations/[id]/runs/route.ts GET | requireAuth, UUID validation, owner-scoped read, ENABLE_CONVERSATION_CONTINUITY | conversation-continuity contract; worker not qualified |
| preview/sandbox/route.ts GET/POST | Clerk, ENABLE_PREVIEW_SANDBOX; owner filter on read | preview adapter admission and activation contracts |
| preview/sandbox/[id]/route.ts GET/DELETE | Clerk and sandbox flag; adapter ownership enforcement to verify | cross-owner delete/lookup and cleanup |
| preview/share/route.ts POST | Clerk; isPreviewSharingSafe; createShareLink receives user ID | preview-ingress contract, #479 |
| preview/share/[shareId]/route.ts GET | Clerk; isPreviewSharingSafe; resolveShareLink receives user ID | direct ingress denial, #479 |
| code-builder/build/[buildId]/events/route.ts GET | Trigger config; requireAuth; owner check before subscription | ownership, reconcile terminal writer and reconnect |
| code-builder/build/[buildId]/route.ts GET | requireAuth; owner equality before result | foreign build 404 |
| relay/poll/route.ts GET | requireAuth; rate limit; owner-filtered reads; test-only bypass | auth-hardening contract; claim ownership recheck |
| relay/result/route.ts POST | requireAuth; rate limit; owner filter; test-only bypass | auth-hardening contract; no success for foreign update |
| webhooks/apify/route.ts POST | dedicated secret fail-closed, schema, operation-key dispatch | acquisition-apify-webhook/ingestion contracts; dispatch-null response semantics review |

17 distinct route files sampled (18 method rows); counting route files, not exhaustive per-method review. Remaining routes require inventory and checks. Other direct reads: lib/security/apiAuth.ts, workspaceAccess.ts, lib/ucol/continuity/contracts.ts, capabilityManifest.ts, lib/execution/durableApprovalStore.ts, lib/trigger/dispatch.ts, lib/budget/redisKillSwitch.ts, ExecutionRuntime, unifiedSession contracts. See prior evidence for source SQL; no live migration verification performed here.

## Findings requiring separate hardening

| ID | Severity candidate | Source-level issue | Acceptance |
|---|---|---|---|
| F-01 | High | Workspace GET lacks route-local auth/ACL around service-role query. Global middleware may authenticate but does not establish per-workspace authorization; deployed exposure unverified. | Server-derived caller, accepted membership/owner, scoped query, uniform denial, anonymous/foreign/override negative tests. |
| F-02 | High | Harness grant POST lacks route-local workspace membership/role authorization; request can supply path and destructive flags. Native downstream enforcement and DB constraints not yet traced. | Enforce workspace operation permission and verified native grant/consent; cross-tenant and destructive-policy denial with no insertion. |
| F-03 | High | Durable approval approve/deny transitions precede or omit owner checks; expiry not explicitly scoped on claim. | Atomic authenticated owner/scope/expiry + current action authorization; foreign/expired/replay tests and no state change. |
| F-04 | High for autonomous paid work | Redis budget check intentionally permits on unavailable/error and post-hoc spend cannot prevent concurrent overrun. | Hard reservation/admission and outage denial before paid actor use. |
| F-05 | High for persistent work | Agent dispatch catch returns null for inline fallback; uncertain dispatch may have been accepted. | Durable intent/operation key, reconciliation and single fenced owner before retry/fallback. |

Prioritize F-01–F-03 as existing runtime security remediation, independently reviewed; no claim of successful exploitation. F-04/F-05 are future actor integration blockers, not necessarily defects in current interactive policy. Do not silently alter behavior in AP0. Remaining semantic route/test/flag audit and disposable migration verification stay open; assign owners before acceptance. No production or secret changes.
