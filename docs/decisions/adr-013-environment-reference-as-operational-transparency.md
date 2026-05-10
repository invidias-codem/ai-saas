# ADR-013: Environment Reference as Operational Transparency

## Status
Accepted

## Context
Environment configuration is one of the least visible but most consequential parts of the system. Without a documented environment variable reference, developers and operators are forced to infer runtime configuration behavior from scattered code paths.

## Decision
Maintain a human-readable environment variable reference as part of the repo documentation to improve operational transparency and reduce configuration guesswork.

## Consequences
### Positive
- makes configuration surfaces easier to reason about
- improves onboarding and maintenance
- supports security discipline by clarifying public vs server-only variables

### Tradeoffs
- requires updates when configuration changes
- may lag real code if not maintained intentionally
