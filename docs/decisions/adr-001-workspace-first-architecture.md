# ADR-001: Workspace-First Architecture

## Status
Accepted

## Context
The platform was evolving beyond a generic chatbot/tool-page product shape. Treating conversations as isolated free-floating threads weakened context organization, future memory boundaries, and runtime behavior shaping.

## Decision
Adopt a workspace-first architectural direction where workspace becomes the primary container for meaningful product activity.

Conversations should increasingly live inside workspace context rather than serving as the sole organizing primitive.

## Consequences
### Positive
- stronger context organization
- better foundation for future memory boundaries
- better fit for profile-aware runtime behavior
- more coherent product identity

### Tradeoffs
- more complexity in routing and onboarding
- requires backend/runtime changes, not just UI changes
- increases schema and data-model coordination requirements
