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

## Active Documentation

### CLI & Deployment (NEW)
- **lattice-cli v0.3.0** — production-ready CLI for Docker appliance management
  - Location: `scripts/lattice-cli/`
  - Features: authentication, deployment, V3 license activation, health checks, upgrades, backups
  - Deployment pipeline: preflight validation (Docker, Compose v2, RAM/CPU, ports, disk, Docker auth) plus license verification during deploy
  - CI/CD: automated binary builds via GitHub Actions
  - Distribution: `install.sh` script with OS/arch detection
  - See: `scripts/lattice-cli/README.md` for full command reference

### Beta Program (NEW)
- **Beta outreach materials**: `docs/beta-outreach/`
  - Threads DM templates (200-char limit compliant)
  - Email sequences for engaged testers
  - Persona-based engagement strategies
  - Response handling for: "yes", "what is it?", "is it free?", "not now"

- **Beta onboarding guides**: `app/[locale]/(public)/beta/`
  - Quick Start (15 min) - `/beta/start`
  - Developer track (45 min) - `/beta/dev`
  - Enterprise track (1 hour) - `/beta/enterprise`
  - Privacy track (1 hour) - `/beta/privacy`
  - Static site generation for fast load times

### Authentication (UPDATED)
- **PS1/PS2-inspired login experience**
  - Custom Clerk styling with glassmorphism card
  - Animated background with subtle particle effects
  - Retro-modern aesthetic (90s gaming nostalgia)
  - Location: `app/[locale]/(auth)/layout.tsx`

## Planned Next Layers

### Architecture
- `architecture/runtime-mode-routing.md`
- `architecture/memory-and-context-architecture.md`
- `architecture/workspace-operating-profile-model.md`

### Security
- `security/public-routes.md`
- `security/trust-boundaries.md`
- `security/licensing-cryptography.md` — ed25519 V3 license system design

### Operations
- `operations/truth-surfaces.md`
- `operations/deployment.md` — Docker appliance deployment workflow
- `operations/air-gap-deployment.md` — fully offline operation guide

### Reference
- `reference/api-reference.md`
- `reference/environment-variables.md`
- `reference/cli-commands.md` — lattice-cli full command reference

### Decisions
- `decisions/adr-001-*.md`

## Notes

These docs should evolve with the product.
When behavior changes, documentation should be updated as part of the implementation rather than treated as an afterthought.

---

**Last updated:** 2026-06-21
**Version:** 0.3.0 (lattice-cli)
