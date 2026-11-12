# Deployment

## Zweck

Dieses Dokument erklärt das Deployment-Modell für Genie AI / `ai-saas` auf einer praktischen operativen Ebene.

Es soll Entwicklern und Operatoren helfen zu verstehen:
- welche Deployment-Surfaces existieren
- wie Code vom Repository-State zum Live-Runtime bewegt wird
- welche Signale während Deployment vertrauenswürdig sind
- wo Deployment erfolgreich oder fehlgeschlagen erscheinen kann in irreführender Weise

Dieses Dokument sollte zusammen gelesen werden mit:
- `docs/operations/truth-surfaces.md`
- `docs/security/public-routes.md`
- `docs/reference/environment-variables.md`

---

## Kernprinzip

Deployment ist kein einzelnes Event. Es ist eine Kette verwandter aber distincter States:

1. Code State
2. Build State
3. Deploy Automation State
4. Platform Runtime State
5. Live Application Behavior

Ein verlässlicher Deployment-Prozess behandelt diese States explizit statt sie in eine vage "did it deploy?" Frage zu kollabieren.

---

## Primäre Deployment Surfaces

Der Codebase involviert aktuell mehr als eine deployment-bezogene Surface.

## 1. GitHub Repository State

### Role
- source-of-code truth
- trigger source für CI und deployment workflows

### Questions it answers
- was für commit ist auf `main`?
- was für Code wurde actually pushed?
- welche branch oder merge introduced einen change?

### Important note
Ein successful push ist nicht proof von successful build oder successful live behavior.

---

## 2. GitHub Actions / CI Workflows

### Role
- cloud build validation
- deployment workflow execution
- cron/scheduled operational workflows
- CodeQL / validation checks

### Typical uses in this repo
- production deploy validation
- Firebase hosting deployment workflow
- Vercel-related deployment flow
- scheduled jobs wie agent/cron workflows

### Important note
CI/workflow success answered some questions, but not all.

For example:
- build success does not automatically prove runtime correctness
- deploy action failure does not always prove live runtime is broken

---

## 3. Vercel Runtime Surface

### Role
- primary application hosting/runtime surface
- wahrscheinlich user-facing production application runtime für major web routes

### Questions it answers
- is the deployed app actually serving requests?
- do public/authenticated routes behave correctly?
- does the runtime artifact behave as expected?

### Important note
Vercel action logs und live Vercel runtime behavior sind related but not identical truth surfaces.

---

## 4. Firebase Hosting Surface

### Role
- additional hosting/deployment surface present in repo workflows

### Questions it answers
- did the Firebase-hosted deployment path complete?
- is the Firebase-facing artifact updated where applicable?

### Important note
This should be treated as a distinct deployment/output surface rather than assumed to be interchangeable mit Vercel runtime truth.

---

## Practical Deployment Flow

At a high level, a typical deployment path looks like:

1. code is committed locally
2. code is pushed to GitHub
3. GitHub Actions workflows trigger
4. build/deploy jobs run
5. hosting surfaces update as appropriate
6. live runtime behavior is verified directly

### Important point
Step 6 is mandatory für user-visible bug fixes.
A workflow result alone is not enough.

---

## Recommended Deployment Verification Flow

When shipping a change, use this order of verification:

## 1. Confirm code state
Check:
- intended commit exists on the intended branch
- the change was actually pushed

## 2. Confirm workflow/build state
Check:
- build jobs ran
- deploy jobs ran
- no obvious workflow failure blocks artifact generation

## 3. Confirm live route/runtime behavior
Check:
- relevant routes load correctly
- auth/public behavior is correct
- the actual user-visible bug is resolved

## 4. Confirm integration/schema behavior if relevant
If the change depends on:
- DB schema
- cron behavior
- integration callback flow

then verify those truth surfaces as well.

---

## Known Deployment Realities in This Repo

This codebase has already surfaced several important deployment realities.

## A. Local build truth can be unreliable
Local production builds have been an unreliable truth surface under constrained machine conditions.

### Implication
Cloud CI build validation often carries more weight für production viability.

---

## B. Workflow logs can be noisy or lossy
A deployment workflow may report failure while the live runtime is not actually broken, or vice versa.

### Implication
Treat workflow logs as one important signal, not the final authority on runtime health.

---

## C. Merge success is not runtime success
A merge to `main` can still leave:
- deploy failures
- runtime regressions
- missing schema application
- public/protected route mismatches

### Implication
Post-merge live verification is part of deployment, not optional cleanup.

---

## D. Repo migrations are not live schema proof
A code deployment can succeed while the live database is still missing required schema changes.

### Implication
Schema truth must be verified separately für features that depend on DB changes.

---

## Route-Specific Deployment Verification

Different changes need different final verification checks.

## Public Route Changes
Verify:
- page renders für logged-out users
- locale-prefixed versions behave correctly
- route does not bounce to sign-in unintentionally

## Authenticated Product Changes
Verify:
- logged-in state works correctly
- route-level data loads
- user navigation still behaves as expected

## API Behavior Changes
Verify:
- actual route response behavior
- request/response contract alignment
- any relevant debug headers or backend indicators

## Cron/Automation Changes
Verify:
- jobs actually complete
- operational logs over time remain healthy

## Terminal / Raw SSE Changes
Verify:
- stream remains line-framed after proxy/CDN hops
- chunked transfer is preserved
- client recovers cleanly from timeout or dropped connection
- `/api/cli/stream` does not buffer or prematurely terminate idle connections

---

## Environment Sensitivity

Deployment behavior can depend strongly on environment configuration.

### Areas to watch
- auth configuration
- provider secrets/tokens
- Supabase credentials
- webhook secrets
- cron secrets
- provider-specific runtime config

### Important note
A build can succeed even when runtime secrets/config are wrong or incomplete.

That is why deployment verification must include runtime behavior, not just build state.

---

## Common Deployment Failure Modes

## 1. Build succeeds, runtime still wrong
Cause examples:
- route gating mismatch
- missing runtime configuration
- schema drift
- logic bug not caught by build

## 2. Workflow fails, runtime still appears healthy
Cause examples:
- noisy deployment action
- secondary deploy path failure while primary runtime still serves
- logging/reporting mismatch

## 3. Code merged, schema not applied
Cause examples:
- migrations exist in git but were not applied to active DB
- schema cache not updated

## 4. Public route bug survives deploy
Cause examples:
- UI changed without proxy/middleware allowlist update
- locale route variants not tested

## 5. Local validation blocks confidence incorrectly
Cause examples:
- machine resource constraints
- local build instability
- unhealthy local environment treated as production truth

---

## Recommended Operational Habits

## For small UI/content changes
- push intended commit
- verify workflow triggers
- verify the exact live route visually/behaviorally

## For runtime/API changes
- verify build state
- verify live API behavior
- inspect debug indicators where available

## For schema-backed changes
- verify code
- verify migration application
- verify live route/API behavior that depends on schema

## For public-route changes
- test while logged out
- test locale-prefixed forms
- test entry through the actual public page that links to the route

---

## Deployment and Documentation

Deployment-sensitive changes should ideally update documentation when they alter:
- route visibility
- auth expectations
- integration surfaces
- environment variable requirements
- operational verification expectations

This helps keep repo docs aligned with production reality.

---

## Summary

The key deployment lesson for this repo is:

**A successful deployment is not just a green workflow. It is a verified chain from pushed code to correct live behavior.**

That chain should be checked explicitly, especially in a platform with:
- multiple route classes
- multiple deployment surfaces
- runtime auth boundaries
- evolving schema-backed architecture