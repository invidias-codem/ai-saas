# Truth Surfaces

## Purpose

This document defines which sources of evidence should be trusted for different kinds of questions in Genie AI / `ai-saas`.

It exists because this codebase already has a recurring operational reality:
local output, CI output, deploy logs, and live runtime behavior do not always agree.

When they disagree, teams waste time if they treat every signal as equally authoritative.

This document is intended to make troubleshooting and verification more disciplined.

---

## Core Principle

There is no single universal truth surface for the whole system.

Different questions require different primary evidence.

For example:
- “Does the code compile locally?”
- “Does the production build succeed in cloud CI?”
- “Did the deployment action succeed?”
- “Is the live site actually serving the correct route?”
- “Is an API route behaving correctly at runtime?”

These are related questions, but not identical questions.

---

## Why This Matters in This Repo

This repository has already demonstrated several failure patterns:
- local machine resource constraints invalidate local build confidence
- deploy workflow failures do not always mean runtime failure
- runtime issues can persist even after apparently successful checks
- mergeability and CI greenness are not the same thing
- action logs can be noisy or lossy truth surfaces

Without explicit truth-surface discipline, these patterns create confusion and wasted effort.

---

## Truth Surface Categories

This repo should be understood through several distinct truth surfaces.

## 1. Source-of-Code Truth

### Primary truth surface
- the GitHub repository state on the relevant branch

### Question it answers
- what code actually exists in the tracked project history?

### Use when asking
- did this file change?
- what commit introduced this behavior?
- what branch contains the real implementation?
- what was actually merged?

### Important note
Local uncommitted drift is **not** source-of-code truth.
It may be valuable work, but it is not canonical until preserved and identified correctly.

---

## 2. Local Workspace Truth

### Primary truth surface
- the local working tree

### Question it answers
- what local edits, experiments, or unstaged drift currently exist?

### Use when asking
- what is dirty?
- what has not been committed?
- what local-only files or migrations exist?

### Important note
Local workspace truth is useful for editing and diagnosis, but it is not sufficient proof of production behavior.

---

## 3. Cloud Build Truth

### Primary truth surface
- cloud CI build results (for example GitHub Actions production build validation)

### Question it answers
- can the code produce a valid build artifact in the intended cloud environment?

### Use when asking
- is this branch/build production-buildable?
- did the build complete under realistic environment constraints?

### Why this matters here
This codebase has already encountered cases where the local Mac was an unreliable build truth surface due to:
- limited RAM
- swap churn
- local build hangs/kills
- machine-health concerns

For heavy build verification, cloud CI has often been the more trustworthy surface.

---

## 4. Deploy Workflow Truth

### Primary truth surface
- deployment workflow runs and logs

### Question it answers
- did the deployment automation step complete as expected?

### Use when asking
- did the deployment action run?
- did Firebase/Vercel deployment automation succeed?
- did a pipeline step fail before handoff?

### Important warning
Deploy workflow truth is **not** identical to runtime truth.

A deploy action may fail while:
- a previous artifact is still serving traffic
- the live route still works
- a separate platform-side deployment succeeded despite noisy action output

This repo has already seen that kind of mismatch.

---

## 5. Live Runtime Truth

### Primary truth surface
- the actual behavior of the deployed application

### Question it answers
- what does the live user-facing system actually do right now?

### Use when asking
- does this route return HTML?
- is this page 404ing?
- does this public route bounce to auth?
- is the production bug fixed?

### Why this matters
A green workflow or a successful merge is not enough if the live site still behaves incorrectly.

Runtime truth is the final check for user-visible behavior.

---

## 6. API Runtime Truth

### Primary truth surface
- actual HTTP/API behavior in a real environment
- request/response inspection
- route-specific debug outputs/headers where available

### Question it answers
- what does the backend actually return at runtime?
- what mode/model was really selected?
- is the route behaving according to contract?

### Examples in this repo
Debug headers like:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

can help validate actual backend routing behavior.

### Important note
API runtime truth matters especially when UI state and backend behavior can drift apart.

---

## 7. Schema / Database Truth

### Primary truth surface
- the actual database schema and live database state

### Question it answers
- does the target database actually contain the expected tables/functions/columns?

### Use when asking
- why is onboarding failing with schema-cache errors?
- did migrations actually reach the active environment?
- does the table exist in the live database, not just in the repo?

### Important note
Migration files in the repository are **not** sufficient proof that the live schema matches them.

This repo has already seen production behavior where repo-level migrations existed but live schema application was incomplete.

---

## 8. Integration Truth

### Primary truth surface
- real callback behavior, provider responses, webhook delivery, external platform state

### Question it answers
- is the integration actually functioning with the outside system?

### Use when asking
- is Slack auth working?
- is Telegram webhook delivery functioning?
- are external automation jobs receiving/responding correctly?

### Important note
Mock success or local code confidence is weaker than actual integration truth.

---

## 9. Operational Health Truth

### Primary truth surface
- logs, job histories, cron results, recurring failure patterns, status tooling

### Question it answers
- is the system healthy over time, not just in one request?

### Use when asking
- are cron jobs failing intermittently?
- is the Bluesky agent healthy across runs?
- are there recurring auth/deploy/runtime issues?

### Why this matters
Some failures only show up as patterns over time rather than one-off request bugs.

---

## Common Misreads to Avoid

## 1. “CI is green, therefore production is fixed.”
Not always true.
Live runtime truth still matters.

## 2. “Deploy action failed, therefore the site is broken.”
Not always true.
The action log may be a noisy or partial truth surface.

## 3. “It works locally, therefore the build is fine.”
Not always true.
Local machine limitations can invalidate local confidence.

## 4. “The migration exists in git, so the DB has it.”
Not true.
Live schema truth must be checked directly.

## 5. “Everything merged cleanly, so nothing else is wrong.”
Not true.
Mergeability, buildability, and runtime correctness are different things.

---

## Recommended Question → Truth Surface Mapping

## Question: Did we actually change the code?
Use:
- Git branch/commit history

## Question: What local work is still floating around?
Use:
- local working tree status

## Question: Can the project produce a production build?
Use:
- cloud CI build truth

## Question: Did the deployment automation succeed?
Use:
- deploy workflow truth

## Question: Is the live site behaving correctly?
Use:
- live runtime truth

## Question: Is the chat route using the expected runtime mode?
Use:
- API runtime truth / debug headers

## Question: Does the active DB schema actually support this feature?
Use:
- schema/database truth

## Question: Is this integration genuinely working?
Use:
- integration truth

## Question: Is this subsystem healthy over time?
Use:
- operational health truth

---

## Verification Discipline

A good verification flow in this repo often looks like:

1. confirm source-of-code truth
2. confirm build truth in cloud CI
3. confirm deploy workflow state
4. confirm live runtime truth
5. confirm database/integration truth if relevant

Not every bug requires all five, but many serious ones require more than one truth surface.

---

## Practical Guidance for This Codebase

### Prefer cloud build truth over local build truth when:
- the local machine is resource constrained
- local builds are hanging or being killed
- you are validating production build viability

### Prefer live runtime truth over deploy-log interpretation when:
- a page is visibly broken or not
- a route is returning the wrong status
- a public/auth boundary bug is suspected

### Prefer live schema truth over migration-file confidence when:
- production errors mention missing tables/functions
- onboarding or data-backed routes fail despite apparently correct code

### Prefer API runtime truth when:
- the frontend appears inconsistent with backend behavior
- model/runtime selection is under question
- debug headers or actual payloads can reveal the real server decision

---

## Summary

The key operational lesson is simple:

**Use the right truth surface for the question you are trying to answer.**

That sounds obvious, but it is one of the most important disciplines in this codebase because many of its hardest bugs have come from mismatches between:
- code truth
- build truth
- deploy truth
- runtime truth
- schema truth

Knowing which surface to trust is part of the architecture.
