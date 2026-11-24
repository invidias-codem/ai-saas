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


## AP0.4 — semantic source audit, pass 2

Pinned baseline unchanged. Reopened original audit, vision, proxy, exact source and relevant helpers. 27 additional distinct route files reviewed, 44/186 cumulative bounded reviews, 142 route files not yet reviewed. Method rows below group verbs; source-local evidence only, not full call-graph or negative-test qualification. Existing severity labels are candidates, not CVSS or live exposure claims.

| Route under app/api/ | Methods | Source evidence (line numbers at baseline) | Follow-up |
|---|---|---|---|
| workspaces/route.ts | GET/POST | requireAuth; rate limit; owner filter; validates operating-profile ownership (79–201) | Trace membership initialization transaction and tests |
| workspaces/[workspaceId]/repos/route.ts | GET/POST/DELETE | Clerk; owner-only helper (8–38); permission parameter unused | Retain stricter owner-only until role policy reviewed |
| workspaces/[workspaceId]/ingest/route.ts | POST | Clerk; workspace owner filter (14–37) | Trace vector insertion and payload limits |
| workspaces/[workspaceId]/search/route.ts | POST | Clerk; workspace owner check before RPC (10–46) | Verify RPC scope and cost controls |
| workspaces/default/route.ts | GET | requireAuth and rate limit (10–12) | Trace default helper |
| conversations/[id]/route.ts | GET/PATCH/DELETE | requireAuth/rate limit; ownership check before operations (33–246) | Review mutation scope/CAS and message reads |
| conversations/route.ts | GET | requireAuth/rate limit (11–15) | Trace list helper |
| conversations/new/route.ts | POST | requireAuth; caller-provided workspace/profile persisted using service role (41–71) | F-06 |
| conversations/vault/route.ts | GET | requireAuth/rate limit (20–23) | Trace vault query |
| memory/[id]/route.ts | DELETE/PATCH | Clerk; userId passed to deleteMemory/updateMemory (11–46) | Trace store predicates |
| memory/delete/route.ts | POST | requireAuth/rate limit; user-scoped Firebase path (29–36) | Review retention and other stores |
| memory/scope/route.ts | POST | requireAuth; requireOwnership; subsequent update by id (55–61) | Validate allowed scope and atomic owner predicate |
| memory/sync/route.ts | POST | requireAuth/rate limit; conversation format only before asynchronous fetch (17–89) | F-07 |
| memory/cli/route.ts | GET/POST | shared bearer token; request supplies user identity (6–63) | F-08 |
| cli/stream/route.ts | GET | shared bearer; request supplies user identity; CLI workspace (43–79,182–185) | F-08; trace resume ownership |
| operating-profiles/route.ts | GET/POST | requireAuth/rate limit; user-scoped list and insert (37–131) | Verify default profile constraints |
| operating-profiles/default/route.ts | GET | requireAuth/rate limit (10–12) | Trace helper |
| storage/sign/route.ts | POST | Clerk/rate limit; user-prefixed generated object path (33–39,105–111) | Verify signed URL expiry, MIME and size limits |
| export/route.ts | POST | Clerk (13) | Trace export helpers and scope |
| documents/[id]/preview/route.ts | GET | requireAuth; owner equality after document lookup (38–47) | Trace getDocument and shared-workspace policy |
| files/preview/route.ts | GET/POST | GET fetches request URL before validation (95–126); proxy auth only | F-09 |
| settings/keys/route.ts | GET/POST/DELETE | Clerk; validates provider key (73–119) | Trace encryption, storage, redaction |
| settings/partner-keys/route.ts | GET/POST/DELETE | Clerk; workspace create/revoke permission; user-filtered list (24–148) | F-11; key lifecycle and scope delegation |
| integrations/github/execute/route.ts | POST | Clerk; caller-owned Firebase integration; direct GitHub writes (18–90) | Review manual vs delegated action approval; explicit branch binding before actor exposure |
| v1/tasks/[taskId]/promote/route.ts | POST | partner stream:read scope; workspace equality; separate status read and mutations (21–204) | F-10 |
| relay/trigger/route.ts | POST | requireAuth/rate limit; caller user_id insert (13–34) | Trace command scope and runner authorization |
| relay/exchange/route.ts | POST | userId derived from returned session (52–85) | Trace token exchange, issuer and expiry |

### Middleware and database authority

- proxy.ts explicitly treats workspaces, conversation APIs, CLI memory/stream and partner v1 as public for Clerk middleware purposes. The handler must independently authenticate/authorize; public classification alone is not a defect. F-01 workspace GET lacks route-local membership and identity check, and middleware does not protect it. No deployed probe performed.
- lib/supabaseClient.ts:20–41 chooses service-role key for server-side default client when configured; RLS cannot be assumed even for imports named supabase rather than supabaseAdmin. Trace each call against its effective credential.
- lib/api/partnerAuth.ts:110–175 verifies stored key hash, revocation, expiry, required scope and rate limit; returns stored user/workspace, not caller-selected identity. No current membership check observed in this helper. lib/api/partnerKeys.ts:73–80 contains read/write scope vocabulary but no dedicated promotion permission.
- lib/memory/vectorStore.ts:55–75 filters by passed userId; 89–140 stores normalized passed userId. This is useful enforcement only when upstream identity is trusted.

### Additional source findings

| ID | Priority candidate | Evidence / consequence | Required acceptance |
|---|---|---|---|
| F-06 | High | app/api/conversations/new/route.ts:41–71 inserts request-supplied workspace and operating profile IDs without route-local membership or profile ownership validation. DB constraints/triggers and downstream effects need verification. | Resolve authorized workspace/profile server-side, deny foreign/mismatched IDs, no persisted invalid association. |
| F-07 | High | app/api/memory/sync/route.ts:27–43,75–105 validates conversation ID format, then background fetch filters by conversation ID alone; default server Supabase client may use service role. Potential unauthorized source read/derived memory contamination. | Owner/workspace authorization before scheduling and at execution; scope source query; durable job admission, negative read/write tests. |
| F-08 | High | app/api/memory/cli/route.ts:6–63 and app/api/cli/stream/route.ts:43–79 use shared bearer credential and request-selected user identity. Credential holder is not bound to a verified user scope; privileged service use must be explicitly distinguished. | Replace with per-subject or narrowly scoped service credentials; bind user/workspace, revocation/expiry; deny cross-user read/write/resume; no default pseudo-user for personal state. |
| F-09 | High | app/api/files/preview/route.ts:95–126 fetches caller-supplied URL and buffers response before file validation, no route-local URL/redirect safety checks observed. SSRF/resource-exhaustion risk; proxy authentication is not egress authorization. | Authorized object references or centralized SSRF-safe fetch with DNS/redirect checks, bounded bytes/time, negative tests; no internal network request. |
| F-10 | High | app/api/v1/tasks/[taskId]/promote/route.ts:21–90,174–204 accepts stream:read for promotion mutation; status read, approval insertion and status update are separate. Existing key scopes lack promotion action. | Dedicated human or explicitly authorized promotion capability, current membership, exact artifact/action digest, transaction/CAS and replay denial. Trace artifact fetch and integrity separately. |
| F-11 | High for delegated operations | lib/api/partnerAuth.ts:110–175 checks key state but not current user/workspace membership. settings/partner-keys checks permission at issuance/revocation. Revoked membership may leave a still-active key unless other lifecycle enforcement exists; not yet traced. | Define service vs user-bound keys; revalidate membership or atomic revocation propagation, test after membership removal, expiry, key revocation. |

F-01 strengthened from source by proxy review; F-02/F-03 remain open. F-04/F-05 remain future actor boundaries. Additional review candidates (not confirmed findings): direct GitHub write path must distinguish human vs autonomous grant and bind explicit branch; task promotion artifact fetch must verify provenance; source/embedding RPC and memory scope vocabulary need reconciliation. No exploit attempts, credential access, live production calls or runtime edits.

### Migration source review (not application)

| Migration | Observed source | Verification still required |
|---|---|---|
| 20260426000001_workspace_first_slice.sql | workspace ownership text, user/slug uniqueness, workspace_state foreign key, conversation workspace FK | Verify profile/workspace composite ownership or trigger constraints; FK alone does not prove membership |
| 20260620000000_workspace_members_audit_primitives.sql | workspace+user unique membership, own-row RLS using auth.uid()::text | Map Clerk subjects to JWT; test active/revoked memberships |
| 20261109000000_conversation_continuity.sql | owner-scoped idempotency and service-only grants; comment explicitly distinguishes Clerk and auth.uid() | Verify service caller scope and transactional run+event transitions |
| 20261113000000_account_compute_vms.sql | unique account owner, service RPC, owner read RLS auth.uid()::text | Reconcile identity strategy with continuity; test direct authenticated access and two-connection claims |
| 20261113000001_account_compute_guest_leases.sql | owner/workspace uniqueness, fenced lease, row locks | Apply migrations in disposable DB; validate permissions, expiry and lock-order races |

Five migration files re-read (source only; some overlap previous audit). No claim that all 132 are semantically reviewed, applied, or currently deployed. No migration execution. Remaining source audit: unreviewed routes, transitive helpers/RPCs, per-method negative tests, flags, migration ledger and disposable database qualification. AP0 remains open.


## AP0.4 — semantic audit pass 3 and parallel security work

Baseline remains `80c49ad6c6c01f6f665b839695b6f26135041a54`. 16 additional distinct route files, cumulative 60/186 bounded route reviews (126 outstanding). Source-level method grouping, not complete transitive audit or live qualification. Reviewed shared cronAuth and slackVerification. No external service calls, real payments, credential reads or exploit tests.

| Route under app/api/ | Methods | Source evidence (baseline lines) | Follow-up |
|---|---|---|---|
| integrations/slack/events/route.ts | GET/POST | POST verifies signature before processing (1223–1242); retry logs not durable dedup (1316–1407) | F-12; trace workspace authorization and GET health response |
| integrations/slack/command/route.ts | POST | requireSlackSignature before retry processing (526–612); idempotency metadata | F-12 |
| integrations/slack/interactivity/route.ts | GET/POST | signature verified (1056–1072); retry continues (1131–1166) | F-12; trace approval action authority |
| integrations/telegram/webhook/route.ts | POST | bot token configuration, incoming body parsing and chat identity check (76–160); no provider request authentication observed | F-13 |
| webhooks/stripe/route.ts | POST | configured secret; SDK constructEvent before effects (95–111) | Trace idempotency and account binding |
| webhooks/github/route.ts | POST | HMAC validation before processing (31–43); installation lookup (76–114) | Trace provider delivery idempotency and middleware reachability |
| webhooks/clerk/route.ts | POST | Svix verification (36–65); welcome credit upsert and deletion update (83–132) | Trace audit dedup and failure reconciliation; middleware reachability |
| webhooks/paypal/route.ts | POST | body identifier equality check (62–67); payment insert then credit RPC (90–131) | F-14/F-15; no live exposure asserted |
| webhooks/kofi/route.ts | POST | configured shared token (85–96); read-before-effect, ledger RPC and later marker (106–208) | F-15 |
| webhooks/vercel-logs/route.ts | POST | query secret equality (19–23); raw log metadata stored (29–46) | F-16 |
| cron/archive-sweep/route.ts | GET | requireCronAuth before state queries (6–8); dispatch follows state update (37–42) | Trace failed dispatch and reclaim |
| cron/error-resolution/route.ts | GET | requireCronAuth (19–21) before redundant secret logic (23–44) | Shared helper fails closed; remove misleading fallback comments |
| cron/vectorization-drain/route.ts | POST | requireCronAuth (46–47) | Trace worker claim/limits |
| cron/refinery/route.ts | POST | requireCronAuth (58–59); pending status read/update/RPC | Trace concurrent claims |
| integrations/github/callback/route.ts | GET | Clerk auth and saved state comparison/deletion (9–46) | Trace session binding/token storage |
| integrations/slack/callback/route.ts | GET | stateless signed state timestamp (29–60), token exchange and integration RPC (63–102) | F-17 |

### Additional findings / priorities

| ID | Priority candidate | Source evidence and impact | Required acceptance |
|---|---|---|---|
| F-12 | High before durable integration | Slack event/command/interactivity handlers verify signatures and log retries but explicitly defer durable deduplication. lib/slack/slackVerification.ts:22–56 checks signature and timestamp; this alone is not a durable claim. | Durable delivery claim, bounded retries, authorization before effect; duplicate and concurrent delivery negative tests. |
| F-13 | Urgent | Telegram webhook POST lacks observed provider request authentication; chat identity is taken from incoming update; handler has privileged administrative operations. Raw body logging also creates sensitive-data exposure risk. Proxy treats this route as public. | Verify provider authenticity before parsing/side effects; validate authorized actor, fail closed if missing configuration; redact logs, dedup updates; invalid/missing signature has no effects. Independently verify actual deployment reachability. |
| F-14 | Urgent | PayPal webhook compares a body identifier to configured webhook ID, without observed cryptographic/provider verification before credit mutation. Proxy does not explicitly exempt PayPal; reachability and configuration unknown. | Verify authentic provider event and expected payment status, merchant, currency and amount before writes; invalid or unverified events have no effects. |
| F-15 | High | PayPal records payment before ledger RPC; Ko-fi checks existence then performs credit/subscription updates before later marker. No route-local atomic transaction across effects; RPC internal dedup semantics not yet traced. Risks include lost credits or duplicate effects under failure/concurrency. | Inspect ledger RPC and uniqueness; transactional idempotent state machine; concurrent/retry/partial failure tests; reconciliation for existing unmatched records. No real payments in tests. |
| F-16 | High review | Vercel log webhook accepts query-secret authentication and persists raw metadata for downstream resolution; shared cronAuth also allows query-secret fallback. URL credentials may leak through logging; untrusted log data must never be execution authority. | Header authentication, rotation and redaction plan, schema/size limits and downstream admission verification; compatibility review before removing query fallback. |
| F-17 | High before connection expansion | Slack callback uses stateless signed state, age check, token exchange, and upsert; no observed single-use state consumption or browser-bound nonce. Issuance and provider code semantics still to trace. | Strict finite timestamp bounds, one-time state tied to initiating session and intended install, replay rejection and correct team/owner binding. |

The cron helper fails closed when configured secrets are absent (lib/security/cronAuth.ts:36–67); do not misclassify the later error-resolution comment as a reachable bypass. Stripe/GitHub/Clerk signature mechanisms are positive source observations, not complete payment/integration qualifications.

### Parallel remediation

S1 draft PR [#534](https://github.com/invidias-codem/ai-saas/pull/534), commit `2ce9b60a884894dba7b632850f1b035ff4de3712`, directly against pinned main: F-01 workspace reads gated by current membership/owner access and path binding, F-02 owner-only harness routes with payload validation, F-06 explicit workspace/profile ownership checks. 13 mocked regression cases authored; no local execution; CI and independent review required. Cloud grant metadata is not native OS consent; live DB/RLS and races remain open. Existing CLI workspace lookup needs authenticated identity; shared conversation creation remains separate policy. Do not mark findings closed until reviewed/qualified and merged. S2 approval/promotion, S3 memory/CLI, S4 network, S5 credentials and S6 durable execution remain open. Prioritize separate Telegram/provider-payment security review in parallel with S2. No runtime changes on AP0 branch.
