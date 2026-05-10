# ADR-011: Public Route Verification Through Real Entry Paths

## Status
Accepted

## Context
Public route bugs can hide when developers verify routes only by direct URL access instead of the real public UI entry path that users follow.

## Decision
Public-route verification should include testing through the actual public entry path (for example Support → View Docs), not only direct route access.

## Consequences
### Positive
- catches navigation-linked auth and route-boundary regressions earlier
- aligns verification with real user behavior

### Tradeoffs
- adds an extra verification step
- slightly increases the effort required for route changes
