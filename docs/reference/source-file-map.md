# Source File Map

## Purpose

This document helps developers and reviewers locate important implementation surfaces in the Genie AI / `ai-saas` repository.

It is intended as a navigation aid, not a complete file index.

The goal is to answer:
- where does this kind of behavior live?
- which files should I inspect first for a given subsystem?
- where are the most important route, architecture, and runtime entry points?

---

## High-Level Areas

## App Routes
Primary route and API structure lives under:
- `app/`

### Important subareas
- `app/[locale]/...` — localized page routes
- `app/api/...` — API and route-handler surfaces
- `app/layout.tsx` — root app layout
- `app/globals.css` — global styling layer

---

## Components
Primary UI building blocks live under:
- `components/`

### Important subareas
- `components/landing/` — public/landing UI
- `components/chat/` — chat-specific UI controls
- `components/sidebar.tsx` — major navigation/sidebar behavior
- `components/mobile-sidebar.tsx` — mobile navigation behavior
- `components/theme-provider.tsx` — theme/provider layer

---

## Architecture / Runtime Logic
Important non-UI logic lives under:
- `lib/`

### Important subareas
- `lib/context/` — prepared-context direction
- `lib/llm/` — model/provider and conversation logic
- `lib/workspaces/` — workspace/profile/runtime mapping logic
- `lib/site-url.ts` — canonical site URL helpers
- `lib/runtime/` — runtime-related helpers
- `lib/security/` — security-related helpers

---

## Auth / Public Route Boundary
Primary route-gating logic lives in:
- `proxy.ts`

### Why it matters
This file is one of the most important places for understanding:
- public route allowlisting
- protected route behavior
- locale/auth interaction

---

## API Surfaces
Important route handlers live under:
- `app/api/`

### Key examples
- `app/api/chat/route.ts`
- `app/api/conversations/...`
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `app/api/onboarding/complete/route.ts`
- `app/api/cron/...`
- `app/api/integrations/...`
- `app/api/webhooks/...`

---

## Documentation
Repo docs live under:
- `docs/`

### Key current areas
- `docs/overview/`
- `docs/architecture/`
- `docs/security/`
- `docs/operations/`
- `docs/reference/`
- `docs/decisions/`

---

## Current "Look Here First" Map

## If debugging public route auth issues
Inspect:
- `proxy.ts`
- relevant `app/[locale]/(landing)/...` page
- `docs/security/public-routes.md`

## If debugging chat runtime behavior
Inspect:
- `app/api/chat/route.ts`
- `lib/workspaces/runtimeMode.ts`
- `lib/context/preparedContext.ts`
- `docs/architecture/runtime-mode-routing.md`

## If debugging workspace/profile behavior
Inspect:
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `lib/workspaces/...`
- `docs/architecture/workspace-operating-profile-model.md`

## If debugging memory/context behavior
Inspect:
- `lib/context/preparedContext.ts`
- `lib/llm/conversationEngine.ts`
- memory-related API routes if involved
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/retrieval-and-graph-strategy.md`

## If debugging deployment/runtime mismatch
Inspect:
- GitHub Actions runs
- hosting/deploy surfaces
- affected live route/API behavior
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`

---

## Caveat

This file map is intentionally selective.
It should evolve as the codebase changes, especially when important runtime logic moves or new major subsystems become central.
