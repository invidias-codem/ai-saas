# Lattice OS Identity Architecture Memo

> Note: For the broader current-state architecture and claim-tiered implementation review, see [lattice-os-architecture-memo-2026-05](lattice-os-architecture-memo-2026-05.md).

## Purpose

This memo defines the identity architecture for the evolving Lattice OS product family.

It is meant to prevent the rebrand from collapsing into loose naming changes or vague AI-product language. The naming should map to real system behavior, real architectural layers, and a believable product posture.

This document should guide:
- runtime terminology
- prompt/system identity
- docs language
- public landing/support copy
- future Android/mobile positioning
- multimodal routing narrative

---

## Core Position

Lattice OS should not be framed as:
- a generic chatbot
- a prompt router with nice branding
- an “all-in-one AI assistant” with shallow memory claims
- a hidden autonomy narrative

Lattice OS should be framed as:

> a workspace-native, memory-aware intelligence operating layer that routes work across context, models, tools, and devices.

This is the core identity anchor.

---

## The Four-Layer Identity System

## 1. Lattice OS
### Meaning
Lattice OS is the **product / operating substrate**.

### Role
It is the environment where:
- workspace context lives
- memory persists
- routing decisions are made
- tools and models are orchestrated
- durable task continuity is preserved

### Product definition
Lattice OS is not “the assistant.”
It is the **system** that hosts memory-native intelligence.

### Good framing
- operating layer
- workspace-native intelligence platform
- memory-aware execution substrate
- provider-agnostic orchestration system

### Bad framing
- just another AI assistant
- chat wrapper with tools
- model marketplace with a skin

---

## 2. Weaver
### Meaning
Weaver is the **user-facing intelligence surface**.

### Role
Weaver is what the user experiences as the active, helpful, conversational intelligence.

Weaver should feel like:
- coherent across turns
- grounded in memory
- aware of workspace context
- able to carry work forward
- multimodal-ready over time

### Product definition
If Lattice OS is the system, Weaver is the **presence the user talks to**.

### Good framing
- customer-facing intelligence
- memory-aware guide/worker inside Lattice OS
- workspace-facing conversational and execution surface

### Bad framing
- mystical persona detached from architecture
- generic chatbot character
- over-anthropomorphized AGI mascot

---

## 3. Relay
### Meaning
Relay is the **internal routing/orchestration agent**.

### Role
Relay sits behind the scenes and helps:
- interpret requests
- shape routing decisions
- coordinate tools/providers
- mediate execution plans
- carry work across layers

Relay is a strong internal identity because it suggests:
- connection
- handoff
- transport of intent/context/work

### Product definition
Relay is not primarily a public mascot.
It is the internal intelligence layer that helps Lattice OS route and orchestrate work.

### Good framing
- orchestration layer
- routing agent
- internal handoff/control intelligence

### Bad framing
- second visible chatbot competing with Weaver
- vague “agent swarm” branding without system boundaries

---

## 4. UCOL
### Meaning
UCOL is the **contract/protocol layer** that compiles requests into execution plans.

### Role
UCOL should remain architectural and structural.
It governs the system’s internal logic for:
- request classification
- context resolution
- memory planning
- provider/tool selection
- writeback planning
- continuity across devices and tasks

### Product definition
UCOL is not the user-facing brand surface.
It is the internal operating contract that makes the platform coherent.

### Good framing
- request routing contract
- memory/execution planning layer
- internal protocol/architecture system

### Bad framing
- consumer-facing mascot term
- catch-all marketing slogan
- empty acronym without operational meaning

---

# Identity Hierarchy

The hierarchy should remain:

- **Lattice OS** = system / product
- **Weaver** = user-facing intelligence
- **Relay** = internal orchestrator
- **UCOL** = routing + memory + execution contract

This hierarchy matters because it avoids role confusion.

---

## Product Posture

## What Lattice OS should feel like
It should feel:
- calm
- competent
- memory-native
- operationally honest
- execution-capable
- workspace-grounded
- adaptable across providers/models
- ready for multimodal evolution

## What it should not feel like
It should not feel:
- like an AI hype machine
- like a bundle of random model endpoints
- like vague “agent” marketing
- like a productivity toy with fake memory
- like it is pretending to be fully autonomous without guardrails

---

# The Narrative Difference

## Commodity framing to avoid
“Use the best AI model for every task.”

That is too close to prompt-router/platform commodity positioning.

## Better Lattice OS framing
“Lattice OS routes work through memory, policy, and execution.”

That is stronger because it points to:
- continuity
- work orchestration
- durable context
- provider abstraction
- workspace-native intelligence

## Strong concise line
> Lattice OS does not just answer prompts. It carries work forward.

---

# Relationship to Current Architecture

This identity memo should be anchored in real system behavior, not future fantasy.

## Already true enough to support the brand
- UCOL routing scaffold exists
- routing decisions are now represented in runtime code
- memory planning is threaded into the engine
- prepared context is scope-aware
- workspace memory retrieval now exists
- workspace memory writes are being formalized
- provider resolution is moving toward a cleaner substrate

## Not yet fully true
- complete provider registry/capability routing
- mature device scope implementation
- task-scope durability as a first-class runtime contract
- full multimodal pipeline execution

### Rule
Brand language should lean on what is real now, while clearly reserving more ambitious claims for roadmap/vision language.

---

# Multimodal Identity Implications

Lattice OS should be presented as **multimodal-ready**, not as if full omni-modality is already complete.

## Good framing
- designed for text, image, document, and future audio/video routing
- modality-aware execution path
- workspace-native multimodal memory grounding

## Bad framing
- “full omniscient omni-agent already solved”
- overclaiming video/audio capabilities before operational truth exists

The architecture direction supports multimodal growth; marketing should stay disciplined about implementation reality.

---

# Mobile / Android Identity Implications

This identity system also gives the Android future a cleaner narrative.

## Good mobile framing
Lattice OS on Android should feel like:
- a supervised workspace-native intelligence layer
- a persistent bridge between cloud memory and device context
- a governed execution surface, not hidden phone control

## Identity mapping
- Lattice OS = operating system layer across cloud + device
- Weaver = user-facing intelligence on mobile
- Relay = orchestration between device and cloud
- UCOL = same contract, new device-aware execution surface

This is much stronger than shipping “a mobile AI app” with generic assistant branding.

---

# Tone Guidance

## Internal/runtime tone
- precise
- grounded
- operational
- memory-aware
- avoids fake omniscience

## External/public tone
- serious but accessible
- systems-oriented
- continuity- and execution-focused
- not overhyped

## Avoid
- “magical” metaphors that outrun capability
- AGI posturing
- pseudo-spiritual language
- generic startup “copilot for everything” phrasing

---

# Recommended Usage Guidance

## Use “Lattice OS” when talking about:
- the platform
- the operating layer
- the product vision
- system architecture

## Use “Weaver” when talking about:
- the intelligence the user interacts with
- cross-turn continuity
- task/help/execution assistance

## Use “Relay” when talking about:
- orchestration
- routing
- handoff
- internal planning/execution flow

## Use “UCOL” when talking about:
- request contracts
- routing logic
- memory/execution planning
- architecture docs / internal implementation

---

# Recommended Next Rebrand Work

## 1. Runtime/system prompt pass
Ensure prompt identity reflects:
- Lattice OS substrate
- workspace-native behavior
- memory-aware continuity
- execution honesty

## 2. Docs/platform language pass
Update docs so they consistently describe:
- Lattice OS as the system
- Weaver as the user-facing intelligence
- Relay/UCOL as internal layers

## 3. Public landing/support/docs copy pass
Replace lingering:
- Tech Genie
- Genie
- generic chatbot framing
with the new system language where appropriate.

## 4. Multimodal narrative memo
Follow this with a separate memo on how multimodal routing fits the identity system, especially after recent vLLM-Omni discussion.

---

# Bottom Line

The rebrand should not be treated as a cosmetic rename.
It should reflect a system that is increasingly real in code:
- workspace-native
- memory-aware
- provider-agnostic
- execution-capable
- multimodal-ready

The identity architecture should remain:
- **Lattice OS** = the system
- **Weaver** = the intelligence the user talks to
- **Relay** = the internal orchestrator
- **UCOL** = the routing/memory/execution contract

That gives the product a clearer center of gravity and prevents the brand from collapsing back into generic assistant language.
