# ADR-008: Separate Public Light Theme from Authenticated Product Theme

## Status
Accepted

## Context
The platform contains both public marketing/informational surfaces and authenticated product surfaces. Applying the same theme assumptions to both created design and product clarity problems, especially when public pages needed a stronger light-mode identity while the authenticated product remained more stable in a dark-first presentation.

## Decision
Treat public/unauthenticated theme behavior separately from authenticated/product theme behavior.

Public surfaces may evolve with their own light-theme palette system, while authenticated product surfaces can remain dark-first until a separate migration plan exists.

## Consequences
### Positive
- reduces risk of destabilizing product UI while improving public presentation
- allows a stronger visual identity for public-facing pages
- keeps theme work more scoped and reviewable

### Tradeoffs
- increases design-system complexity across route classes
- requires documentation and discipline around where each palette family applies
- can create temporary asymmetry between public and authenticated experiences
