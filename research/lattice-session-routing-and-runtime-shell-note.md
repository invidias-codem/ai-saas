# Lattice Session Routing and Runtime Shell Note

## Purpose
This note translates a simple routing/session-shell diagram into a more formal Lattice-oriented architecture framing.

The goal is to clarify that a serious workspace intelligence product should not collapse:
- screen routing
- session UI
- runtime orchestration

into one tangled layer.

Instead, Lattice OS should treat them as distinct architectural concerns.

## Core Principle
A strong session architecture separates three layers:

1. **Routing / Screen Entry**
2. **Session Shell / Interaction UI**
3. **Runtime Orchestration / Harness Bridge**

This separation matters because the product is evolving beyond ordinary chat and toward supervised workspace intelligence.

---

## 1. Routing / Screen Entry

## Role
This layer decides where the user is and how the session is entered.

### Responsibilities
- route resolution
- workspace selection
- session creation / restoration
- operating profile handoff
- initial message or entry payload handoff
- feature surface selection (`chat`, `code`, future `relay`, etc.)

### In Lattice terms
This is where the system should decide:
- which workspace is active
- whether the session is new or resumed
- whether the user is in a general/pre-workspace state or a workspace-backed state
- what initial runtime context needs to be passed downward

### Important rule
Routing should decide:
- **where you are**
- **what session container is active**

It should not directly own all of the execution logic.

---

## 2. Session Shell / Interaction UI

## Role
This layer owns the visible interaction surface once the session is active.

### Responsibilities
- message rendering
- loading and spinner state
- input box behavior
- error display
- scroll and layout behavior
- tab/agent panel visibility
- multimodal affordances
- display of async or background task state

### In Lattice terms
This is close to the visible `Weaver` experience:
- the user’s live interaction shell
- the place where agent/tool activity becomes legible
- the place where session continuity is felt

### Important rule
The session shell should decide:
- **how interaction is shown**
- **how runtime state becomes visible**

It should not itself be the entire runtime/orchestration engine.

---

## 3. Runtime Orchestration / Harness Bridge

## Role
This is the missing middle layer that many chat systems under-specify.

It bridges:
- route/session state
- actual model/agent/tool execution
- memory/context loading
- approvals
- persistent task loops

### Responsibilities
- initial context hydration
- prepared-context injection
- memory retrieval and file grounding lane activation
- model/provider routing
- agent/tool loop orchestration
- approval gating
- async task lifecycle
- message stream/event handling
- writeback / persistence coordination

### In Lattice terms
This is where:
- UCOL routing
- Relay-style execution
- memory/graph integration
- agent loop behavior
- cost-shaped orchestration

should increasingly live.

### Important rule
This layer decides:
- **how the system actually behaves**
- **which lane/tool/agent executes**
- **how state is persisted and resumed**

This is the architectural bridge between a pretty chat shell and a real supervised workspace intelligence runtime.

---

## Why the Three-Layer Separation Matters

## 1. It reduces entanglement
Without the separation, routing, UI, and execution quickly blur together, making the product harder to evolve.

## 2. It supports workspace-first behavior
Lattice OS increasingly depends on:
- workspace context
- operating profiles
- memory scopes
- session continuity

These all benefit from an explicit orchestration layer.

## 3. It makes agentic behavior legible
Users should not need to infer runtime behavior from UI fragments alone.
The session shell should show what is happening, while the orchestration layer governs it.

## 4. It supports future Relay evolution
Persistent agent loops, async tasks, and device/workspace execution need a place to live that is not “the page component.”

---

## Lattice Translation of the Original Diagram
A simple session-routing diagram can be upgraded into this Lattice-oriented view:

### Layer A — Routing / Screen Entry
Examples:
- `index.tsx`
- route configuration
- workspace/session boot logic
- new session vs resumed session

### Layer B — Session Shell
Examples:
- session container
- message list
- input/footer
- loading/error affordances
- visible agent/task panels

### Layer C — Runtime Orchestration
Examples:
- session controller
- UCOL runtime bridge
- prepared context assembler
- tool/agent execution controller
- approval and persistence coordinator

---

## Suggested Naming Direction
The exact names can vary, but the shape should remain.

### Possible layer names
- **Route Layer**
- **Session Shell**
- **Runtime Bridge**

or

- **Entry Layer**
- **Interaction Shell**
- **Execution Orchestrator**

or more explicitly in Lattice terms:
- **Workspace/Session Router**
- **Weaver Session Shell**
- **UCOL Runtime Bridge**

The names matter less than preserving the separation.

---

## Product Implications for Lattice OS

## 1. Workspace/session models should stay explicit
The current workspace-first and row-backed session work aligns well with this architecture.

## 2. Session shells should become more runtime-aware
The shell should increasingly expose:
- background work
- tool progress
- approval state
- retrieval/source state
- async tasks

## 3. Runtime orchestration should become first-class
If Lattice OS wants to become a serious supervised workspace intelligence product, the orchestration layer cannot remain implicit or scattered.

## 4. Code/chat parity becomes easier
If code and conversation surfaces share the same session-shell and orchestration principles, parity work becomes architectural rather than ad hoc.

---

## Relationship to Relay
This three-layer model is a good bridge into the Relay vision.

### Routing layer
Selects the workspace/session/device entry context.

### Session shell
Shows what Relay is doing and what Weaver is surfacing.

### Runtime bridge
Actually governs Relay/UCOL behavior, approvals, memory use, and action loops.

This is much cleaner than treating “agentic behavior” as just another message type.

---

## Bottom Line
The key insight from the simple routing diagram is that Lattice OS should not treat session architecture as one undifferentiated chat surface.

The stronger model is:
1. routing decides where the user/session is
2. the session shell decides how interaction is shown
3. the runtime bridge decides how the system behaves

That separation is one of the clearest architectural moves available if Lattice OS wants to mature from chat product into supervised workspace intelligence system.

## Related Pages
- [lattice-os-architecture-memo-2026-05](lattice-os-architecture-memo-2026-05.md)
- [agentic-harness-gap-analysis-for-lattice-os](agentic-harness-gap-analysis-for-lattice-os.md)
- [feature-context-compilation-workflow](feature-context-compilation-workflow.md)
