# ADR-002: Server-Resolved Runtime Mode Routing

## Status
Accepted

## Context
Client-visible mode toggles created a risk that the UI would claim one behavior while the backend actually did something else. This became increasingly problematic as conversations, workspaces, and operating profiles started to influence effective runtime behavior.

## Decision
Resolve effective runtime mode on the server based on trusted application context, including conversation, workspace, and operating-profile signals.

The client may expose simplified mode-related UX, but it should not be treated as the final authority on effective runtime behavior.

## Consequences
### Positive
- more honest system behavior
- better fit for workspace/profile-aware routing
- easier backend evolution without fake UI precision
- improved debugging through server-side truth

### Tradeoffs
- requires stronger backend routing logic
- may reduce apparent user control in the short term
- requires clearer documentation and debug visibility
