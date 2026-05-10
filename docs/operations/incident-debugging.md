# Incident Debugging

## Purpose

This document provides a practical debugging approach for incidents in Genie AI / `ai-saas`.

It is intended to help answer:
- where should we start when something breaks?
- what kind of incident is this?
- which truth surfaces matter most?
- how do we avoid flailing between logs, code, and runtime guesses?

This is a debugging discipline document, not an incident-retrospective log.

---

## Core Principle

Do not debug incidents by intuition alone.

Classify the incident first, then use the appropriate truth surface.

The biggest wasted-effort pattern in this codebase is trying to answer several different questions at once without first deciding which kind of incident is actually happening.

---

## Step 1 — Classify the Incident

Most incidents in this repo will fall into one or more of these classes:

### A. Public route / auth boundary incident
Examples:
- docs route redirects to sign-in
- public page unexpectedly protected
- logged-out users cannot access intended informational surface

### B. Authenticated product routing incident
Examples:
- conversation route behaves incorrectly
- workspace route lands in wrong state
- onboarding flow misroutes users

### C. Runtime/API behavior incident
Examples:
- chat route uses wrong mode/model
- API response is structurally wrong
- backend logic disagrees with UI expectation

### D. Schema / database incident
Examples:
- missing table errors
- onboarding fails due to schema drift
- live DB does not match repo migrations

### E. Deploy/build incident
Examples:
- deploy workflow fails
- build fails in CI
- local build confidence conflicts with cloud build truth

### F. Integration / webhook incident
Examples:
- Slack callback failure
- Telegram webhook issue
- cron route no longer behaving correctly

### G. Operational health incident
Examples:
- cron jobs intermittently failing
- recurring agent failures
- health degrading over time rather than in one request

---

## Step 2 — Choose the Right Truth Surface

## For public/auth route incidents
Use:
- live runtime truth
- `proxy.ts`
- `docs/security/public-routes.md`
- `docs/security/trust-boundaries.md`

## For runtime/API incidents
Use:
- API runtime truth
- relevant route handler
- debug headers where available
- `docs/architecture/runtime-mode-routing.md`

## For schema incidents
Use:
- live schema/database truth
- relevant migration files
- route logs/errors

## For build/deploy incidents
Use:
- source-of-code truth
- cloud build truth
- deploy workflow truth
- live runtime truth

## For integration incidents
Use:
- provider-side or callback truth
- relevant webhook/callback route
- operational logs

---

## Step 3 — Narrow the Failure Boundary

Ask:
- Is the problem in code truth, deploy truth, runtime truth, or schema truth?
- Is it route visibility, API behavior, or data availability?
- Is it a one-off failure or a recurring operational pattern?

Do not start by changing code before the boundary is clear.

---

## Common Incident Patterns in This Repo

## 1. Public Route Looks Correct But Still Redirects to Sign-In
Likely boundary:
- route-gating / public-route allowlist mismatch

Check:
- `proxy.ts`
- logged-out route behavior
- locale-prefixed variants
- actual public entry path into the route

---

## 2. Onboarding Fails Despite Code Existing
Likely boundary:
- live schema truth mismatch

Check:
- actual DB table existence
- migration application state
- schema-cache-related errors

---

## 3. Deploy Workflow Looks Bad But Live Site Seems Fine
Likely boundary:
- deploy truth vs runtime truth mismatch

Check:
- live route behavior directly
- hosting surface state
- whether the failure was action-side noise vs real runtime failure

---

## 4. Chat Runtime Behavior Feels Wrong
Likely boundary:
- server-resolved routing behavior
- context resolution

Check:
- `app/api/chat/route.ts`
- debug headers if exposed
- workspace/profile context resolution path

---

## 5. Local Build Is Broken but Production Build Is Unclear
Likely boundary:
- local machine constraints vs cloud build truth

Check:
- cloud CI build result
- whether local failure is due to environment/resource instability

---

## Debugging Checklist

When a new incident appears:

- [ ] classify the incident type
- [ ] identify the likely primary truth surface
- [ ] reproduce the issue through the real entry path
- [ ] narrow the failure boundary before editing code
- [ ] check whether the problem is route, runtime, schema, deploy, or integration related
- [ ] verify the final fix on the actual live/runtime surface that matters

---

## Documentation to Consult During Incidents

Depending on the incident class, consult:
- `docs/security/public-routes.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`
- `docs/operations/route-verification-checklist.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- `docs/reference/api-reference.md`

---

## Summary

The key debugging lesson is:

**Name the kind of incident first, then use the right truth surface, then fix the real boundary that failed.**

That is the fastest route to reliable diagnosis in this codebase.
