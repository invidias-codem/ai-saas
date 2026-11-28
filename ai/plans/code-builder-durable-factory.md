# Code Builder → Durable Multi-Agent Software Factory — Architecture Plan

> Status: design accepted. Execution is phase-gated, contract-tested, trace-first.
> Supersedes the trajectory in `durable-sandbox-and-model-swap.md` (Track A) — this
> is the fuller, canonical model for the Code Builder surface specifically.

**Goal:** Stop shuttling the entire Code Builder build through a single 300s Vercel
function. Make the build a durable, resumable, multi-agent pipeline orchestrated by
Trigger.dev, remembered by Supabase, executed in a Vercel Sandbox for verification +
live preview, and decided by UCOL — never by Trigger.

**Architecture (roles, non-negotiable separation):**

| Layer | Responsibility | Never |
|---|---|---|
| **UCOL/B2** | decide what happens + who does it | never owns orchestration/inference |
| **Trigger.dev** | durable execution: run / retry / queue / fan-out / resume | never decides agent/provider |
| **Supabase** | source of truth: build/project state, operation keys, events, artifacts | sandbox is NOT source of truth |
| **Vercel Sandbox** | workbench: run generated code, edit, test, preview | never holds canonical state |
| **NIM/Gemini/etc** | inference workers | pipeline is provider-agnostic |

---

## Identity model (transport-independent, business-first)

```
buildId          = user-visible logical build
requestId        = correlation (one user turn/interaction)
operationKey     = codebuild:<buildId>:component:<componentId>:v1  (deterministic dedup)
providerAttemptId = unique per NIM/Gemini/etc attempt
triggerRunId     = durable execution identity (NOT the business identity)
```

- `buildId` is stable across retries, handoffs, device refreshes.
- `operationKey` scopes to ONE mutation (one component build), never to the parent
  build/conversation — same refinement as the postgen `operationKey` lesson.
- Never surface `triggerRunId`, sandbox name, or other infra identity as the user PID.
  Product identity = `shareSlug` (+ eventual immutable `publishedVersion`).

## Failure → owner → response policy (bounded, no money furnace)

| Failure | Owner | Response |
|---|---|---|
| NIM 429 | UCOL/B1 | fallback or delayed retry |
| NIM network failure | Trigger + UCOL | retry, then delegate |
| NIM timeout | UCOL | alternate provider/agent |
| Trigger worker crash | Trigger | resume/retry |
| Invalid tool arguments | Agent runtime | fail closed / repair agent |
| Generated code doesn't compile | UCOL | fixer agent |
| Reviewer rejects component | UCOL | coder/fixer handoff |
| Sandbox test fails | UCOL | diagnostic repair task |
| Same component fails repeatedly | Orchestrator | mark `BLOCKED` |
| Policy/security violation | Policy layer | no automatic retry |

**Bounded handoff budgets — separate counters (this is what kills the
timeout→retry→agentB→retry→agentC furnace):**

```
provider attempts: 3
agent handoffs:    2
repair rounds:     2
```

These are independent. Exhausting one column does not reset the others.

## Target shape

Browser POSTs `/build` → gets `{ buildId, runId }` → subscribes via **Trigger Realtime**
(scoped Public Access Token — browser never sees `TRIGGER_SECRET_KEY`) → the *same*
React reducer consumes a transport-independent `BuilderEvent` schema.

```
POST /build ──► Trigger Orchestrator (root task)
                  │  asks UCOL.resolveExecution({buildId, operationKey,
                  │     capability, role, failureContext}) → {action, agent, provider,
                  │     model, reason, retryBudgetRemaining}
                  ▼
              Planner (child task, keeps high reasoning initially)
                  │  returns a dependency DAG, not a flat array
                  ▼
        ┌─────────┴─────────┐   (Trigger batchTriggerAndWait, bounded waves + queues)
        ▼                   ▼
   Component Agent      Component Agent   (coder → reviewer/fixer per node)
        └─────────┬─────────┘
                  ▼
          Integration Agent
                  ▼
          Vercel Sandbox  (install → typecheck → test → build → repair loop)
                  ├─ PASS ─► preview URL
                  └─ FAIL ─► Repair Agent (UCOL-routed: TS→repair, arch→coder,
                              dep→package, repeated→BLOCKED)
```

## Preserve the frontend contract

`ContextRouter → SSE → reducer` becomes `Trigger task → Realtime stream → same reducer`.

```ts
type BuilderEvent =
  | { type: "context-flow"; ... }
  | { type: "plan"; ... }
  | { type: "component-started"; ... }
  | { type: "file-generated"; ... }
  | { type: "review"; ... }
  | { type: "complete"; ... }
  | { type: "error"; ... };
```

Make the schema transport-independent. Do **not** replace SSE with "dumb polling" —
Trigger Realtime gives run-state + metadata + LLM-stream subscriptions with the same
live feel via run/stream hooks.

## Concurrency (not all-serial, not `Promise.all(12)`)

```
build concurrency per project: 1
NIM coder queue:  concurrency 2–3
NIM planner queue: concurrency 1–2
secondary provider queue: separate capacity
sandbox verification: higher concurrency
```

Planner emits a **dependency DAG**; Trigger fans out independent nodes in waves via
`batchTriggerAndWait` / child tasks with per-queue concurrency. B2/UCOL routes eligible
work to non-NIM providers instead of hammering the shared key (we already saw NIM 429s).

## Sandbox = execution + live preview (NOT source of truth)

- Persistent named sandbox per project (Vercel Sandbox: 24h sessions on Pro/Ent, public
  ingress URL on exposed port). `/workspace` = package.json, app/, etc.
- `npm install → lint → test → build → dev --host 0.0.0.0` → `sb-xxx.vercel.run` = **preview**.
- After meaningful change: sandbox fs → file manifest → content hashes → Supabase
  Storage / Git / canonical artifact store. Sandbox can vanish and be rebuilt.
- **Preview URL ≠ Publish URL.** Publish = immutable deployment/artifact under a stable
  `shareSlug` (`/p/[shareSlug]`), not the live sandbox identifier.

Store `{ projectId, shareSlug, sandboxName, sandboxPort, currentSandboxUrl, publishedVersion, visibility }`.

### Security rule (non-negotiable)

**Never put Lattice platform secrets inside user sandboxes.** No
`SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`,
`LANGFUSE_SECRET`. Generated/user code is untrusted. Sandbox projects needing AI/billing/
storage call narrowly-scoped Lattice APIs, never inherit infra credentials.

## Implementation order (each phase = own branch + PR + contract tests before fix)

**Phase 0 — Bridge (unblock prod today, zero architecture).**
Bump `maxDuration` to 1800s (Fluid compute now allows it). Explicitly a bridge, not the
solution. Merge PR #356 (240s per-call timeouts) alongside.

**Phase 1 — Extract one canonical Code Builder engine.**
No inline + separate Trigger implementations. Make `ContextRouter`/UCOL plain reusable
domain code (`resolveExecution`, planner, coder, reviewer, fixer) over serializable
inputs, rehydratable on a worker. Rebuild registries on the worker — never serialize
live tool/provider objects.

**Phase 2 — Durable orchestrator root task.**
`code-builder-orchestrator` (`id: code-builder`). API authenticates → creates `buildId`
→ `tasks.trigger(...)` → returns `{ buildId, runId }` immediately. Env-gated dispatch
helper (inert without `TRIGGER_SECRET_KEY`), mirroring `dispatchAgentLoopToTrigger`.

**Phase 3 — Supabase build state + events.**
`builds` / `build_nodes` / `build_events` tables: status, phase, progress, component
states, operation keys, Trigger IDs, failure envelopes. `requestId`=correlation,
`operationKey`=dedup (partial unique index), `triggerRunId`=execution identity.

**Phase 4 — Planner child task → DAG.**
Planner returns dependency DAG. Keep `reasoningEffort:'high'` here. Persist nodes.

**Phase 5 — Component DAG child tasks + queues.**
Convert components to child tasks over bounded `batchTriggerAndWait` waves, NIM
concurrency controls (2–3 coder, 1–2 planner), secondary-provider queue.

**Phase 6 — UCOL recovery/delegation.**
Explicit `retry | fallback_provider | delegate_agent | block` with strict budgets
(provider 3 / handoff 2 / repair 2).

**Phase 7 — Realtime transport.**
Replace SSE with Trigger Realtime (scoped PAT), retain the same `BuilderEvent` reducer.
Feature-flag inline fallback only during rollout, then delete the duplicate path.

**Phase 8 — Vercel Sandbox verification.**
Generate → write → install → typecheck → test → build → repair loop (structured
diagnostics → UCOL routing to repair/coder/package agent or BLOCKED).

**Phase 9 — Persistent editing sandbox + live preview.**
Named per-project sandbox, browser editor, live dev server, preview URL. Persistent
fs across sessions.

**Phase 10 — Sharing/publishing.**
Sandbox URL = preview; stable `shareSlug` = share; immutable deployment = Publish.

## Benchmarks (deferred until after durability lands)

Once execution is durable there's no HTTP deadline pressure, so benchmark
`reasoningEffort` high→low for component coder/reviewer *without* sacrificing it just
to beat the old arbitrary deadline. Token tuning is an optimization after Phase 6, not
a precondition.

## Open questions (resolve at implementation, don't block Phase 0/1)

1. Trigger Realtime exact API in installed SDK 4.5.16 (PAT scoping + run/stream hooks) —
   verify against `references/trigger-dev-sdk-api-shape.md` before Phase 7.
2. Vercel Sandbox API surface (persistence guarantees, ingress URL lifetime) — spike
   before Phase 8.
3. DAG shape the planner emits (flat tiers today in `groupIntoTiers`) — evolve to true
   nodes+edges in Phase 4 without breaking the component cap (12).

## Risks

- **SSE→Realtime migration** is the riskiest UX change; Phase 7 must be feature-flagged
  and reversible.
- **Secret leakage** into sandboxes — the one non-negotiable guardrail; enforce with a
  deny-list scan before any sandbox write.
- **Provider cost** — bounded budgets (3/2/2) are the control; never auto-retry on
  policy violations or BLOCKED nodes.