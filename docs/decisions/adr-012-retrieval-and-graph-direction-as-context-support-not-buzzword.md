# ADR-012: Retrieval and Graph Direction as Context Support, Not Buzzword

## Status
Accepted

## Context
The platform’s retrieval and graph direction can easily be oversimplified into vague “RAG-powered” or “graph-native” claims that do not describe the real intended architecture clearly.

## Decision
Describe retrieval and graph direction as support layers for structured context assembly inside a workspace-centric system, not as standalone substitutes for architecture.

## Consequences
### Positive
- encourages clearer subsystem design
- reduces buzzword-driven architectural drift
- improves transparency about what retrieval/graph layers are actually for

### Tradeoffs
- requires more disciplined language in product and engineering docs
- may feel less flashy than generic AI marketing phrasing
