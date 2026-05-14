# Lattice OS Documentation

This documentation is intended to make the Lattice OS codebase and platform behavior legible to developers, collaborators, reviewers, and future maintainers.

The goal is clarity over marketing.

## Documentation Principles

- explain what the system actually does
- separate stable behavior from evolving architecture
- make trust boundaries visible
- document real technology choices explicitly
- prefer concrete descriptions over vague AI language

## Backbone Docs

### Overview
- `overview/technology-transparency.md` — explicit technology stack and platform surfaces
- `overview/seo-strategy.md` — brand-aligned SEO positioning, metadata direction, and content architecture for Lattice OS

### Architecture
- `architecture/system-architecture.md` — high-level system structure, major components, and data/control flow

## Planned Next Layers

### Architecture
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Security
- `security/public-routes.md`
- `security/trust-boundaries.md`

### Operations
- `operations/truth-surfaces.md`
- `operations/deployment.md`

### Reference
- `reference/api-reference.md`
- `reference/environment-variables.md`

### Decisions
- `decisions/adr-001-*.md`

## Notes

These docs should evolve with the product.
When behavior changes, documentation should be updated as part of the implementation rather than treated as an afterthought.
