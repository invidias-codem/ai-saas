# AP0.3 — Failure and recovery model

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## Invariants

At-least-once delivery, bounded retries, one valid fenced writer per mutable actor/run, durable evidence before terminal state. No promise of exactly-once provider effects or lossless recovery of uncommitted work. Fail closed when identity, authorization, budget or isolation cannot be established. Recovery cannot silently switch to a less isolated runtime.

| Failure | Required behavior | Evidence |
|---|---|---|
| Queue dispatch timeout / ambiguous result | Persist intent and idempotency key before dispatch; query/reconcile existing run before retry; no concurrent inline fallback | Fault inject accepted-but-response-lost; one logical run |
| Worker crash before checkpoint | Lease expires, new generation claims; retry from last committed checkpoint | Crash/replay two writers, stale rejected |
| Crash after checkpoint before ack | Duplicate delivery reads committed result / dedup record | No duplicate durable effects |
| External mutation timeout | Mark effect unknown; use provider idempotency key/receipt/readback; manual review when uncertain | Simulated committed-but-timeout; no blind retry |
| Membership/credential revoked | Deny new sensitive work, rotate generation, cancel and verify termination; audit outstanding effects | Mid-run revocation race |
| DB unavailable | Stop new claims/authorizations and paid actions; read-only safe status where available | Inject connection loss |
| Budget service outage | Deny new paid autonomous work; keep holds until reconciliation | Fault-inject unavailable ledger |
| Provider failure | Use only preapproved equivalent capability/isolation/budget route; otherwise wait/fail | Missing provider no host fallback |
| Poison event / recursion | Bounded attempts/depth, quarantine and scoped operator review | Duplicate/cycle stress |
| Client disconnect | Durable worker independent of stream, reattach by run ID without charge/resubmit | Mobile disconnect/reconnect |
| Orphaned VM/sandbox | Reconcile provider inventory against durable claim; quarantine and authorized teardown | Lost create response, verified cleanup |
| Backup/restore | Restore in isolated environment; validate tenant scope, receipts and latest revocations, invalidate pre-restore leases | Restore drill; measured RPO/RTO |

Existing anchors: transitionRun in lib/ucol/continuity/contracts.ts enforces generation and durable result ref; Account Compute lock order VM -> guest -> lease; acquisition dispatch has operation-key idempotency plus durable DB claim. dispatchAgentLoopToTrigger currently returns null on error and callers may continue inline; AP1 must not inherit ambiguous fallback for persistent work. Establish outbox/lease evidence before adopting runtime behavior. Define incident severity, operator ownership and recovery objectives after measured drills.
