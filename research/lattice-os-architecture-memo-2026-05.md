# Lattice OS Architecture Memo — 2026-05

## Purpose
This memo converts the current Lattice OS architecture discussion into a durable, claim-tiered reference that distinguishes what is implemented, what is emerging, and what remains planned.

## Executive Summary
Lattice OS is evolving from a chat-centric AI product into a **workspace-centric, memory-native intelligence platform**.

Its most important current strengths are:
- persistent memory and retrieval infrastructure
- graph/world-model enrichment
- provider-aware runtime routing
- workspace / operating-profile-aware execution context
- early agentic execution primitives

Its near-term direction is best understood not as unrestricted autonomy, but as **supervised workspace intelligence**:
- Weaver = customer-facing intelligence surface
- Relay = internal workspace/orchestration agent
- UCOL = routing, memory, execution, and policy contract

The architecture is already far beyond simple multi-model chat, but it is not yet a fully realized persistent device agent. The missing bridges are primarily:
- persistent agent execution outside request lifecycle
- device perception and action protocol
- Relay client surfaces
- system-grade tracing / observability

## Claim Tiers
This memo uses four claim tiers:

### Implemented
Live or substantially realized in code, with strong evidence in the current repo and product direction.

### Emerging
Partially wired or strongly scaffolded, with meaningful implementation present but not yet fully end-to-end or production-proven across all paths.

### Scaffolded
Typed, designed, or locally implemented in isolated form, but not yet broadly operational.

### Planned
Architectural target or roadmap item without enough current implementation to claim active behavior.

---

## 1. Current Product Identity
### Implemented
Lattice OS is no longer best described as a generic AI chatbot or tool grid.

The stronger current framing is:
- a memory-native AI workspace
- a workspace-centric intelligence system
- a runtime that shapes behavior through workspace + operating profile context

### Implemented evidence
Recent architecture/product work has already moved toward:
- workspace-first product structure
- operating-profile-aware runtime steering
- prepared-context over raw history
- memory scope enforcement
- code-surface convergence toward the main conversation surface
- product identity split: Lattice OS / Weaver / Relay / UCOL

### Cleaner articulation
Lattice OS is becoming a **supervised workspace intelligence runtime** rather than merely a multi-model chat interface.

---

## 2. Memory and Context Substrate

### Implemented
#### Persistent Memory Retrieval
- vector-backed memory retrieval exists
- provider/dimension-aware dual-lane retrieval exists
- current lanes are organized around 768 primary retrieval and 3072 secondary fallback
- scope-aware memory shaping has begun to move from loose labels toward real boundaries

Primary repo surfaces include:
- `lib/ragMemory.ts`
- `lib/memory/vectorStore.ts`
- `lib/context/preparedContext.ts`
- `lib/memoryPromotion.ts`

#### Prepared Context Layer
Prepared context is a major architectural step already landed.
It moves the system away from naive raw-history stuffing and toward structured context assembly.

#### Workspace Memory Direction
Workspace-scoped memory reads and writes now exist operationally, though the current implementation still relies heavily on metadata-backed workspace binding rather than a first-class relational `workspace_id` column on `memory_bank`.

### Emerging
#### Reward-Shaped Memory Behavior
The architecture direction toward reward-aware memory reinforcement, decay, and retrieval shaping is real, but it should be described carefully.

Safer current phrasing:
- provider/dimension-aware retrieval is implemented
- reward-aware memory shaping is emerging
- full utility/reward optimization should not yet be overstated as universally live across every path

### Implemented / Emerging mix
#### Fact Extraction and Structured Memory Capture
Structured fact extraction exists and has been actively hardened.
This is a major part of the substrate because it allows the system to build memory from interaction content instead of storing only chat transcripts.

Primary surfaces include:
- `lib/agents/factExtractor.ts`
- `lib/world-model/delta/ClaimExtractor.ts`

---

## 3. Knowledge Graph and World Model

### Implemented
The system has real graph/world-model direction and code, including:
- graph storage concepts
- relationship extraction
- trust-tagging and fact/claim pathways
- temporal/historical reasoning direction

Primary surfaces include:
- `lib/memory/graphStore.ts`
- `lib/world-model/trustTag.ts`

### Emerging
The full world-model maturity should not be overstated as if every path is uniformly production-hardened. The better claim is:
- graph/world-model infrastructure is meaningful and strategically important
- it is an active substrate, not just an idea
- some higher-order trust / delta / projection loops remain a growing system rather than a finished one

### Strategic value
This layer is one of the strongest long-term moats because it allows Lattice OS to:
- distinguish durable facts from transient conversation text
- preserve temporal context
- compound knowledge over time
- support future Relay observations without overwriting history

---

## 4. Routing and Runtime Intelligence (UCOL)

### Implemented
#### Routing Decision Scaffold
There is now a real UCOL routing substrate, including:
- routing decision scaffold
- enriched signal handling
- shared provider-resolution logic
- memory-plan threading into conversation execution

Primary surfaces include:
- `lib/ucol/routing/decision.ts`
- `lib/ucol/routing/providerResolver.ts`
- `lib/ucol/routing/types.ts`
- `lib/llm/conversationEngine.ts`

#### Workspace / Operating Profile Runtime Context
The runtime has materially shifted toward using workspace and operating-profile context to influence execution behavior.
This is a major architectural truth, not cosmetic framing.

### Emerging
#### Bandit / Utility Optimization Language
The architecture increasingly talks in terms of utility routing, contextual bandits, and background optimization. That direction may be right, but the wording should remain claim-safe:
- routing intelligence direction is real
- optimization logic exists in part or in scaffolded form
- do not imply every bandit/reward loop is fully active end-to-end unless specifically verified

### Best current phrasing
UCOL is best described as an **emerging runtime contract layer** that already meaningfully shapes provider resolution, memory planning, and workspace-aware execution, while broader optimizer loops are still maturing.

---

## 5. Agentic Execution Substrate

### Implemented
There are genuine agentic primitives in the codebase, including:
- ReAct-style loop machinery
- tool registry structure
- tool execution pathways with approval-aware design
- specialized agents such as error-resolution and codebase exploration support

Primary surfaces referenced in recent discussion include:
- `lib/agents/core/reactLoop.ts`
- `lib/agents/core/registry.ts`
- `lib/ucol/toolExecutor.ts`
- `lib/ucol/agents/MctsResolverNode.ts`
- `lib/ucol/agents/errorResolutionAgent.ts`
- `lib/ucol/agents/codebaseExplorer.ts`

### Emerging
The correct interpretation is:
- Lattice OS already has meaningful agentic execution primitives
- it does not yet have a fully productized persistent Relay operator working across user workspaces and devices

### Important distinction
This is the difference between:
- request-scoped agentic bursts
and
- persistent supervised workspace operation

That distinction should remain explicit.

---

## 6. Relay / Weaver / Lattice Role Split

### Implemented as architectural identity
The naming and role structure are now important enough to treat as a durable part of the system architecture:
- **Lattice OS** = product / operating layer
- **Weaver** = customer-facing intelligence surface
- **Relay** = internal orchestration / workspace agent
- **UCOL** = routing / memory / execution contract layer

### Strategic importance
This split matters because it prevents the product from collapsing all roles into “the chatbot.”
It also creates a clean target architecture for future device and workspace autonomy.

---

## 7. What “Supervised Workspace Intelligence” Means

### Cleaner wording
The best near-term description is not unrestricted autonomy.
It is:
- asynchronous
- memory-aware
- workspace-native
- policy-bounded
- audit-friendly
- supervised

### Why this matters
This framing is stronger than vague autonomy language because it aligns with the actual architecture:
- approval boundaries
- safety gates
- explicit tool execution
- future tracing expectations
- workspace and memory as the core operating context

---

## 8. Missing Bridges to Persistent Relay Operation

### Planned / Scaffolded / Emerging mix
The architecture can already point toward Relay, but several critical bridges still need to be built.

### Gap A — Persistent Agent Execution
The biggest missing technical bridge is persistent execution beyond the request lifecycle.

Current state:
- agentic machinery exists
- most execution is still fundamentally request-scoped

Needed:
- durable task records
- resumed/continued task execution
- async background runners
- task lifecycle visibility

### Gap B — Device Perception Layer
A true Relay client needs a way to perceive device state.
This includes future notions like:
- files
- screen context
- notifications
- app state
- clipboard or OS context

Current state:
- device context concepts exist in architecture discussion and typing direction
- the real perception pipeline is not yet implemented end-to-end

### Gap C — Device Action Harness
Server-side tools are not the same thing as device-side actuation.
A device-oriented Relay path needs:
- action schema
- command queue
- result reporting
- scoped/sandboxed execution model

### Gap D — Relay Client Surfaces
The actual user-device software surface is still largely a future product effort.
This includes potential desktop/mobile clients and background services.

### Gap E — Full Observability / Tracing
Persistent agent operation requires stronger traceability:
- what was perceived
- what was chosen
- what happened
- what was approved or rejected

This is not optional for trust.

---

## 9. Procedural Memory as a Strategic Moat

### Emerging / Strategic
Procedural memory may become one of the strongest long-term differentiators.

Why:
- it turns repeated successful execution into reusable operational habit
- it reduces repeated reasoning cost for known workflows
- it makes Relay feel increasingly native to the user’s workspace over time

Best framing:
Procedural memory is a candidate foundation for future habitual automation, but its role in broad product behavior should still be treated as emerging rather than universally operational.

---

## 10. Append-Only Digital World Model Potential

### Emerging direction
One of the most interesting long-range directions is using memory + graph + trust layers to form an append-only digital world model of the user’s workspace and activity.

This matters because it could support:
- historical continuity
- temporal reasoning
- durable workspace state
- future device observations without destructive overwrite

This is a powerful architectural direction, but it should remain claim-safe unless the observation and Relay pathways are actually wired.

---

## 11. Transition Ladder

### Stage 1 — Reactive LLM Chat
User asks → model responds → memory may be captured.

### Stage 2 — Server-Side Agentic Task Execution
Goal is decomposed server-side → tools execute → result returns → memory/graph update path strengthens.

### Stage 2.5 — Workspace-Native Supervised Agents
Asynchronous execution, workspace-bound tasks, persistent context, and bounded tools begin to make Relay feel operational even before full device autonomy.

### Stage 3 — Persistent Relay on Workspaces / Devices
Relay operates across device/workspace surfaces with perception, memory, execution, and reporting loops.

### Why this ladder matters
It is more truthful than jumping directly from chat to full autonomy.
It also better fits the actual implementation path visible in the repo and recent product work.

---

## 12. Non-Negotiable Safety and Trust Constraints

### Critical constraints
Any future device/workspace autonomy should preserve:
- no silent destructive action execution
- approval requirement for high-risk actions
- auditable execution trails
- privacy-aware memory storage
- deletability / exportability of durable user data
- bounded, explicit policy surfaces

### Strategic framing
The product should treat supervised autonomy as a trust design problem, not just a capability problem.

---

## 13. Bottom-Line Architecture Position
Lattice OS is best understood as:

> a memory-native, workspace-centric intelligence platform that already contains real routing, memory, graph, and early agentic execution substrates, and is evolving toward supervised persistent workspace intelligence through Relay rather than remaining a reactive chat surface.

This is already a stronger and more defensible story than “multi-model chatbot.”

The most honest current stance is:
- memory substrate = real
- routing substrate = real and growing
- agentic substrate = real but not yet equivalent to persistent autonomy
- Relay/device operation = strategic next-layer, not finished current-state reality

## Related Pages
- [lattice-os-identity-architecture-memo](lattice-os-identity-architecture-memo.md)
- [lattice-os-differentiation-byom-ucol-memo](lattice-os-differentiation-byom-ucol-memo.md)
- [ai-saas-to-ucol-contract-mapping](ai-saas-to-ucol-contract-mapping.md)
- [memory-scope-contract-and-enforcement](memory-scope-contract-and-enforcement.md)
- [workspace-architecture-transition-protocol](workspace-architecture-transition-protocol.md)
