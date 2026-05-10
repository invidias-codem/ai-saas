# ADR-009: Debug Headers for Runtime Verification

## Status
Accepted

## Context
Runtime behavior increasingly depends on backend context resolution rather than simple client-side claims. This made it necessary to expose lightweight verification signals that could help confirm actual backend decisions during debugging and validation.

## Decision
Use debug headers, where appropriate, to surface important runtime routing information such as effective agent mode and model selection.

Known examples have included headers such as:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

## Consequences
### Positive
- improves runtime transparency
- makes server-resolved behavior easier to verify
- reduces guesswork during debugging

### Tradeoffs
- requires discipline around when and how debug signals are exposed
- must not be mistaken for a complete explanation of system behavior
- can increase debugging surface area if allowed to drift without documentation
