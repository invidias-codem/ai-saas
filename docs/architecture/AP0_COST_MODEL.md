# AP0.3 — Economic and compute governance

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Existing baseline and boundary

lib/budget/redisKillSwitch.ts uses optional Redis checks and post-response INCRBYFLOAT usage accounting; disabled/unavailable/error paths permit calls. It is monitoring/soft control, not a concurrent hard reservation ledger. lib/ucol/continuity/contracts.ts validates a delegated maximumCostCents against remaining budget; it does not reserve spend. Acquisition has provider budget fields; Account Compute has lease/guest constraints. No current provider rate or cost forecasts asserted.

## Proposed admission contract

Use integer microcurrency with currency/version, not binary float, and separately meter tokens, wall time, CPU/memory, storage, egress, concurrency and paid API units. Tenant/account hard limit ∩ workspace budget ∩ task/run budget ∩ per-agent grant ∩ provider/runtime quota; all applicable limits must allow. No borrowing across scopes or escalation by child delegation. Plan ceilings and provider estimates are versioned, measured and validated; unknown price/unit or unbounded action denies paid autonomous work.

1. Estimate conservative worst-case exposure from pinned provider pricing, max tokens/time/records, retry ceiling and resource lease.
2. Atomically reserve against every applicable scope before dispatch; reservation key binds logical operation, approved scope and quote version. Duplicate requests return existing hold, not additional budget.
3. Meter immutable usage records by provider request ID/attempt, dedup, reconcile actual billed units and overage. Do not treat provider timeout as zero cost.
4. Settle exactly once in the internal ledger; unused verified holds release; unknown provider outcome retains hold or quarantines; crash reconciliation owns cleanup.
5. Admission denies on unavailable/stale ledger, invalid amount, exhausted quota, missing price or unapproved provider. Kill switch blocks new paid dispatch and requests cancellation; do not promise instant provider stop.
6. Bound per-agent recursion, concurrency, runtime, external API requests and orphan cleanup; record tenant/run/attempt/lease attribution and redact secret-bearing payloads.

Acceptance: two-connection races across parent and child reservations; duplicate meter receipts; partial failure, stale price, cancellation, delayed billing, budget exhaustion, provider outage and currency mismatch. Synthetic pilot reports estimated/reserved/actual cost, cost per completed engagement, orphan resource time and unexpected charges. No hard-coded customer pricing or numeric SLO before observed evidence. Reuse existing credit/budget interfaces after owner ADR; no separate financial system or paid resource activation in AP0.
