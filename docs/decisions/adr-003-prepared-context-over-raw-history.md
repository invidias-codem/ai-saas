# ADR-003: Prepared Context Over Raw History

## Status
Accepted

## Context
A naive chat architecture that relies mainly on raw rolling transcript history tends to create context bloat, weaker relevance, poorer prompt discipline, and limited future extensibility.

## Decision
Move toward a prepared-context architecture where model input is assembled intentionally from selected layers such as conversation state, workspace context, operating-profile influence, and future retrieval/memory support.

## Consequences
### Positive
- cleaner prompt construction
- better relevance control
- stronger future compatibility with memory-native behavior
- improved architectural clarity

### Tradeoffs
- more implementation complexity
- requires better subsystem boundaries
- demands stronger documentation to avoid seeming opaque
