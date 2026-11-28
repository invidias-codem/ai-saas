# AP0.3 — Integrated system acceptance

Status: Proposed / documentation only. AP0.3, RFC-0001 #532, AP0 #533, 2026-11-24.
Evidence baseline: `80c49ad6c6c01f6f665b839695b6f26135041a54`. Source findings are not live qualification or authorization to enable production. All gates below are proposed for maintainer acceptance.

## First operating-system proof

Use synthetic Client Operations accounting intake, derived from docs/pilots/client-operations-foundation.md and RFC-0001. Existing C0/C1 drafts are dependencies to reconcile, not proof of end-to-end capability. No real customer data, live messages, payments, connector changes or public deployments. Use isolated environment and explicitly authorized synthetic/mock providers before paid/real integrations.

| Stage | Expected evidence / invariant |
|---|---|
| 1. Human creates engagement | Verified principal and workspace, fixture revision, durable task ID |
| 2. Ingest authorized documents | Source hashes, ACL, immutable provenance, injection treated as data |
| 3. Weaver plans/delegates | Pinned revision, scope, narrowed capabilities, expiry, budget reservation |
| 4. Actor admits work | Stable instance/session, mailbox dedup, generation-fenced attempt |
| 5. Isolated execution | Qualified runtime lease, scoped credentials, bounded resource use, no host fallback |
| 6. Review artifact generated | Evidence-linked missing/received/uncertain checklist, private versioned app/report |
| 7. Human review | Exact proposed action and revision; approve/deny/expire with current authority |
| 8. Effect/receipt | Simulated authorized sink only; duplicate retry yields one logical effect, ambiguous result reconciled |
| 9. Export and recover | Authorized source/artifact export with hashes, reconnect to same run, retained state and cleanup receipt |

## Negative scenarios (required)

Foreign workspace/tenant, forged actor, revoked membership, invalid approval, stale lease, duplicate event, worker crash, client disconnect, budget exhaustion, unavailable provider/ledger, untrusted instructions, path escape, unauthorized preview URL and secret redaction. Each denial leaves protected resources and unrelated tenants unchanged; test both success and failure paths. If a stage is mocked, mark that boundary unqualified. Trace principal -> grant -> task -> run -> attempt -> lease -> artifact -> approval -> receipt; independent identity and versions, no hidden chain-of-thought.

## Success metrics and graduation

Record completion and review time, received/missing/uncertain precision on labeled fixtures, duplicate effects, recovery success, denied access coverage, provider usage and cost, export verification, cleanup failures. Baseline before numeric thresholds. Require zero unauthorized access or unapproved external effects in executed negative cases; no inference of universal safety. Human review signs fixture, exact commit and evidence manifest; AP1.0 is pure contracts only, AP1 actor prototype precedes full pilot, AP2–AP6 each qualify needed surfaces before integration. No production activation or real client data from AP0 acceptance.
