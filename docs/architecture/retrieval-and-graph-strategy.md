# Retrieval and Graph Strategy

## Purpose

This document explains the retrieval and graph-oriented architectural direction in Genie AI.

It exists because the platform’s context and memory direction is not well described by a simple “we use RAG” label.

The broader architectural goal is more specific:
- prepared context rather than raw transcript stuffing
- retrieval as a structured support layer
- future graph-aware composition rather than flat nearest-neighbor thinking alone

This document describes that direction at a high level.

---

## Core Principle

Retrieval should support context assembly, not replace architecture.

In other words:
- retrieval is not the whole memory system
- embeddings are not the whole intelligence layer
- graph structure is not valuable unless it improves relevance, boundaries, or explainability

The point is to improve how context is selected and composed.

---

## Why “Just Use RAG” Is Not Enough

The phrase “RAG” is often too vague to be useful architecturally.

It can mean very different things in practice:
- stuffing retrieved chunks into prompts
- semantic search over documents
- tool-augmented retrieval flows
- hybrid retrieval pipelines
- memory systems with weak structure

For Genie AI, the more important question is:

**what role should retrieval play inside a workspace-centric, context-prepared architecture?**

---

## Retrieval as a Support Layer

The intended direction is that retrieval should help answer questions like:
- what supporting material is relevant right now?
- what workspace-linked information should influence this run?
- what context should be elevated without bloating the prompt?

This makes retrieval a context-selection mechanism, not an end in itself.

---

## Relationship to Prepared Context

Prepared context is the central architectural pattern.

Retrieval and graph-aware systems should plug into that pattern by contributing:
- relevant support material
- structured relationship context
- bounded memory cues

They should not simply dump large amounts of semantically related text into the model and call that architecture.

---

## Workspace-Scoped Retrieval

A workspace-first product needs retrieval that respects scope.

### Why this matters
Without workspace boundaries, retrieval can become:
- too broad
- too noisy
- too leaky
- too hard to trust

### Intended direction
Retrieval should increasingly be able to operate within meaningful scope, such as:
- workspace boundaries
- project boundaries
- user-specific context boundaries

That is much more aligned with the product than generic global semantic lookup.

---

## Graph Direction

The codebase and surrounding planning have pointed toward graph-first or graph-augmented thinking.

### What that suggests
Rather than treating all supporting information as isolated chunks, the platform may eventually represent and use:
- relationships between concepts
- related entities or artifacts
- structured support links
- graph-aware relevance composition

### Why this is attractive
A graph-aware direction can improve:
- relevance precision
- compositional context
- traceability of related material
- future memory organization

---

## Graph as Structure, Not Hype

Graph direction should be documented carefully.

### Good framing
- a way to represent relationships among relevant objects and ideas
- a support structure for retrieval/context composition
- a possible path to better memory organization

### Bad framing
- “the graph solves intelligence”
- “graph means we no longer need context selection discipline”
- “graph retrieval is automatically superior in every case”

Graph only matters if it makes the system more useful and more understandable.

---

## Hybrid Retrieval Direction

A mature version of this architecture may eventually combine multiple retrieval/logical surfaces such as:
- semantic retrieval
- workspace-scoped selection
- graph-aware relatedness
- policy-based context inclusion
- future profile-aware retrieval weighting

This is a more realistic direction than pretending one vector search pass is the final architecture.

---

## Boundary Importance

Retrieval strategy must respect the same boundary discipline as the rest of the platform.

### Important boundaries
- workspace vs global scope
- public vs private material
- active conversation context vs durable retrieved context
- immediate relevance vs archival presence

Without these boundaries, retrieval becomes harder to trust and easier to misuse.

---

## Risks and Failure Modes

## 1. Flat Chunk Spam
Too much retrieved text enters the model without enough selection discipline.

## 2. Weak Scope Control
Relevant material is retrieved from the wrong workspace or wrong context boundary.

## 3. Semantic Nearness Without Practical Relevance
The retriever returns content that is technically similar but operationally unhelpful.

## 4. Overclaiming Graph Maturity
The system is described as graph-native before the real graph-backed runtime path is stable.

## 5. Architecture by Buzzword
Retrieval, memory, and graph language are used without clear boundaries or actual system roles.

---

## Forward Direction

The likely strong direction for Genie AI is:
- workspace-scoped retrieval
- prepared context assembly
- stronger server-side context selection
- future graph-aware support composition
- memory treated as a structured product primitive

This is a more precise and credible direction than generic “RAG-powered AI” framing.

---

## Summary

The key idea is this:

**Retrieval and graph strategy should exist to improve structured context assembly inside a workspace-centric system, not to replace architecture with buzzwords.**

---

## Related Docs

This document should be read alongside:
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/workspace-operating-profile-model.md`
- `docs/architecture/runtime-mode-routing.md`
- future retrieval implementation and API reference docs
