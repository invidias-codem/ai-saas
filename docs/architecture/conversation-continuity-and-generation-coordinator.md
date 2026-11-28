# Conversation continuity + workspace generation coordinator (C0–C5)

**Status:** C0 draft. The attached migration and owner-scoped read API are
NOT a resumed chat worker. Leave `ENABLE_CONVERSATION_CONTINUITY` unset/off.
No production schema, runtime or flag changes in this slice.

## Audited current state

- Code Builder: `buildId` is stable, Trigger.dev owns work, Supabase is
  authoritative, SSE is a notification only, and owner-only polling can
  rehydrate after disconnect, tab closure or mobile resume.
- `/api/chat` and `components/chat/useChatStream.ts`: main chat work occurs
  within a fetch response. On disconnection, the browser cannot reliably
  reattach to a still-running operation by run ID. Message-level Supabase
  synchronization is **not equivalent** to durable execution.
- `useSessionSync` restores chat history and syncs devices but does not
  reconstitute an in-flight agent task. Background `waitUntil` writes
  from runtimeBridge are not a substitute for a separately owned job.
- UC0L routing/provider resolver/Context Sieve and existing tool-capability
  manifests are reusable for future multi-engine selection and coordination.
- Existing `unified_sessions` models VDI/sandbox control, not a conversation
  run journal. DO NOT overload the workspace+artifact-revision unique key.

## Architecture

1. **Route/identity:** Clerk user, verified conversation owner,
   derived workspace identity, stable request key for idempotency.
2. **Durable runtime:** Trigger.dev `conversation-turn` worker owns an
   execution ID, checkpoints, retries and terminal resolution.
3. **Persistence:** `conversation_runs` is authoritative, event records are
   append-only metadata; full content and evidence use protected source or
   artifact records, never browser localStorage as truth.
4. **Reconnect shell:** load active run by conversation; status poll and SSE
   relay with bounded connection rotation, Last-Event-ID/cursor and backoff.
   A stream reconnection MUST NOT resubmit generation or charge again.
5. **Specialist dispatcher:** UCOL plans bounded steps to code, research,
   image, video, audio, data and browser engines using prepared context packets.
   Each delegated step has user/workspace identity, capability allowlist,
   cost budget, receipt, artifact ref, and independent retry controls.
6. **Synthesis/QA:** merge only verified specialist artifacts into a
   coherent user response with provenance. On conflicts ask for authorized
   review or show uncertainty; no silent conflicting source overwrite.

**"Hive mind" means a shared, governed task state and knowledge graph**;
not models accessing one another's secret instructions, private scratchpad,
raw credentials or unrelated users' data.

## Invariants

- User identity is derived from Clerk on EVERY request; the service_role
  client always scopes to owner AND conversation.
- Worker only starts after durable admission, atomic credit reservation and
  idempotent queue trigger. No worker must ever run twice for a request key.
- Worker writes output/evidence FIRST, and only then marks `completed`.
  Terminal status may not be overwritten by late or retried workers.
- Status transitions and event append must commit **atomically**, using a
  transaction/RPC with compare-and-swap generation and event sequence. The
  pure `transitionRun` function is the policy, not a substitute for this DB
  transaction.
- Retry after network loss reattaches to the same job; it never repeats
  external mutations unless their idempotency result is reconciled.
- Owner/device changes and tool grants require independent authorization;
  a model may propose writes, but not grant itself GitHub, VDI, billing,
  publishing or deployment permissions.
- Minimize and verify restored context using Context Sieve, source revisions
  and temporal retrieval. A compressed summary is not an archive.
- Distinguish queued/running/awaiting_approval/completed/failed/cancelled;
  client must never turn network timeout into `failed`.

## Implementation slices

C0 (this PR): schemas, pure state/delegation contracts, safe owner-scoped
metadata read endpoint behind a default-off flag, unit tests.

C1: admission endpoint with client request_key, atomic credit reserve,
queue dispatch, retries and status reconciliation (outbox for dispatch
failure). Avoid doing any LLM generation inside request handler.

C2: Trigger.dev chat worker, source-artifact checkpoint refs and single-DB
transaction for events + state transition. Explicitly recover partial
outputs; use fenced side-effect admission.

C3: client resumable run hook, polling/SSE from the owner endpoint,
background/reopen experience on iOS/desktop, multi-device display,
accessibility and terminal replay.

C4: multi-engine planner and specialist fanout using constrained UCOL
capabilities. Parallelize only independent read-only/dependency-safe tasks;
all other steps need sequential orchestration, approvals and task-budget
leases. Reuse verified model availability and fail over with provenance.

C5: reliability/scale evaluation. Kill browser during generation, rotate
SSE, kill worker, revoke grants, test cross-tenant IDOR, stale fencing,
duplicate credit debit, expired memory/artifacts, long conversations,
model outages and mobile reconnection.

## Release gates

- Migration tested on isolated preview database, not production first.
- Owner can submit then disconnect for >5 minutes and get exact same run
  and result, no duplicated spend, no lost approvals.
- Cross-tenant run IDs return 404; no public RLS grants; platform secrets
  and generated code stay separated.
- Engine-to-engine handoff includes per-step context/evidence, not raw
  hidden model traces; result integrity and attribution verifiable.
- Feature remains off in production until these gates pass.
