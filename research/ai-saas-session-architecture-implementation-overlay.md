# ai-saas Session Architecture Implementation Overlay

## Purpose
This note maps the three-layer Lattice session architecture model onto the current `ai-saas` repository as a concrete implementation overlay.

The three target layers are:
1. **Routing / Screen Entry**
2. **Session Shell / Interaction UI**
3. **Runtime Orchestration / Harness Bridge**

The point of this overlay is not to pretend the layers are already perfectly separated.
It is to identify:
- which files are already serving each role
- where responsibilities are still mixed together
- what a realistic refactor direction should be

## Core Architecture Reminder
The intended session model is:
- routing decides where the user/session is
- the session shell decides how interaction is shown
- the runtime bridge decides how the system behaves

This overlay uses that model as the evaluation frame.

---

## 1. Routing / Screen Entry Layer

## Primary role
This layer decides:
- which workspace or conversation is active
- whether the user is creating, restoring, or entering a session
- what initial route-level context is available

## Current `ai-saas` files in this layer

### Conversation routes
- `app/[locale]/(dashboard)/(routes)/conversation/page.tsx`
- `app/[locale]/(dashboard)/(routes)/conversation/[id]/page.tsx`
- `app/[locale]/(dashboard)/(routes)/conversation/new/page.tsx`

### Workspace conversation entry points
- `app/[locale]/(dashboard)/(routes)/workspaces/[id]/conversation/page.tsx`
- `app/[locale]/(dashboard)/(routes)/workspaces/[id]/page.tsx`
- `app/[locale]/(dashboard)/(routes)/workspaces/page.tsx`

### Code route entry
- `app/[locale]/(dashboard)/(routes)/code/page.tsx`

### Session/container creation APIs
- `app/api/conversations/new/route.ts`
- `app/api/conversations/route.ts`
- `app/api/workspaces/default/route.ts`
- `app/api/workspaces/route.ts`
- `app/api/operating-profiles/default/route.ts`

## Current assessment
This layer is relatively real already.
The workspace-first and conversation-row work has made route-level session/container identity more explicit than it used to be.

### Strengths
- workspace-first entry is now a real architectural direction
- code surface has begun converging onto a row-backed conversation container model
- conversation routes and workspace routes are visibly distinct

### Weaknesses / tangles
- some runtime expectations still leak upward into route-level choices
- code-route entry and conversation-route entry are not yet fully unified in container semantics
- route-level surfaces still carry some legacy product assumptions from earlier phases

## Recommendation
Continue treating route/container identity as first-class, especially:
- workspace-backed session identity
- code/chat convergence on shared conversation model
- pre-workspace vs workspace-backed distinction

---

## 2. Session Shell / Interaction UI Layer

## Primary role
This layer decides:
- how the active session is shown
- how messages render
- what loading/error state looks like
- how session continuity feels to the user
- how agent/tool state becomes visible

## Current `ai-saas` files in this layer

### Main conversation UI
- `app/[locale]/(dashboard)/(routes)/conversation/[id]/client.tsx`

### Session-adjacent components
- `components/conversation-history.tsx`
- `components/mobile-sidebar.tsx`
- `components/sidebar.tsx`
- `components/navbar.tsx`

### Code-session UI surface
- `app/[locale]/(dashboard)/(routes)/code/page.tsx`

### Supporting UX surfaces
- loading indicators, mode displays, conversation labels, runtime headers/debug indicators where present

## Current assessment
This layer exists, but it is still partially entangled with orchestration and route identity.

### Strengths
- the session shell is becoming a distinct visible surface
- code and chat surfaces are beginning to share stronger persistence expectations
- mobile and history behavior have been receiving targeted architectural cleanup

### Weaknesses / tangles
- code and chat shells are not yet fully parallel in structure or capabilities
- some runtime logic still bleeds into page/client files instead of a cleaner bridge layer
- explicit agent/task/tool state visibility remains limited compared to the long-range Relay vision

## Recommendation
The session shell should become increasingly responsible for:
- presenting async work
- exposing tool/agent progress
- showing runtime status and approvals
- making memory or grounding state legible when relevant

But it should not become the orchestration layer itself.

---

## 3. Runtime Orchestration / Harness Bridge Layer

## Primary role
This layer decides:
- what context gets loaded
- what memory lanes are used
- what provider/model/agent path runs
- how tools/agents execute
- what gets persisted afterward

This is the layer that bridges route identity and session shell with actual intelligence behavior.

## Current `ai-saas` files in this layer

### Chat runtime API
- `app/api/chat/route.ts`

### Code runtime API
- `app/api/code/route.ts`

### Conversation engine and prompt/context assembly
- `lib/llm/conversationEngine.ts`
- `lib/context/preparedContext.ts`

### Memory and retrieval
- `lib/ragMemory.ts`
- `lib/memory/vectorStore.ts`
- `lib/memory/graphStore.ts`
- `lib/memoryPromotion.ts`

### UCOL routing and provider resolution
- `lib/ucol/routing/decision.ts`
- `lib/ucol/routing/providerResolver.ts`
- `lib/ucol/routing/types.ts`

### Workspace/runtime shaping
- `lib/workspaces/runtimeMode.ts`
- `lib/workspaces/operatingProfiles.ts`
- `lib/workspaces/query.ts`
- `lib/workspaces/workspaceQueries.ts`

### Emerging agentic/harness-related areas
- `lib/agents/core/reactLoop.ts`
- `lib/agents/core/registry.ts`
- `lib/ucol/toolExecutor.ts`
- `lib/ucol/agents/*`

## Current assessment
This is the most strategically important layer and also the one that remains the most mixed.

### Strengths
- prepared context is a meaningful move toward a real runtime bridge
- provider resolution and UCOL routing scaffolding exist
- memory planning is no longer purely descriptive
- workspace/profile shaping is increasingly real
- code route and chat route now carry more session-aware and workspace-aware context than before

### Weaknesses / tangles
- orchestration logic is still spread across API routes and helper modules rather than concentrated in one explicit bridge
- chat and code runtime paths are still only partially converged
- some expensive decisions still happen inside route handlers rather than inside a more deliberate orchestrator surface
- the agent loop, memory retrieval, provider routing, and persistence logic are not yet presented as one cohesive harness layer

## Recommendation
A stronger future architecture would make this layer more explicit under a name like:
- `RuntimeBridge`
- `SessionController`
- `UCOLRuntimeBridge`
- `ExecutionOrchestrator`

That layer should increasingly own:
- context hydration
- retrieval-lane choice
- provider/agent/tool routing
- approval gating
- async task lifecycle
- writeback/persistence policy

---

## 4. Concrete File-by-File Overlay Notes

## `app/[locale]/(dashboard)/(routes)/conversation/[id]/page.tsx`
### Current role
Mostly routing/screen entry with some session bootstrap responsibility.

### Desired role
Stay in routing/session identity, hand off live behavior downward.

---

## `app/[locale]/(dashboard)/(routes)/conversation/[id]/client.tsx`
### Current role
Main session shell for conversation interaction.

### Desired role
Remain a session shell, but increasingly surface runtime/agent/task state rather than owning execution logic.

---

## `app/[locale]/(dashboard)/(routes)/code/page.tsx`
### Current role
Mixed route entry + session shell + some container bootstrap behavior.

### Desired role
Converge toward the same architecture pattern as the main conversation surface:
- route/container identity
- shell UI
- runtime bridge beneath

This file is one of the clearest current examples of mixed responsibilities.

---

## `app/api/chat/route.ts`
### Current role
Runtime orchestration entrypoint for chat.

### Desired role
Thin transport entry into a more explicit runtime bridge/orchestrator over time.

---

## `app/api/code/route.ts`
### Current role
A very dense runtime/orchestration route that currently owns:
- auth/rate limit
- context loading
- memory retrieval
- workspace/profile shaping
- credit enforcement
- model invocation
- memory capture
- message persistence
- telemetry

### Desired role
Over time, slim this into a cleaner transport + coordination layer, delegating more of the behavior into reusable runtime bridge modules.

This file is one of the highest-priority examples of orchestration density in the repo.

---

## `lib/context/preparedContext.ts`
### Current role
A major runtime-bridge building block.

### Desired role
Continue growing as a central context assembly layer, especially as retrieval lanes and workspace doctrine become richer.

---

## `lib/ragMemory.ts`
### Current role
Core retrieval utility layer used by runtime paths.

### Desired role
Remain a key substrate layer, but increasingly fit beneath explicit orchestration policies rather than being invoked ad hoc from many route branches.

---

## `lib/ucol/routing/decision.ts`
### Current role
Emerging runtime-routing policy/scaffold.

### Desired role
Become one of the central brains of the runtime bridge layer rather than a disconnected policy helper.

---

## 5. Current Tangles Worth Calling Out

## Tangle A — Route handlers doing orchestration-heavy work
Particularly visible in:
- `app/api/code/route.ts`
- to a lesser extent `app/api/chat/route.ts`

### Why it matters
This makes runtime policy harder to evolve and harder to share across surfaces.

---

## Tangle B — Code/chat parity still incomplete
The code surface is converging, but it is not yet fully living on the same shell + orchestration model as conversation.

### Why it matters
If Lattice OS wants workspace intelligence rather than multiple disconnected product islands, this convergence matters a lot.

---

## Tangle C — Session shell and runtime visibility are still underdeveloped
The shell can show conversation state, but it is not yet fully surfacing:
- agent/task progress
- approval gates
- retrieval lane use
- grounding/citation state
- background workflow state

### Why it matters
This becomes crucial as Relay/UCOL become more operational.

---

## 6. Practical Refactor Direction

## Phase 1 — Keep strengthening route/container identity
Continue current work around:
- row-backed sessions
- workspace-backed sessions
- code/chat container parity

## Phase 2 — Make a more explicit runtime bridge layer
Extract orchestration-heavy logic from route handlers into reusable bridge/orchestrator modules.

## Phase 3 — Make the session shell more runtime-aware
Expose:
- async work
- approvals
- runtime status
- tool/agent progress
- grounding/memory source visibility

## Phase 4 — Converge code and conversation more deeply
Use the same architectural pattern for:
- session identity
- shell behavior
- runtime orchestration
- persistence and multimodal handling

---

## 7. Why This Overlay Matters
This mapping helps prevent a common failure mode: building an advanced intelligence substrate underneath a UI that still thinks in terms of simple page-level chat behavior.

Lattice OS is already moving toward:
- workspace-first identity
- memory-native context
- routed execution
- agentic behavior

The session architecture has to catch up structurally.

The three-layer model gives a clean way to do that without pretending the current repo is either a total mess or already finished.

---

## Bottom Line
The `ai-saas` repo already contains recognizable pieces of the three-layer session model:
- routing/session entry is real
- session shell is real but still maturing
- runtime orchestration exists but is still too distributed and route-dense

The clearest forward path is:
- continue container/session convergence
- make runtime orchestration more explicit
- let the shell become a clearer surface for showing what the runtime is doing

That will move Lattice OS closer to a supervised workspace intelligence system rather than a set of adjacent chat pages with hidden complexity underneath.

## Related Pages
- [lattice-session-routing-and-runtime-shell-note](lattice-session-routing-and-runtime-shell-note.md)
- [lattice-os-architecture-memo-2026-05](lattice-os-architecture-memo-2026-05.md)
- [agentic-harness-gap-analysis-for-lattice-os](agentic-harness-gap-analysis-for-lattice-os.md)
