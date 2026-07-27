# iOS 27 Siri ObservabilitySPEC

**Owner:** Lattice OS / Genie iOS experience  
**Depends on:** existing memory system (`lib/intelligentMemory.ts`, `/api/memory/*`), knowledge substrate in Supabase  
**Target:** iOS 27 + Xcode 27 beta, Foundation Models, Core AI, App Intents, Evaluations

## Goal

Use Lattice OS’s existing memory and metrics infrastructure to give on-device Siri a **traceable, inspectable “brain.”** The Memory Center becomes the visualization layer for Siri inference: what context was supplied, what tool was called, which model answered, and why.

## Constraints from `vision.md`

- **UCOL remains async.** User-facing Siri latency must not increase.
- **Append-only graph writes.** Memory events can add nodes/edges; existing provenance must not be rewritten.
- **Traceability.** Every inference/action must be reconstructable after the fact.
- **Privacy.** On-device context should remain local by default; cloud sync requires explicit opt-in.
- **No PII.** Memory events must avoid raw PII without user consent.

## Data Model

Reuse existing memory semantics where possible. New records extend, they do not replace.

```
MemoryEvent
- id
- workspace_id
- user_id
- session_id
- source: 'siri' | 'genie' | 'system'
- entity_refs: string[]
- tool_invocations: ToolInvocation[]
- model_decision: ModelDecision
- prompt_hash: string
- result_summary: string
- latency_ms: number
- tokens_in: number
- tokens_out: number
- cost_estimate: number | null
- confidence: number | null
- created_at
- valid_from
- valid_until
```

```
ToolInvocation
- tool_id
- tool_name
- status: 'success' | 'failure' | 'skipped'
- latency_ms
- args_hash
- output_summary
```

```
ModelDecision
- requested_model
- routed_model
- route_reason: string
- fallback_used: boolean
- provider: string
```

## On-Device Storage & Sync (PWA)

On-device store: **IndexedDB via `idb`**. Use relational object stores for `MemoryEvent`, `ToolInvocation`, and `ModelDecision` arrays. Treat this as the browser-native equivalent of the eventual SwiftData container so the data model migration to iOS later remains close to 1:1.  
Backend mirror: Supabase graph store + optional anomaly/aggregation tables.

## Offline-First Sync Queue

Use an Offline-First sync queue:
1. When the conversation route emits an event, write it immediately to IndexedDB.
2. Register a Next.js Service Worker to intercept these persisted events.
3. If the device is online, flush the queue to Supabase.
4. If offline, hold the queue in IndexedDB and use **Background Sync API** to automatically push payloads to `/api/memory/events/route.ts` once connectivity is restored.

This guarantees traceability even when the user is offline and preserves the UCOL async/non-blocking invariant.

## Authentication for Service Worker Sync

Persist the Clerk session token in a way the Service Worker can read during background flush. When the Service Worker wakes to retry failed requests, it must attach a valid Bearer token to the fetch request so Supabase continues to accept memory events. PKCE flow is required; short-lived access tokens with silent refresh are the expected pattern.

## PWA Distribution

`manifest.json` / manifest config must include:
- `display: "standalone"` — strips browser chrome for fullscreen Memory Center
- Install prompt flow for iOS Home Screen and Android shortcuts

Memory Center must work as a standalone app shell with offline fallback.

## Visualization Stack

Use **React + React Flow** for Memory Center:
- **Timeline + tool/model breakdown**: standard React components in the Next.js app shell
- **Entity relationship graph**: React Flow for interactive node-link visualization of workspace entities, memory events, and tool invocations. Supports zoom, pan, and click-to-drill-down behavior.
- Fallback: if graph density grows large, Cytoscape.js with a React wrapper is the swap-in option. Both support offline use.

## Phases

### Phase 1: Memory-Captured Siri Brain — WEB/PWA FIRST  
**Status:** Proposed  
**Gate:** `tsc`, `jest`, existing conversation route behavior unchanged, Vision conflicts reviewed

**Scope**
1. Add `MemoryEvent`, `ToolInvocation`, `ModelDecision` types.
2. Add `/api/memory/events/route.ts` append-only ingest with Zod validation via `lib/env.ts`.
3. Instrument conversation route to emit memory events around existing model/tool calls without blocking user response.
4. **PWA Memory Center UI:** Next.js app shell with `display: standalone`, offline-capable via IndexedDB and Service Worker + Background Sync, showing workspace timeline, tool/model breakdown, entity graph with React Flow, and “why” pane. No Xcode, no App Store distribution—users add to home screen.

**Constraint:** No Apple developer account available for this machine. iOS-native Foundation Models / App Intents / Core AI / Evaluations are deferred until a developer key/license is acquired. The PWA acts as the portable observability layer today.

**Open-Question Resolution**
- Is Memory Center iOS-native, web-native, or both? *Web-native PWA first; native later when Phase 2 unblocks.*

---

### Phase 2: iOS 27 Native Integration  
**Status:** Proposed — blocked until Apple developer account/license is available on this machine  
**Gate:** `tsc`, `jest`, iOS simulator smoke test, feature-flagged with `IOS27_ENABLED`

**Unblock condition:** A build host with an active Apple developer account and Xcode 27 installed.

**Scope**
1. **Foundation Models**: import on-device/model-routed prompt context from Lattice OS memory before responding.
2. **App Intents**: expose workspace entities, projects, tasks, and recent memory events as `Entity` schemas + `Intent` schemas.
3. **View Annotations**: map Memory Center UI views to conversational entities so Siri can reference “that fact” or “that task.”
4. **Core AI**: wrap one high-value action in Core AI for local execution validation.
5. **Dynamic Profiles**: plug Lattice OS routing policy into Foundation Models profile swapping.

**Verification**
- Siri query returns workspace-specific answer using local memory cache.
- Intent invocation succeeds in 3/5 common workflows.
- Core AI action execution completes with measurable latency advantage over cloud path.
- Evaluations suite green for intent coverage + regression safety.

---

### Phase 3: Visualization & Metrics  
**Status:** Proposed  
**Gate:** `tsc`, `jest`, visual regression review, Telemetry contract review

**Scope**
1. Memory Center graph view for workspace entities Siri touched.
2. Timeline view of tool invocations with latency/cost breakdown.
3. “Why” pane: retrieved memory chunks, routed model, ranking score, confidence.
4. OTEL export bridge to Lattice OS metrics backend for aggregate observability.

**Verification**
- Memory Center renders 30-day timeline with <100ms query response.
- PII filter remains in effect on exported telemetry.
- User can export memory event subset per workspace.

---

### Phase 4: Evaluations + Safety  
**Status:** Proposed  
**Gate:** evaluations passing, no regressions in existing memory behavior

**Scope**
1. Evaluations for Siri-facing intents: correctness, hallucination rate, tool selection accuracy.
2. Privacy/redaction tests around PII in emitted traces.
3. Fallback behavior tests when Foundation Models / Core AI are unavailable.

**Verification**
- Evaluations suite green across dynamic conditions.
- Cloud-down fallback preserves local-only memory + inference path.

---

## Repo Touchpoints

- `lib/` and `app/api/memory/` for ingest types + routes
- `lib/intelligentMemory.ts` for ranking hooks used during retrieval visualization
- `docs/` for spec
- `app/` for Memory Center UI new pages
- iOS surface: new Xcode 27 target outside main repo, wired to same `/api/memory/events` contract

## Open Questions

1. Memory event volume vs storage cost: what retention window is acceptable?
2. **Should on-device inference traces ever leave the device?** — Resolution: prefer local-only summaries; if traces sync to Supabase, require local sanitization pass. Execution via Apple Private Cloud Compute retains strict privacy, but explicit opt-in remains required for any cross-device export.
3. Do we vendorize tool invocations in the schema or keep them generic telemetry spans?
4. Is Memory Center iOS-native, web-native, or both?

## Success Criteria

- Siri responses visibly informed by Lattice OS workspace memory.
- Memory Center surfaces “what,” “how,” and “why” for every Siri/Genie interaction.
- Zero regression on existing memory ranking, conversation latency, or privacy guarantees.
