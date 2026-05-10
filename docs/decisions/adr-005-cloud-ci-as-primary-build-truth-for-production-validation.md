# ADR-005: Cloud CI as Primary Build Truth for Production Validation

## Status
Accepted

## Context
Local production-build validation became unreliable due to machine constraints and instability. At the same time, production decisions still required trustworthy evidence about whether the codebase could build successfully in a realistic deployment environment.

## Decision
Use cloud CI build validation as the primary truth surface for production-build viability when local build conditions are unreliable.

Local builds remain useful for editing and lightweight checks, but they are not treated as the highest-confidence production-build truth in constrained conditions.

## Consequences
### Positive
- more trustworthy build validation
- better alignment with production-like environment constraints
- reduced reliance on unstable local signals

### Tradeoffs
- slower feedback than some local checks
- requires stronger CI discipline
- does not replace live runtime verification after deploy
