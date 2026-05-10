# ADR-014: Incident Debugging Begins with Incident Classification

## Status
Accepted

## Context
A recurring failure pattern in this codebase is debugging incidents by intuition, jumping between logs, code, and runtime guesses without first identifying what type of failure is actually happening.

## Decision
Adopt incident classification as the first debugging step, and choose truth surfaces and debugging paths based on the incident class.

## Consequences
### Positive
- reduces flailing during debugging
- improves alignment between problem type and verification method
- supports more disciplined operational response

### Tradeoffs
- adds lightweight process overhead
- requires team discipline to follow consistently
