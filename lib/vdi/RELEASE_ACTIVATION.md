# VDI Release Record — Activation A (preflight)

**Release branch:** `feat/vdi-plane-release` (from `main` @ `6b237e40`)
**Plane:** VDI-0 → VDI-4 (container desktop infrastructure)

## Verification scope — what each layer establishes

| Layer | What it proves | What it does NOT prove |
|---|---|---|
| **Contract tests** (136, 11 suites) | Deterministic behavior of broker, leases, gateway, observer, alerts, remediation policy/executor, budget admission against in-memory stores with failure injection | Real concurrency, real SQL semantics, deployed behavior |
| **Real database proofs** (isolated postgres:15) | Migration SQL correctness (7 migrations, 0 apply errors), partial-unique exclusivity, RPC race safety (leases/observations/alerts/operations/budget — concurrent psql workers), replay idempotency, stale-evidence rules | The production Supabase instance's data, permissions, extensions |
| **Live Daytona proofs** (disposable sandbox) | Remote termination incl. spawned child, restart persistence via fresh adapter, snapshot restoration after source deletion; runtime-class honesty (container; linux-vm requires org `sandbox_kvm`) | Billing accuracy, multi-region behavior, sustained load |
| **Deployed end-to-end evidence** | *PENDING — this is what Activation B/C produce.* | — |

Everything above is recorded in `lib/vdi/broker/RACE_PROOF_EVIDENCE.md`.

## Activation A checklist (preflight)

- [ ] **Pin release commit** — `feat/vdi-plane-release` merged to `main`; SHA recorded here: `<FILL ON MERGE>`
- [ ] **Apply targeted migrations** — in order, against production Supabase:
  1. `20261010000000_vdi_desktop_durable_state.sql`
  2. `20261011000000_vdi_fleet_observations.sql`
  3. `20261012000000_vdi_alerts_and_usage.sql`
  4. `20261013000000_vdi_remediation_attempts.sql`
  5. `20261014000000_vdi_remediation_operations.sql`
  6. `20261015000000_vdi_budget_admission.sql`
  Verify: 0 errors; all `vdi_*` tables present; every `vdi_*` RPC exists.
- [ ] **Verify RPC permissions** — all `vdi_*` functions are `security definer, search_path = public`; tables RLS-enabled with `auth.role() = 'service_role'` policies only. Confirm the anon key CANNOT read `vdi_*` (cross-tenant denial at the database boundary).
- [ ] **Configure env** — `DAYTONA_API_KEY` (secret), optional `DAYTONA_API_URL` / `DAYTONA_TARGET`. Absent key ⇒ adapter inert (no import-time failure).
- [ ] **Gateway/workers** — viewer gateway is a standalone `ws` process (not a Next route). Run it per deployment with its broker wiring; workers are horizontally safe (all authority is DB-side RPCs).
- [ ] **Rollback controls** — migrations are additive (CREATE TABLE/FUNCTION/policy IF NOT EXISTS); rollback = drop the `vdi_*` tables + functions in reverse order. No existing-table mutations. Keep the release SHA deployable while rollback is rehearsed.
- [ ] **Cross-tenant denial** — post-deploy check (Activation A exit gate): with two seeded workspaces, every list/detail/RPC scoped by `tenant_id+workspace_id` returns nothing cross-tenant; unauthorized desktop IDs are indistinguishable from absent ones.

## Canary configuration (Activation B target)

| Limit | Value |
|---|---|
| Workspace | ONE dedicated canary workspace (`canary-vdi`), single operator user |
| Budget period | Current month (e.g. `2026-10`) |
| Budget limit | **2,000,000 micro-USD ($2.00)** |
| Unknown-pricing ceiling | **300,000 micro-USD ($0.30)** per reservation |
| Max desktops | 1 concurrent |
| Runtime class | `container` (org-verifiable; linux-vm stays abstained) |
| Desktop horizon | 60 minutes; extension = explicit decision only |
| Display-recovery retry budget | 2 attempts per (desktop, rule, policyVersion); exhaustion ⇒ escalation record, no auto-retry |
| Remediation scope (Activation C) | Lease-safe idle suspension first; display recovery second. Quarantined resources: reconciliation + retention review ONLY — never auto-retirement. |
| Labels on provider resources | `lattice-tenant`, `lattice-workspace`, `lattice-live-proof` for disposables |

**Durable-safety verification in-canary (per spec):** stopping new admissions
(budget blocked or policy off) and stopping remediation dispatch must leave
existing authorized work running and all durable files recoverable
(stop/start preserves files; snapshots restore after source deletion — both
live-proven). Evidence: reservation rows stay `reserved`/`held-for-reconciliation`;
nothing releases on expiry alone; the canary desktop resumes via
`start()` and file contents read back.

## Exit gates

- **A:** schema + deployment verified; cross-tenant access denied (seeded two-workspace probe).
- **B:** complete flow with resource IDs, operation keys, accounting evidence (reservation → settle with provider-charge correction).
- **C:** lease-safe suspension then bounded display recovery work in deployment, incl. lost-response reconciliation.
