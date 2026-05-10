# Runtime Mode Routing

## Purpose

This document explains how Genie AI determines runtime behavior for conversation requests.

It exists because the platform is moving away from a simplistic client-controlled mode toggle model and toward a more honest server-resolved routing model based on application context.

The goal of this document is to clarify:
- where runtime mode is decided
- what context influences that decision
- how pre-workspace and workspace-backed conversations differ
- how to reason about debugging and future extension

---

## Core Principle

Runtime mode should be resolved by the server, not trusted directly from arbitrary client intent.

In practical terms, this means the system should increasingly derive runtime behavior from:
- conversation context
- workspace context
- operating profile context
- backend routing logic

rather than from a frontend control claiming to set the final mode directly.

---

## Why This Exists

Earlier product behavior could create a mismatch between:
- what the UI claimed the mode was
- what the backend actually did
- what the user should reasonably expect

This is especially problematic in a system that wants to support:
- budget-aware behavior
- workspace-aware behavior
- profile-aware behavior
- future memory-native execution patterns

A server-resolved routing model is more truthful and more extensible.

---

## High-Level Runtime Routing Model

At a high level, a conversation request flows through these routing stages:

1. request enters chat API layer
2. server identifies conversation context
3. server identifies whether a workspace is involved
4. server resolves any operating-profile influence
5. runtime mode is mapped server-side
6. model/provider behavior is selected accordingly
7. response is returned with optional debug visibility

This means the backend is the final authority on effective runtime mode.

---

## Key Context Sources

## 1. Conversation Context

The server first needs to understand what conversation the request belongs to.

### Why it matters
Conversation state can determine:
- whether a request is part of a general chat flow
- whether it is attached to a workspace-backed flow
- whether historical or contextual routing rules should apply

---

## 2. Workspace Context

Workspace context is a major architectural routing input.

### Why it matters
A workspace-backed conversation can carry:
- stronger organizational context
- different memory expectations
- profile-linked runtime behavior
- future retrieval/context differences

This is one of the reasons the platform is moving away from a universal chat-mode toggle model.

---

## 3. Operating Profile Context

Operating profiles are intended to shape runtime behavior more honestly than a generic “fast vs quality” UI switch.

### Why it matters
An operating profile can express:
- expected depth/behavior
- cost/latency tradeoffs
- future preference structures
- mode-selection logic aligned with the user/workspace model

This makes runtime routing a platform behavior, not just a UI preference.

---

## General vs Workspace-Backed Conversations

## General / Pre-Workspace Behavior

Before a conversation is truly anchored in a workspace/profile structure, the platform has moved toward a simplified and more honest default behavior.

### Practical outcome
The user-facing pre-workspace mode is effectively:
- **General**

### Why
This avoids pretending that the user is choosing a deep backend mode when the server-side context for such differentiation may not yet exist.

---

## Workspace-Backed Behavior

Once a conversation is associated with a workspace and potentially influenced by an operating profile, runtime routing becomes more context-sensitive.

### Practical outcome
The effective mode can be derived from:
- workspace state
- operating profile signals
- backend mapping logic

This is where the more advanced runtime architecture belongs.

---

## Server-Side Resolution

The current architectural direction is that the chat route should resolve runtime mode on the server.

### Why this is important
It ensures that:
- the effective mode matches actual backend logic
- UI simplification does not reduce backend flexibility
- future routing rules can evolve without lying to the user
- debugging can focus on one authoritative routing layer

---

## Relationship to UI Controls

## Old mental model
A user taps a client-side mode switch and the mode is simply whatever the client says it is.

## Current direction
The client may expose limited UX state, but the backend determines the effective runtime behavior.

### Why this matters
This prevents a class of misleading UX where:
- the UI suggests one behavior
- the server silently does something else

A smaller, more honest client surface is better than a larger fake-control surface.

---

## Debugging Aids

The system has used debug headers to make runtime behavior more inspectable.

### Known examples
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

### Why these help
They allow the team to verify:
- what mode the server actually resolved
- what model path was chosen
- whether runtime routing aligns with expectations under different conversation/workspace states

These headers are especially useful when debugging differences between:
- general conversation flows
- workspace-backed conversation flows
- profile-influenced routing

---

## Current Architectural Intent

Runtime routing should increasingly reflect this principle:

> the system should choose behavior based on application context rather than asking the user to simulate backend routing manually.

This is more aligned with the broader platform direction toward:
- workspace-centric behavior
- operating-profile-derived runtime logic
- memory/context-aware execution

---

## Common Failure Modes

## 1. UI/Backend Mismatch
The frontend presents a mode label that does not match actual backend routing behavior.

## 2. Context Loss
The backend fails to recover the right conversation/workspace/profile context, causing fallback to a less specific mode than intended.

## 3. Debug Opacity
The system resolves a mode internally but gives too little visibility for verification.

## 4. Overgrowth of Client Controls
The frontend accumulates too many mode toggles before the backend context model is mature enough to justify them.

---

## Why “General” Matters

The introduction of a simpler **General** mode on pre-workspace flows is not a regression.
It is a truthfulness improvement.

### What it avoids
- fake precision in the UI
- premature exposure of backend routing complexity
- misleading promises about control that the backend does not truly honor yet

### What it enables
- cleaner runtime architecture
- stronger future workspace/profile routing
- simpler debugging
- more trustworthy UX

---

## Forward Direction

This routing model becomes more powerful as other systems mature, especially:
- operating profile design
- memory/context preparation
- workspace-first application flows
- retrieval and context-layer composition

Over time, runtime mode routing can become a richer policy layer rather than a simple mode switch.

---

## Recommended Related Docs

This document should be read alongside:
- `docs/architecture/system-architecture.md`
- `docs/security/public-routes.md`
- future `docs/architecture/memory-and-context-architecture.md`
- future API/runtime reference docs

---

## Summary

The most important idea is simple:

**Genie AI should resolve runtime behavior from context on the server, not pretend the client alone controls the final mode.**

That is the backbone of a more honest and more extensible AI platform architecture.
