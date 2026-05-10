# ADR-006: Public Docs and Informational Routes Remain Unauthenticated

## Status
Accepted

## Context
The platform includes public informational surfaces such as docs, support, privacy, and other landing-adjacent routes. These routes support discovery, trust, onboarding, and public understanding of the product. Treating them as authenticated-only created user-facing friction and auth-gate regressions.

## Decision
Public docs and other informational surfaces should remain accessible without requiring sign-in, and route-gating logic must explicitly reflect that intent.

## Consequences
### Positive
- lower friction for public users
- better transparency and trust
- clearer separation between informational and product surfaces
- reduces accidental sign-in walls on public routes

### Tradeoffs
- requires explicit route allowlisting discipline
- requires careful review of locale-prefixed and nested public routes
- public availability does not remove the need for narrow trust boundaries on callback/API routes
