# Workspace and Operating Profile Model

## Purpose

This document explains the relationship between **workspaces** and **operating profiles** in Genie AI.

It exists because this model is one of the most important shifts in the platform’s architecture and product identity.

Genie AI is evolving away from a simpler “chat plus tool pages” pattern toward a more structured system where:
- workspace is the primary organizational container
- operating profile shapes runtime behavior
- conversations increasingly inherit context from that structure

This document clarifies that model at a conceptual and architectural level.

---

## Core Principle

The platform should not treat every conversation as a contextless generic chat thread.

Instead:
- **workspace** provides the container
- **operating profile** provides behavioral shape
- **conversation** becomes an active thread inside that structure

This is the backbone of a more memory-native, cost-aware, and context-aware product.

---

## Why This Model Exists

A generic chatbot model tends to flatten everything into one surface:
- same context assumptions
- same runtime assumptions
- same cost/quality assumptions
- weak organizational boundaries

That approach breaks down when the platform wants to support:
- differentiated runtime behavior
- stronger context preparation
- meaningful user organization
- future memory boundaries
- budget-conscious product strategy

The workspace + operating-profile model is intended to solve that.

---

## Primary Objects

## 1. Workspace

### What it is
A workspace is the primary container for a meaningful unit of user activity.

### What it represents
A workspace can represent:
- a project
- a domain of work
- a persistent context container
- a future memory boundary
- a runtime-scoping unit

### Why it matters
A workspace gives the platform a place to attach:
- conversations
- memory/context behavior
- future knowledge structures
- profile-shaped runtime assumptions

Without a real workspace model, context and behavior stay too flat.

---

## 2. Operating Profile

### What it is
An operating profile is a structured description of how the system should behave for a given user/workspace context.

### What it influences
An operating profile can shape:
- runtime mode selection
- cost/latency/quality tradeoffs
- future context-selection policies
- style and system behavior expectations
- how the platform balances capability with efficiency

### Why it matters
An operating profile is more honest and extensible than exposing a simplistic “fast / quality / agentic” mode toggle without enough backend context to support it properly.

---

## 3. Conversation

### What it is
A conversation is the active interaction thread inside the workspace/profile model.

### Why it matters
A conversation should no longer be treated as a free-floating isolated object by default.

Instead, a conversation increasingly derives meaning from:
- its workspace membership
- its profile-linked runtime behavior
- future memory/context layers attached to that structure

---

## Relationship Between the Three

At a conceptual level:

- **workspace** = where the work lives
- **operating profile** = how the system should behave in that environment
- **conversation** = the active thread happening within that structure

This relationship is one of the most important product abstractions in Genie AI.

---

## Workspace as Primary Container

The platform direction increasingly treats workspace as the main runtime container.

### Why this is important
A workspace can anchor:
- organizational identity
- memory scope
- future retrieval scope
- runtime policy
- conversation grouping

### Architectural implication
This means workspace is not just a sidebar label or cosmetic folder.
It is intended to become part of the real runtime model.

---

## Operating Profile as Runtime Policy Layer

An operating profile should be understood as a policy layer rather than just a preference label.

### It can eventually express things like
- whether behavior should optimize more for speed or depth
- whether certain workflow patterns are expected
- what kind of context assembly is appropriate
- how to trade off capability, cost, and latency in a more structured way

### Why this matters
This creates differentiation without pretending there is one universally optimal expensive mode for every conversation.

It also aligns with the broader product direction of being more budget-aware and profile-shaped rather than “one premium mode for everything.”

---

## Why This Is Better Than Generic Chat Modes

A simple client-side mode switch is easy to expose, but weak architecturally.

### Problems with naive chat modes
- they can misrepresent what the backend actually does
- they ignore workspace context
- they do not scale well into memory-aware behavior
- they often create fake precision in the UI

### Advantages of workspace + operating profile
- behavior can be derived from richer context
- runtime routing becomes more honest
- product behavior becomes more composable
- future memory/retrieval layers have a stable container model

---

## Relationship to Runtime Mode Routing

The workspace/operating-profile model is one of the main reasons runtime mode routing moved toward server-side resolution.

### Why
The backend needs to inspect:
- what conversation this is
- which workspace it belongs to
- whether a profile should shape behavior

This is stronger than asking the client to guess the final mode manually.

---

## Relationship to Memory and Context Architecture

The workspace/operating-profile model also matters because memory and context preparation need boundaries.

### Workspace can provide
- context scope
- memory container identity
- future retrieval boundary

### Operating profile can provide
- context-selection policy hints
- expected behavior shape
- future memory/runtime balancing rules

This is why these systems should be understood together, not independently.

---

## General / Pre-Workspace Flows

The platform still needs to support users before full workspace anchoring is established.

### Current design implication
Pre-workspace or lightly-scoped chat is intentionally simplified and more honest.

### Example
The move toward a single **General** pre-workspace mode reflects this.

### Why
It avoids pretending that the platform already has the rich workspace/profile context needed to justify deeper backend behavioral differentiation.

---

## Onboarding Implications

A meaningful onboarding flow should not only create a user account.
It should help instantiate the actual runtime structure of the platform.

### In practical terms, onboarding should move toward creating
- a personalized operating profile
- a starter workspace
- a starter conversation/path into that workspace

### Why this matters
This makes onboarding part of the architecture, not just account setup.

---

## Cost and Product Strategy Implications

This model also supports an important product strategy idea:

### Instead of
one default expensive “best” mode for everyone,

### the platform can aim for
profile-shaped runtime economics and behavior.

That allows the product to pursue:
- stronger alignment between user needs and system behavior
- better cost discipline
- more meaningful differentiation at a lower price point

This is a serious product advantage if implemented honestly.

---

## Common Failure Modes

## 1. Workspace as Cosmetic Shell
A workspace exists in the UI but does not actually influence runtime/context behavior.

## 2. Operating Profile as Empty Label
A profile exists in the DB/UI but does not shape real backend behavior.

## 3. Conversation Re-Centralization
The system keeps falling back to treating conversations as the real primary object, undermining the workspace model.

## 4. UI Promises Ahead of Backend Reality
The frontend exposes profile/mode controls that the backend cannot yet honor faithfully.

## 5. Onboarding Without Runtime Structure
Users appear “set up” but do not actually have the workspace/profile state needed for the intended architecture.

---

## Honest Product Framing

The workspace/operating-profile model should be described plainly.

### Good framing
- workspaces organize active context and future memory scope
- operating profiles help shape backend behavior
- conversations live inside that structure
- runtime behavior is increasingly resolved from this model server-side

### Bad framing
- “the AI automatically becomes whatever you want everywhere instantly”
- “profiles guarantee perfect intelligence mode selection”
- “workspace means folder, but also everything else somehow”

Precision builds trust.

---

## Forward Direction

This model becomes more valuable as the rest of the platform matures:
- server-side runtime routing
- prepared context pipelines
- memory-native behavior
- graph/retrieval augmentation
- workspace-scoped persistence and knowledge behavior

The more those systems become real, the more important the workspace/operating-profile abstraction becomes.

---

## Summary

The key idea is this:

**Workspace defines where the work lives. Operating profile helps define how the system should behave there. Conversation is the active thread inside that structure.**

That is one of the central architectural ideas in Genie AI’s evolution beyond a generic chatbot product.

---

## Related Docs

This document should be read alongside:
- `docs/architecture/system-architecture.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/architecture/memory-and-context-architecture.md`
- future onboarding, API, and ADR documentation
