# AP0.3 — System qualification matrix

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Evidence standard

Every run records commit, exact environment/provider/version, fixture and command, timestamps, expected and observed outcomes, pass/fail/skips, artifact hashes, cleanup receipts and reviewer. Distinguish source review, mocked contract, real integration and approved activation. A green CI check does not close live qualification. Test synthetic data; do not use customer information or provision paid infrastructure without separate authorization.

| Gate | Minimum evidence | Status / blocking boundary |
|---|---|---|
| AP0 semantic source audit | Every route method -> identity, resource scope, flags, mutation/side effect, tests; migration source and live/disposable application evidence | Partial; AP0_SOURCE_AUDIT.md; AP0 exit |
| AP0 CI and approval | Exact head CI, restored PR-Agent secret or explicit maintainer policy decision; RFC then AP0 review, ADR owners | Open |
| AP1.0 identity/delegation | Pure negative tests from authority matrix; no runtime side effects | Not implemented |
| AP1 actor state | Two independent PostgreSQL connections race claim, renew, expire, cancel, revoke, checkpoint; crash/replay cannot create two valid writers | Not qualified |
| Account Compute | Disposable migrations; one verified Linux VM, two isolated workspace guests; cross-scope denial, stale lease fencing, suspend refusal during active lease, recovery/teardown | Not qualified; before AP6 enablement |
| Native compute | Supported physical Intel and Apple Silicon macOS; relevant Windows/Linux devices; signed build, host path/secret isolation, cancellation/descendants, no fallback | Not qualified; before native execution |
| Approval | Foreign approve/deny rejected without state change; expired/revoked grant denied; current action digest; atomic consume; ambiguous provider effect reconciliation | Existing source concern; before AP3 effect use |
| Continuity | Disconnect/reconnect without resubmit or double charge; terminal state monotonic; durable result before complete | Worker qualification pending |
| Credential | Revoke during active job, deny new operations, no logs/env/files leakage; provider token expiry and cleanup | Live evidence pending |
| App runtime | Isolated origin, cross-scope denial, bridge CSP/network, private preview, export and rollback; direct ingress protected | #479 independent sharing gate |
| Recovery | Restore scoped backup into disposable env; replay pending work, reconcile external outcomes, verify deletion and fences | Not qualified |
| Economics | Concurrent reserve cannot exceed caps, outage denies paid actor admission, metering dedup, cancellation releases only verified unused holds | Not qualified |
| Integrated pilot | AP0_SYSTEM_ACCEPTANCE.md scenario, negative tests, trace and cost receipts | Not run |

Release policy: default-off flags; reviewed migration/backfill/rollback and kill switch; no public sharing or production activation by AP0 acceptance. Define SLOs from measured pilot, not invented performance numbers.
