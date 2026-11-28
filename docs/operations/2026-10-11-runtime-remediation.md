# October 11 runtime remediation

## Evidence and scope

Production deployment `dpl_HGCKmUnABfR7oqTGB2nUpcjhJc2G`, 12:40–13:10 UTC:

1. `[AR] IN` and `[AR] RAW` were unconditional `console.error` debug statements. Removed prompt/model excerpts; genuine classification failures retain their existing diagnostics.
2. Firebase repeatedly logged credential length and had a credential-snippet error path. Removed these diagnostics.
3. Bluesky feed polling returned 500 because it required `BLUESKY_IDENTIFIER`. Environment metadata shows `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD` configured in production. The validated client config now accepts that handle, with explicit identifier taking precedence. Session resume is awaited so asynchronous failure reaches reauthentication.
4. Interaction tracking reported PostgreSQL `42P01`: `public.subscriptions` does not exist. A targeted repair creates the table when absent and reconciles the current writers' requirements. Optional tracking now has a 1.5-second network deadline and cannot fail chat on a rejected request.
5. JKlaw reached the platform's 300-second limit. Its route now has a 240-second total chat deadline, 5-second optional context budget, disconnect propagation, and no duplicate external-context retrieval. Cancellation reaches NIM, MiniMax and Gemini inference plus stream readers; fallback stops on caller cancellation. Streaming failure emits a provider-error marker and closes cleanly. Dispatch timeouts are unacknowledged/unknown, never reported as successful or retried through another transport after an ambiguous twin timeout.

The export's repeated 200 responses do not establish a polling defect. The credit hook intentionally refreshes every 30 seconds. No refresh behavior is changed without browser evidence.

## Production rollout

Code is proposed for human review; no merge, deployment, environment-value change, or production DDL is performed by this change.

### Targeted subscription repair

Do not run a broad `supabase db push` or `migration up`: this repository has known migration-ledger drift.

1. Verify the database/project identity. Inspect `to_regclass('public.subscriptions')`, the existing RPC definition, columns, constraints, policies, grants, and migration ledger. If the table exists, inspect duplicate `clerk_user_id` values before applying. The unique-index creation deliberately fails transactionally on duplicates; it does not delete or choose an entitlement.
2. Review and apply **only** `supabase/migrations/20261011140000_repair_subscriptions.sql` with a transaction-capable SQL client and stop-on-error enabled.
3. Run `scripts/verify-subscriptions-repair.sql` as the migration owner. It verifies free-user creation/increment, paid-user preservation, webhook-compatible insert, and mutation permissions. Synthetic writes are rolled back.
4. Record only this successfully applied version in the migration ledger. Reconcile historical versions as a separate task.
5. Check real billing records separately. Creating an absent table does not recover historical payments or restore paid entitlements; do not infer or grant those from this schema repair.

All current subscription consumers use the service-role client. The repair enables RLS and removes anon/authenticated table privileges; the increment RPC uses an empty search path and service-role-only execution. A trigger fills the legacy `user_id` column for current webhook writers. The repair can be reapplied; existing rows and premium dates are retained.

### Application verification after reviewed deployment

- Confirm the deployed commit matches the reviewed change.
- Let the next authenticated Bluesky cron run complete; verify feed counts and absence of credential-name failures. Do not manually post social content as a smoke test.
- Send a normal chat; verify response completion and absence of interaction-tracking schema warnings.
- Verify JKlaw with a bounded request and correlate `requestId`, `stage`, and elapsed time on failure. Confirm no invocation reaches 300 seconds.
- Verify client disconnect and stalled-stream behavior in the deployed runtime; local mocks cannot prove Vercel disconnect propagation.

## Limits

These changes bound failures; they do not make a slow model faster. A timed-out dispatch still has an unknown remote outcome. Durable acceptance and retry would require a separately persisted job/idempotency contract. Some retrieval SDK calls do not support cancellation; the caller stops waiting and cannot continue into inference, but already-started retrieval may finish in the background. Provider-side compute/billing cancellation is not guaranteed by aborting its HTTP request.

Production database verification and runtime smoke tests remain pending deployment/access.

## Local validation

- All 25 contract suites passed (204 tests), plus 14 focused cancellation/config/tracking/dispatch tests. The final consumer-disconnect regression also passed, bringing covered tests to 219.
- Application typecheck and scoped ESLint passed.
- Production Next.js/Turbopack build passed with the repository's 6144 MB heap setting. In this executor, the `tsx` CLI prebuild step cannot open its IPC socket; the same manifest script ran with `node --import tsx`, then `next build` completed. No build gates were disabled.
- PostgreSQL-compatible PGlite execution verified missing-table and legacy-table paths, repeat application, new free-user counting, webhook upsert compatibility, paid-row preservation, and role permissions. The checked-in rollback-only verification SQL passed on both paths.
- No production credentials or model calls were used for tests. Production behavior and migration-ledger state are not attested by these local checks.
