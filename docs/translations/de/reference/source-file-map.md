# Source-Datei-Map

## Zweck

Dieses Dokument hilft Entwicklern und Reviewern, wichtige Implementierungs-Oberflächen im Genie AI / `ai-saas` Repository zu finden.

Es ist als Navigations-Hilfe gedacht, nicht als vollständiger Datei-Index.

Ziel ist es zu beantworten:
- wo lebt diese Art von Verhalten?
- welche Dateien sollte ich zuerst inspizieren für ein gegebenes Subsystem?
- wo sind die wichtigsten Route-, Architektur- und Runtime-Entry-Points?

---

## High-Level Areas

## App Routes
Primäre Route- und API-Struktur lebt unter:
- `app/`

### Important Subareas
- `app/[locale]/...` — lokalisierte Page Routes
- `app/api/...` — API und Route-Handler Surfaces
- `app/layout.tsx` — Root App Layout
- `app/globals.css` — Global Styling Layer

---

## Components
Primäre UI Building Blocks leben unter:
- `components/`

### Important Subareas
- `components/landing/` — Public/Landing UI
- `components/chat/` — Chat-spezifische UI Controls
- `components/sidebar.tsx` — Major Navigation/Sidebar Behavior
- `components/mobile-sidebar.tsx` — Mobile Navigation Behavior
- `components/theme-provider.tsx` — Theme/Provider Layer

---

## Architecture / Runtime Logic
Wichtige Non-UI Logic lebt unter:
- `lib/`

### Important Subareas
- `lib/context/` — Prepared-Context Direction
- `lib/llm/` — Model/Provider und Conversation Logic
- `lib/workspaces/` — Workspace/Profile/Runtime Mapping Logic
- `lib/site-url.ts` — Canonical Site URL Helpers
- `lib/runtime/` — Runtime-related Helpers
- `lib/security/` — Security-related Helpers

---

## Auth / Public Route Boundary
Primäre Route-Gating Logic lebt in:
- `proxy.ts`

### Why it matters
Diese Datei ist einer der wichtigsten Orte um zu verstehen:
- Public Route Allowlisting
- Protected Route Behavior
- Locale/Auth Interaction

---

## API Surfaces
Wichtige Route Handlers leben unter:
- `app/api/`

### Key Examples
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
Repo Docs leben unter:
- `docs/`

### Key Current Areas
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