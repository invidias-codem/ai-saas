# ADR-004: Separate Public and Authenticated Surface Behavior

## Status
Accepted

## Context
The platform contains both public informational surfaces and authenticated product surfaces. Treating these as one undifferentiated application layer caused route-gating confusion, design tension, and trust-boundary issues.

## Decision
Treat public and authenticated surfaces as distinct architectural classes with different route, auth, UX, and operational expectations.

Public routes must be explicitly allowlisted where necessary. Authenticated routes must not inherit public-surface assumptions.

## Consequences
### Positive
- clearer auth behavior
- cleaner route-boundary reasoning
- better support for public docs/support/blog surfaces
- reduced risk of user-facing auth-gate regressions

### Tradeoffs
- requires more explicit route visibility review
- increases discipline required in middleware/proxy updates
- creates more documentation burden around public/protected boundaries
