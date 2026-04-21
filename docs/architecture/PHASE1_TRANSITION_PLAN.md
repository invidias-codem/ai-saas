# Phase 1 Architecture Transition Plan

## Purpose
This document defines the first transition step for evolving Genie into a cleaner, security-aware, memory-native backend architecture without forcing immediate feature cuts or deletions. Phase 1 focuses on clarifying boundaries, reducing hot-path coupling, and establishing a safer foundation for future refactors.

## Architectural North Star
Genie should converge on four layers:

1. **Product Interface Layer**
   - Next.js routes, user-facing APIs, auth/session entrypoints, settings/account surfaces.
2. **Core Intelligence Layer**
   - Conversation/code orchestration, memory retrieval, routing, credits/budgets, provider abstraction.
3. **Async & Integration Layer**
   - Import/export, sync, webhook handlers, Slack/Telegram/GitHub/Zapier, background indexing.
4. **Experimental Intelligence Layer**
   - UCOL research paths, world-model, critics, benchmark pipelines, advanced autonomous agents.

## Phase 1 Goals
- Create explicit architectural boundaries around core APIs.
- Introduce a stable composition point for security and request guards.
- Keep core user flows (`conversation`, `code`) working unchanged.
- Avoid deletions; prefer extraction, wrapping, and feature-flag-ready boundaries.

## Skill-Informed Design Inputs
This transition is guided by the workspace skill set:

- **backend-architect**
  - clear service boundaries
  - contract-first API design
  - resilience and observability built in
- **backend-security-coder**
  - secure input validation
  - centralized auth and error handling
  - safe defaults for backend code paths
- **api-security-best-practices**
  - rate limiting
  - consistent authz/authn guards
  - safer request/response handling
- **backend-dev-guidelines**
  - layered backend implementation
  - separation of route/controller/service concerns
- **api-design-principles**
  - normalized endpoint contracts
  - explicit request lifecycle ownership

## Current Problem
The current backend has strong capabilities but too much logic is concentrated directly inside route handlers and orchestration files. Security checks, validation, billing, analytics, context gathering, and provider calls are often mixed in the same request path.

This increases:
- cognitive load
- test difficulty
- regression risk
- security review complexity

## Phase 1 Recommendation
Introduce a **Core API boundary** for protected AI endpoints.

### New boundary
`lib/core-api/`

This layer should own reusable request lifecycle concerns for core AI routes:
- auth enforcement
- standardized error responses
- request metadata extraction
- idempotency key normalization
- protected endpoint composition helpers

## First Safe Refactor Slice
Phase 1 implementation will create a small reusable core API module and wire one critical route path to use it safely without changing product behavior.

### Included in this slice
- `lib/core-api/` directory
- reusable protected route helper(s)
- normalized request metadata helper
- no deletions
- minimal behavioral change

### Not included in this slice
- route removal
- feature pruning
- provider changes
- data model migration
- world-model / UCOL rewrites

## Immediate Benefits
- clearer backend ownership
- easier security review
- smaller future refactors
- consistent route hardening pattern
- better path toward separating product/core/supporting/experimental systems

## Recommended Follow-On Phases
### Phase 2
- move shared request guards and validation patterns for `conversation` and `code`
- standardize endpoint contracts for core AI routes

### Phase 3
- extract orchestration service boundaries from large route/controller files
- isolate experimental systems behind explicit interfaces/feature flags

### Phase 4
- align integrations and async systems behind service adapters
- formalize core vs experimental ownership in code structure

## Success Criteria for Phase 1
- a new architectural boundary exists in code
- at least one critical route uses it
- tests pass for affected behavior
- no user-facing regression in core product flow
