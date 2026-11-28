# Research Plane — R0 + R1A: Verifiable Research Runs

## Purpose

Lattice OS research infrastructure: human-directed research, AI-assisted
discovery, formalization, adversarial criticism, independent verification,
immutable provenance, and human acceptance. Agents may generate hypotheses,
proofs, code, and conclusions — they must never be the sole authority
certifying their own results.

## Trust boundaries (Invariants)

1. **No self-certification** — agents cannot issue authoritative verification receipts for their own work.
2. **Specification integrity** — verified status binds to the exact frozen specification hash.
3. **Artifact integrity** — verification receipts bind to immutable candidate content hashes.
4. **Independent trust boundary** — the verifier's executable, policy, and authority cannot be modified by the candidate-producing agent.
5. **Tenant isolation** — research workspaces, artifacts, memory, and compute remain tenant-scoped.
6. **Reproducibility** — a reviewer can reproduce the verification result using documented tools and pinned inputs.
7. **Explicit uncertainty** — missing evidence or inconclusive outcomes cannot become VERIFIED.
8. **Safe operations** — no automatic production deployment, public publication, privileged command execution, or unapproved external spending.
9. **Provenance accountability** — every accepted result has sufficient evidence establishing what was checked, against which specification, using which trusted tools.
10. **Human oversight** — human approval is a separate requirement for high-impact claims, publication, and production activation.

## Module structure

| Module | Responsibility |
|--------|---------------|
| `contracts.ts` | Zod schemas, types, typed errors, feature flag, deterministic hashing, transition validation, tenant isolation |
| `lifecycle.ts` | Fail-closed state machine transitions, freeze-spec, propose-candidate, submit-verification, receipt binding validation |
| `evidence.ts` | Provenance event construction, chain verification, evidence manifest, seal, manifest-receipt binding validation |
| `provenance.ts` | Append-only provenance log, chain integrity, log verification |
| `verification/contracts.ts` | Verifier provider interface, verification result, default policy, independence assertion, receipt builder |
| `verification/policy.ts` | Axiom authorization, required-check validation, outcome determination, tamper detection, receipt consistency |
| `verification/leanAdapter.ts` | R1A: Trusted Lean 4 verifier — pinned toolchain, `lean` check, axiom inspection, outcome from actual evidence |

## Feature flag

`ENABLE_RESEARCH_PLANE=false` by default. All research capabilities are
disabled in production until explicitly enabled.

```
ENABLE_RESEARCH_PLANE=true
```

## Run lifecycle

```
CREATED -> SPEC_FROZEN -> RESEARCHING -> CANDIDATE_READY -> VERIFICATION_PENDING
                                          -> FAILED / REJECTED
VERIFICATION_PENDING -> VERIFIED / FAILED / INCONCLUSIVE / REJECTED
```

VERIFIED, FAILED, INCONCLUSIVE, and REJECTED are terminal. No direct agent
promotion to VERIFIED — only a verifier can submit a receipt that transitions
to VERIFIED.

## R1A — Trusted Lean Adapter

The `LeanVerifierProvider` implements `VerifierProvider` using Lean 4.36.0
(pinned via elan). It:

1. Verifies spec/candidate content hashes against actual bytes (never trusts caller hashes)
2. Runs `lean Solution.lean` — the trusted compilation/kernel acceptance check
3. Extracts axiom/parameter declarations and checks against `disallowedAxioms`
4. Computes the verification outcome from actual evidence — never caller claims
5. Generates a sealed `VerificationReceipt` binding spec hash, candidate hash, toolchain, policy, and execution receipt

Requires a Lean 4 toolchain (elan) on the PATH. Without Lean installed, the
adapter will fail compilation checks (exit status != 0 → FAILED).

## Testing

Contract tests live in `__tests__/contracts/research-plane.contract.test.ts`
(R0/R0.1/R0.2) and `__tests__/contracts/research-plane-lean.contract.test.ts`
(R1A). Run with:

```
npx jest __tests__/contracts/research-plane.contract.test.ts --no-coverage
npx jest __tests__/contracts/research-plane-lean.contract.test.ts --no-coverage
```

## Deployment model

All R0 operations are deterministic and testable without external credentials.
No live model calls, billable VM provisioning, or production database
migrations are required for this foundational slice. R1A requires a Lean 4
toolchain for live verification; the adapter gracefully fails (FAILED
outcome) when Lean is unavailable. Persistence (Supabase rows, artifact
storage) is the caller's responsibility; this module supplies pure contracts
and validation only.
