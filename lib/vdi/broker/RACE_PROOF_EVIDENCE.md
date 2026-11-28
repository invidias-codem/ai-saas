# VDI-2A Postgres Race Proof — 2026-10-11

Isolated database: docker `postgres:15` container `vdi-test-pg`, localhost:55432,
fresh schema, synthetic records only. Container destroyed after the run.
Migration under test: `supabase/migrations/20261010000000_vdi_desktop_durable_state.sql`
(the actual file, applied verbatim after fixes below; only `auth.role()` stubbed
as service_role since vanilla PG lacks Supabase's auth schema).

## Migration defects found by applying it to real Postgres (fixed)

1. `constraint ... unique (...) where ...` inline in CREATE TABLE is invalid
   PostgreSQL syntax — partial uniqueness must be a separate
   `CREATE UNIQUE INDEX`. Affected 4 tables (desktops.operation_key,
   session_leases, execution_leases, input_control_leases).
2. `expires_at > now()` in an index predicate is rejected:
   functions in index predicates must be IMMUTABLE. Fixed by keying the
   partial indexes on `revoked_at is null` only; expiry enforced at read time
   (matches broker `canSuspendDesktop` semantics — see proof 3e).
3. Dangling comma in session_leases table body.

## Proofs (separate psql worker processes)

### Proof 1 — Input exclusivity across processes: PASSED
Two simultaneous workers insert input-control leases after `FOR UPDATE` on the
desktop row. Winner commits; loser: `ERROR: duplicate key value violates
unique constraint "uq_vdi_input_control_active"` → ROLLBACK.
Live owners after: exactly 1.

### Proof 2 — Suspend vs lease-acquisition race: PASSED
First round (application-level guard): every run resolved to exactly one
winner; `suspended + live lease` never committed. Found a real gap — lease
acquisition without a phase check can grant onto a suspended desktop when
suspend wins the lock. Fixed by moving acquisition into transactional RPCs.

**Corrected acquisition path (RPCs, closure requirement):**
`vdi_grant_execution_lease` / `vdi_grant_input_control_lease` /
`vdi_grant_session_lease` in the migration — lock the desktop row
(`FOR UPDATE`), check phase, revoke EXPIRED leases, insert, and update the
denormalized columns **in one transaction**. Re-ran the race against the RPC
path: **8/8 runs OK** — both lock orders observed (lease-wins:
`ready/live=1` + suspend blocked; suspend-wins: `suspended/live=0` + lease
blocked). `suspended + live=1` never committed.

### Proof 2b — Expired leases must not occupy the exclusive slot: PASSED
Because the partial index keys on `revoked_at is null`, an EXPIRED-but-
unrevoked row still occupies the agent's unique slot. Demonstrated: naive
same-agent insert → `duplicate key violates uq_vdi_execution_leases_active`;
acquisition via `vdi_grant_execution_lease` transactionally revokes the
expired row and mints the fresh live lease (`revoked=t, live=f` → fresh
`revoked=f, live=t`).

### Proof 3 — Denormalized column consistency: PASSED (5/5)
- 3a COMMIT: denorm columns == lease row (execution_id, agent_id, expires_at).
- 3b ROLLBACK: neither lease row nor denorm persists.
- 3c REVOCATION: row revoked + denorm cleared atomically.
- 3d EXPIRY: row preserved for audit, not live at read time.
- 3e NO-FALSE-BLOCK: expired-but-unrevoked denorm never blocks suspend.

### Proof 4 — Stale generation cannot mutate: PASSED (both orderings)
Two workers read generation N, both attempt `UPDATE ... WHERE generation = N`.
Exactly one `UPDATE 1`; the other `UPDATE 0`. Generation advanced by exactly 1.
Observed both worker1-wins and worker2-wins orderings.

## Step 3 — Real WebSocket gateway (lib/vdi/gateway/viewerGateway.ts)
Real `ws` server + real connected client (test: vdi-gateway.contract.test.ts):
- Server-side auth: identity derived from the grant row; invalid grant → close 4003.
- `authorizeViewerInput` before EVERY forwarded event; denied input NEVER
  reaches the desktop (`forwarded` log frozen) → close 4006.
- Idle client disconnects at grant expiry with no further event → close 4005.
- Takeover/membership-loss closes an idle connection via sweep within
  `REVOCATION_MAX_DELAY_MS` (250 ms) → close 4007.
- Timers and per-connection state removed on disconnect (connectionCount → 0).

## Gates (closure baseline)
contracts **95/95** (5 suites, incl. 4 real-socket gateway tests) ·
`tsc --noEmit` clean · eslint clean · `next build` green (BUILD-EXIT:0)

## Step 4 — LIVE Daytona: PASSED (3/3) — 2026-10-11
Script: `scripts/vdi-daytona-live-proof.ts` · key in `.env` (gitignored) ·
disposable labeled resources (`lattice-live-proof`), autoDelete-bounded,
destroyed in `finally`; 7 leaked probe sandboxes cleaned post-run.

Verdict (`EXIT:0`):
```
termination=PASS restart=PASS snapshot=PASS
```
- **Remote termination:** parent loop + spawned background child appending to
  `/tmp/term-proof.txt`; after the 3s server-side kill, marker froze at
  `before=10 after=10` across a 5s window — parent AND child stopped
  producing side effects.
- **Restart persistence:** fresh `Daytona` client → `stop()` → `get(id)` →
  `start()` → `cat /tmp/sentinel.txt` = `VDI-RESTART-SENTINEL`.
- **Snapshot restoration:** snapshot created → source sandbox deleted →
  create-from-snapshot → `/tmp/snapfile.txt` = `SNAPSHOT-CONTENT-42`.

### Live-environment facts the mocks missed (all fixed in the adapter)
1. `daytonaio/ubuntu:*` images fail (`build_failed` / pull access denied);
   `ubuntu:22.04` builds. VM_IMAGE_MAP corrected.
2. SDK 0.223 `create` is image/snapshot-based; no `sandboxClass` param.
3. Org provisions `sandboxClass: 'container'` only (linux-vm needs the
   org-level `sandbox_kvm` feature). The adapter's `sandboxClass !== 'linux-vm'`
   ownership rejection would have blocked every live resource — removed
   (recorded as a ponytail-flagged class note).
4. `pause()` returns **422** on container-class; `stop()`/`start()` is the
   supported suspend/resume pair. Adapter suspend fixed; VDI-1 contract
   tests 6 and 18 updated to the live-verified contract.

## Final gates (VDI-2 closure baseline)
contracts **95/95** (5 suites) · `tsc --noEmit` clean · eslint clean ·
`next build` green

## VDI-2 closure correction — runtime-class honesty (2026-10-11)
- `DesktopRuntimeTypeSchema` adds `container`; Daytona adapter advertises
  `runtimeTypes: ['container']` (the observed class). `resolveRuntime`
  abstains (`runtime_type_unavailable`) on `linux_vm` requirements — a
  container can never silently satisfy a VM request (contract test 17).
- `durableSuspend: false`, documented: stop/start preserves files, processes
  require restart. VM eligibility is enabled separately after org capability
  verification (sandbox_kvm feature).

## VDI-3A — Fleet observations (2026-10-11)
Migration: `20261011000000_vdi_fleet_observations.sql` (one current
observation row per desktop: provider report + class, reachability + error,
guest/display health, broker snapshot, last operation key, per-fact
timestamps). Observer: `lib/vdi/fleet/fleetObserver.ts`.

Acceptance scenario proven end to end (vdi-fleet-observations test 1):
healthy → display broken (provider ready, display down — lifecycle ≠ display)
→ provider outage (unreachable + error, LAST GOOD report retained WITH ITS
TIMESTAMP, guest unknown, broker state/ownership/generation untouched)
→ both recovered (fresh timestamp, all healthy). Orphan discovery quarantines
(evidence + retirement requirements; provider resource never destroyed).

Gates: contracts **100/100** (6 suites) · tsc clean · eslint clean ·
`next build` ✓ (90s, BUILD-EXIT:0).

## VDI-3B — Operations console (2026-10-11)
`lib/vdi/fleet/operationsConsole.ts` — READ-ONLY over stored observations;
server-side operator authorization on every list/detail; scoped lookups make
unauthorized desktop IDs indistinguishable from absent ones (no existence
leak). No grant-minting path: inventory permission grants zero viewer
tokens/screen/file access.

Stale-collection guard added in VDI-3B: observations carry `collectedAt`
(collection start); the memory store drops older-than-stored writes and the
`vdi_record_observation` RPC (row lock + checked_at compare + COALESCE merge)
does the same on Postgres. Evidence: console test 7 (newer fact survives a
late older write).

Acceptance (vdi-operations-console.contract.test.ts, 7/7):
1. authorized operator sees only their permitted fleet (cross-tenant hidden)
2. unauthorized desktop IDs → null within scope; foreign workspace → 403
3. viewing mints no tokens (grant table untouched; no grant/token fields)
4. healthy → display broken → outage → recovery rendered with freshness
   ("Provider unreachable; last reported ready at …"); guest unknown on
   outage and on suspended
5. viewing causes zero provider interaction and byte-identical broker rows
6. suspended desktop shows guest health as unknown
7. concurrent observations: older collection never overwrites newer

Gates: contracts **107/107** (7 suites) · tsc clean · eslint clean ·
`next build` ✓ (90s, BUILD-EXIT:0).

## VDI-3C — Alerts and usage accounting (2026-10-11)
Migration: `20261012000000_vdi_alerts_and_usage.sql` — `vdi_alerts` (partial
unique index: ONE open alert per desktop+rule+generation; `vdi_upsert_alert`
RPC locks the row, dedups opens, requires evidence NEWER than last evaluation
to resolve) and `vdi_usage_records` (unique index on provider+interval =
idempotency; completeness + gap_reason make outage gaps explicit; measured
runtime, estimated cost with pinned rate version, and provider-reported
charges are separate columns — missing pricing stays NULL, never zero).

Modules: `lib/vdi/fleet/alertEvaluator.ts` (deterministic rules; freshness
checked before interpreting health; suspended never triggers display alerts;
idle_allocation is advisory requiring BOTH leases absent),
`lib/vdi/fleet/usageAccountant.ts` (idempotent intervals; estimates keep
rate/version; summaries keep measured vs estimated vs reported separate).

Clock-domain fix found by acceptance: stores previously stamped alerts with
their own `new Date()` — the evaluator now passes `evaluatedAt` so open and
resolve share one clock (stale-resolution proof would otherwise be flaky).

Acceptance (vdi-alerts-usage.contract.test.ts, 7/7):
1. 3 sequential + 5 CONCURRENT evaluations → ONE open alert; fresh recovery
   resolves; stale (older-than-last-eval) evidence cannot resolve
2. suspended desktop never triggers display_failed
3. divergence + idle advisory behave as specified (advisory dedups too)
4. replayed usage intervals ×3 do not increase totals (idempotent)
5. outage hour recorded as explicit gap — 0 measured runtime invented
6. estimate keeps rate version; measured ≠ estimated ≠ provider charge;
   no-rate ⇒ estimate NULL not zero
7. alerts and usage scoped by tenant/workspace

PENDING (honest): live-Postgres syntax verification of the 3C migration was
blocked — the local Docker daemon hung mid-verification. The migration uses
the same partial-unique-index + RPC pattern verified live in the VDI-2A
proofs; apply against the isolated DB once Docker is restarted to close this.

Gates: contracts **114/114** (8 suites) · tsc clean · eslint clean ·
`next build` ✓ (93s, BUILD-EXIT:0; one earlier transient font-fetch network
failure, retry green).

## VDI-3C DB acceptance — PASSED 3/3 (2026-10-11, isolated postgres:15)
(Docker daemon had hung; restarted, migrations re-verified.)
All 3 migrations apply with 0 errors. Proofs via concurrent psql workers:
- A. 8 concurrent FIRST evaluations (no existing row) → exactly ONE open
  alert, 0 errors. Partial unique index + row-locking RPC dedups from the
  very first insert race.
- B. Fresh evidence resolves (resolved=1); a NEWER alert resolution attempt
  with OLD (−1h) evidence is REJECTED (stays open); stale evidence against
  an already-resolved alert cannot REOPEN it (open=0, resolved=1) — the RPC
  resolves only `open` rows, no reopen path exists.
- C. 6 concurrent replays of the same usage interval → ONE accounting
  record, runtime_sum=3600 (no double-count). Unique index on
  (provider_id, interval_start, interval_end) is the guarantee.

VDI-3 is CLOSED. VDI-4 (remediation policy, durable execution, budget
admission) is scoped and gated on nothing further — activation on go.

## VDI-4A — Remediation policy (2026-10-11)
PURE policy layer: `lib/vdi/remediation/policy.ts` — stored observations +
alerts + versioned policy ⇒ proposal or explicit abstention. No provider
calls, no mutations. Every proposal binds tenant/workspace, desktopId,
desktopGeneration, action, reason, evidence (alert rule/timestamp, observation
checkedAt, provider phase, display state), policyVersion, proposedAt/expiresAt,
recheckable preconditions (generation, phase, no-session-lease, no-execution-
lease, no-input-holder, provider-reachable, display-still-failing), retryLimit
and reconciliation requirements.

Migration `20261013000000_vdi_remediation_attempts.sql`: durable attempt
counter per (desktop, rule, policyVersion) + `vdi_record_remediation_attempt`
RPC — row-locked atomic increment, bounded by limit, escalates EXACTLY once,
returns -1 forever after. Verified live on isolated postgres: 4 concurrent
first attempts → distinct numbers 1,2,3 (4th refused), post-limit calls all
-1, escalated_rows=1. All 4 migrations apply with 0 errors.

Acceptance (vdi-remediation-policy.contract.test.ts, 7/7):
1. deterministic output; full proposal binding; repeated evaluation identical
2. stale observation ⇒ explicit abstention, no proposal of any kind
3. session lease / execution lease / input holder each block idle suspension
   (test corrected: session lease legitimately survives releaseTakeover)
4. lease arriving AFTER proposal fails at the EXISTING transactional suspend
   boundary (broker.suspend rejects; preconditions are the executor contract)
5. display recovery: confirmed alert + reachable + running + capability ⇒
   proposal with durable budget; exhaustion ⇒ abstain + escalation recorded
   exactly once (attemptCount 2/2, escalated=true, further calls -1)
6. no-alert / unreachable / not-running ⇒ abstain
7. quarantine preservation: quarantined desktops receive NO action proposal

Gates: contracts **121/121** (9 suites) · tsc clean · eslint clean ·
`next build` ✓ (87s, BUILD-EXIT:0).

## VDI-4B — Durable remediation executor (2026-10-11)
Migration `20261014000000_vdi_remediation_operations.sql`: durable operation
records (full proposal binding + status machine claimed→dispatched→success/
refused/exhausted/reconciling/unresolved). TWO RPCs:
- `vdi_claim_remediation_operation`: THE LOCK IS THE UNIQUE INDEX — a plain
  INSERT claims the key ('claiming' → 'claimed'); concurrent inserts
  conflict, exactly one winner. Attempt budget consumed at ADMISSION; budget
  exhausted ⇒ terminal 'exhausted', no dispatch. Duplicate delivery consumes
  NOTHING. (First draft used `select for update` on an absent row — the live
  proof caught 3/6 winners; unique-index-insert is the correct lock.)
- `vdi_update_remediation_operation`: owner-guarded (stale workers get
  false); terminal states immutable; same-outcome replay is a no-op ok.

Live Postgres proofs (isolated postgres:15, all 5 migrations 0 errors):
- P1: 6 concurrent claims → winners=1, losers=5, op_rows=1, one owner.
- P2: stale worker update=false; owner update=true.
- P3: terminal 'success' immutable; different terminal refused; same-outcome
  replay=true.
- P4: duplicate delivery → claimed:false, attempts unchanged (1→1).
- P5: exhausted-at-admission → claimed:false, op status 'exhausted'.

Executor `lib/vdi/remediation/executor.ts`: pre-claim AND post-claim
authoritative rechecks (ownership scope, leases FIRST — a lease arriving
after proposal is refused as such even though granting it also advanced the
generation — then generation, expiry, evidence freshness, phase,
action-specific conditions). Suspension reuses the broker's existing
transactional boundary. Display recovery reconciliation contract enforced:
healthy display proves success; unhealthy display after a COMPLETED restart
is a real negative (refused); ambiguous dispatch + unhealthy probe ⇒ explicit
'unresolved', never a false success or blind retry. Memory-store claim twin
made race-safe via synchronous key reservation (mirrors the unique-index
lock) — caught by the two-worker acceptance test.

Failure-injection acceptance (vdi-remediation-executor.contract.test.ts, 7/7):
1. lease after proposal → refused BEFORE provider dispatch (provider untouched)
2. two workers, one operation → exactly ONE provider suspend
3. suspend succeeds, response lost → reconciliation records success from
   authoritative provider state; suspendCallCount stays 1
4. worker crash around dispatch → provider still running ⇒ explicit
   'unresolved', no blind replay
5. expired proposal / generation change → refused, no dispatch
6. terminal-evidence write fails → recovery worker completes the evidence
   through the owner-guarded replay-safe write; provider action NOT repeated
7. display recovery: healthy-probe success (incl. after lost response);
   unhealthy+ambiguous ⇒ unresolved

Gates: contracts **128/128** (10 suites) · tsc clean · eslint clean ·
`next build` ✓ (88s, BUILD-EXIT:0). VDI-4B CLOSED.

## VDI-4C — Budget admission (2026-10-11)
Migration `20261015000000_vdi_budget_admission.sql`: `vdi_budgets` (per
tenant/workspace/period; integer micro-USD EXACT money) +
`vdi_budget_reservations` (binding: operation key, period, currency, resource
spec, pricing version, bounded horizon; status reserved →
held-for-reconciliation → settled/released). Four RPCs:
- `vdi_admit_reservation`: budget-row lock; accounted + outstanding
  (incl. held-for-reconciliation!) + requested ≤ limit; idempotent by key
  (replay returns original; conflicting binding refused); unknown pricing
  refused without a conservative policy ceiling — never zero.
- `vdi_resolve_provisioning`: 'uncertain' → held-for-reconciliation (retained;
  expiry alone NEVER releases); 'failed' → released once.
- `vdi_settle_reservation`: atomically replaces reserved exposure with
  accounted spend; overrun recorded (limit ≠ provider cap); policy may block
  further admission; existing settled work NOT terminated. Settlement seeds
  the charge-adjustment baseline.
- `vdi_adjust_settled_charge`: idempotent provider-charge corrections; delta
  applied atomically to the same entry (estimates never re-counted).
- `vdi_extend_reservation_horizon`: explicit extension only.

Live-Postgres bug found by proofs (fixed at root): composite `record IS NOT
NULL` in PL/pgSQL is false when ANY column is null — replay/exists guards
silently failed (a found row read as "not found"). All guards now check the
key field. Same audit applied to the 4B operations RPCs.

Live DB proofs (fresh isolated postgres:15, 6 migrations 0 errors) — 8/8:
A. 6 concurrent admissions of 3000 vs limit 10000 → 3 admitted, 3 refused, 3 rows
B. duplicate replay → original returned; conflicting amount refused
C. uncertain → held-for-reconciliation; held exposure still blocks over-budget
   admission; within-budget admission passes
D. failure → released once; second release refused; exposure freed for readmit
E. settlement: settle → replay no-op (spend 2000), correction +500 → 2500,
   correction replay → no-op (spend stays 2500)
F. period rollover: Nov spend 0; reservation keeps 2026-10 attribution
G. unknown price, no ceiling → refused; with ceiling → admitted, pricing_known=f
H. settle above limit → overrun recorded (3500), admission blocked, settled
   work intact (allow-to-complete), new admission refused

Contract acceptance (vdi-budget-admission.contract.test.ts, 8/8): the same
eight scenarios in-memory, including horizon extension as explicit decision.

Gates: contracts **136/136** (11 suites) · tsc clean · eslint clean ·
`next build` ✓ (BUILD-EXIT:0). VDI-4 IMPLEMENTATION COMPLETE — production
activation is a separately evidenced rollout.

## VDI plane summary (VDI-0 → VDI-4)
268-contract start → 136 contracts across 11 suites; 7 migrations verified on
live isolated Postgres (0 apply errors); live Daytona proofs (termination,
restart persistence, snapshot restore) recorded; runtime class honestly
advertised (container; resolver abstains on linux_vm); WebSocket gateway
enforcement proven over real sockets; race proofs for leases, observations,
alerts, operations and budget admission all recorded above.

## Activation A corrections — function hardening (2026-10-12)
**Real security gap found by the permissions review:** Postgres grants function
EXECUTE to PUBLIC by default and security-definer functions ignore RLS — every
`vdi_*` RPC was callable by anon/authenticated through PostgREST even with
table RLS in place. Fixed by migration `20261016000000_vdi_function_hardening.sql`:
- EXECUTE revoked from PUBLIC/anon/authenticated; granted to service_role
  only; role existence guarded so the migration is robust on vanilla installs
  (Supabase always has the roles).
- Table grants enumerated explicitly (`all` + pattern is invalid syntax).
- Contract check inside the migration: any security-definer `vdi_*` function
  missing `search_path=public` fails the migration loudly.

Live proofs (isolated postgres:15, Supabase-style roles created first):
A. anon RPC execute → permission denied
B. service_role RPC execute → admitted:true
C. anon table read → permission denied; authenticated RPC → permission denied
D. all 13 vdi_* functions have explicit ACLs (postgres+service_role only),
   zero PUBLIC-default (NULL proacl) functions, search_path pinned

Release-record corrections recorded: rollback now has two regimes (no-data:
reverse drops; with data: disable admissions/remediation + revert app code,
preserve durable records — schema removal requires separate reconciliation +
retention review). Canary $2.00 labeled ADMISSION limit (not a provider cap),
$0.30 labeled reserved exposure for unknown pricing. Cross-tenant denial must
be proved through the deployed broker/API in addition to the DB boundary.
