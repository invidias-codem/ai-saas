# แผนที่ไฟล์ต้นฉบับ (Source File Map)

## Purpose (วัตถุประสงค์)

This document helps developers and reviewers locate important implementation surfaces in the Genie AI / `ai-saas` repository (เอกสารนี้ช่วย developers และ reviewers locate important implementation surfaces ใน Genie AI / `ai-saas` repository)

It is intended as a navigation aid, not a complete file index (มัน intended as a navigation aid, not a complete file index)

The goal is to answer (เป้าหมายคือตอบ):
- where does this kind of behavior live? (behavior นี้อยู่ที่ไหน)
- which files should I inspect first for a given subsystem? (ไฟล์ไหนควร inspect ก่อนสำหรับ subsystem ที่กำหนด)
- where are the most important route, architecture, and runtime entry points? (route, architecture, และ runtime entry points ที่สำคุดที่สุดอยู่ที่ไหน)

---

## High-Level Areas (High-Level Areas)

## App Routes (App Routes)
Primary route and API structure lives under (Primary route and API structure lives under):
- `app/`

### Important subareas (Subareas ที่สำคัญ)
- `app/[locale]/...` — localized page routes (localized page routes)
- `app/api/...` — API and route-handler surfaces (API and route-handler surfaces)
- `app/layout.tsx` — root app layout (root app layout)
- `app/globals.css` — global styling layer (global styling layer)

---

## Components (Components)
Primary UI building blocks live under (Primary UI building blocks live under):
- `components/`

### Important subareas
- `components/landing/` — public/landing UI (public/landing UI)
- `components/chat/` — chat-specific UI controls (chat-specific UI controls)
- `components/sidebar.tsx` — major navigation/sidebar behavior (major navigation/sidebar behavior)
- `components/mobile-sidebar.tsx` — mobile navigation behavior (mobile navigation behavior)
- `components/theme-provider.tsx` — theme/provider layer (theme/provider layer)

---

## Architecture / Runtime Logic (Architecture / Runtime Logic)
Important non-UI logic lives under (Important non-UI logic lives under):
- `lib/`

### Important subareas
- `lib/context/` — prepared-context direction (prepared-context direction)
- `lib/llm/` — model/provider and conversation logic (model/provider and conversation logic)
- `lib/workspaces/` — workspace/profile/runtime mapping logic (workspace/profile/runtime mapping logic)
- `lib/site-url.ts` — canonical site URL helpers (canonical site URL helpers)
- `lib/runtime/` — runtime-related helpers (runtime-related helpers)
- `lib/security/` — security-related helpers (security-related helpers)

---

## Auth / Public Route Boundary (Auth / Public Route Boundary)
Primary route-gating logic lives in (Primary route-gating logic lives in):
- `proxy.ts`

### Why it matters (ทำไมมัน matters)
This file is one of the most important places for understanding (ไฟล์นี้เป็นหนึ่งใน most important places สำหรับ understanding):
- public route allowlisting (public route allowlisting)
- protected route behavior (protected route behavior)
- locale/auth interaction (locale/auth interaction)

---

## API Surfaces (API Surfaces)
Important route handlers live under (Important route handlers live under):
- `app/api/`

### Key examples (ตัวอย่างหลัก)
- `app/api/chat/route.ts`
- `app/api/conversations/...`
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `app/api/onboarding/complete/route.ts`
- `app/api/cron/...`
- `app/api/integrations/...`
- `app/api/webhooks/...`

---

## Documentation (Documentation)
Repo docs live under (Repo docs live under):
- `docs/`

### Key current areas (Key current areas)
- `docs/overview/`
- `docs/architecture/`
- `docs/security/`
- `docs/operations/`
- `docs/reference/`
- `docs/decisions/`

---

## Current "Look Here First" Map (Current "Look Here First" Map)

## If debugging public route auth issues (ถ้า debugging public route auth issues)
Inspect (Inspect):
- `proxy.ts`
- relevant `app/[locale]/(landing)/...` page
- `docs/security/public-routes.md`

## If debugging chat runtime behavior (ถ้า debugging chat runtime behavior)
Inspect:
- `app/api/chat/route.ts`
- `lib/workspaces/runtimeMode.ts`
- `lib/context/preparedContext.ts`
- `docs/architecture/runtime-mode-routing.md`

## If debugging workspace/profile behavior (ถ้า debugging workspace/profile behavior)
Inspect:
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `lib/workspaces/...`
- `docs/architecture/workspace-operating-profile-model.md`

## If debugging memory/context behavior (ถ้า debugging memory/context behavior)
Inspect:
- `lib/context/preparedContext.ts`
- `lib/llm/conversationEngine.ts`
- memory-related API routes if involved
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/retrieval-and-graph-strategy.md`

## If debugging deployment/runtime mismatch (ถ้า debugging deployment/runtime mismatch)
Inspect:
- GitHub Actions runs
- hosting/deploy surfaces
- affected live route/API behavior
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`

---

## Caveat (ข้อควรระวัง)

This file map is intentionally selective (This file map is intentionally selective)
It should evolve as the codebase changes, especially when important runtime logic moves or new major subsystems become central (มัน should evolve as the codebase changes, especially when important runtime logic moves or new major subsystems become central)