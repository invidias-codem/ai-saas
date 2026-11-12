# Bản Đồ Tệp Nguồn (Source File Map)

## Mục Đích (Purpose)

Tài liệu này giúp (helps) developers và reviewers locate (tìm thấy) important implementation surfaces (bề mặt triển khai quan trọng) trong Genie AI / `ai-saas` repository.

Nó intended as a navigation aid (nó được dùng như một navigation aid), not a complete file index (không phải complete file index).

The goal is to answer (Mục tiêu là trả lời):
- where does this kind of behavior live? (loại behavior này sống ở đâu)
- which files should I inspect first for a given subsystem? (tệp nào tôi nên inspect trước cho một given subsystem)
- where are the most important route, architecture, and runtime entry points? (route, architecture, và runtime entry points quan trọng nhất ở đâu)

---

## High-Level Areas (Các Khu Vực Cấp Cao)

## App Routes (Các Tuyến Đường App)
Primary route and API structure lives under (Cấu trúc route và API chính sống dưới):
- `app/`

### Important subareas (Các Subareas Quan Trọng)
- `app/[locale]/...` — localized page routes (các tuyến trang được bản địa hóa)
- `app/api/...` — API and route-handler surfaces (bề mặt API và route-handler)
- `app/layout.tsx` — root app layout (bố cục app gốc)
- `app/globals.css` — global styling layer (lớp styling toàn cục)

---

## Components (Các Thành Phần)
Primary UI building blocks live under (Các khối xây dựng UI chính sống dưới):
- `components/`

### Important subareas (Các Subareas Quan Trọng)
- `components/landing/` — public/landing UI (UI công khai/landing)
- `components/chat/` — chat-specific UI controls (UI controls dành riêng cho chat)
- `components/sidebar.tsx` — major navigation/sidebar behavior (hành vi navigation/sidebar chính)
- `components/mobile-sidebar.tsx` — mobile navigation behavior (hành vi navigation di động)
- `components/theme-provider.tsx` — theme/provider layer (lớp theme/provider)

---

## Architecture / Runtime Logic (Kiến Trúc / Logic Runtime)
Important non-UI logic lives under (Logic non-UI quan trọng sống dưới):
- `lib/`

### Important subareas
- `lib/context/` — prepared-context direction (hướng prepared-context)
- `lib/llm/` — model/provider and conversation logic (logic model/provider và conversation)
- `lib/workspaces/` — workspace/profile/runtime mapping logic (logic mapping workspace/profile/runtime)
- `lib/site-url.ts` — canonical site URL helpers (helpers URL trang web chính tắc)
- `lib/runtime/` — runtime-related helpers (helpers liên quan đến runtime)
- `lib/security/` — security-related helpers (helpers liên quan đến bảo mật)

---

## Auth / Public Route Boundary (Auth / Ranh Giới Tuyến Công Khai)
Primary route-gating logic lives in (Logic route-gating chính sống trong):
- `proxy.ts`

### Why it matters (Tại Sao Quan Trọng)
This file is one of the most important places for understanding (File này là một trong những nơi quan trọng nhất để hiểu):
- public route allowlisting (allowlisting tuyến công khai)
- protected route behavior (hành vi tuyến được bảo vệ)
- locale/auth interaction (tương tác locale/auth)

---

## API Surfaces (Các Bề Mặt API)
Important route handlers live under (Important route handlers sống dưới):
- `app/api/`

### Key examples (Ví Dụ Chính)
- `app/api/chat/route.ts`
- `app/api/conversations/...`
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `app/api/onboarding/complete/route.ts`
- `app/api/cron/...`
- `app/api/integrations/...`
- `app/api/webhooks/...`

---

## Documentation (Tài Liệu)
Repo docs live under (Tài liệu repo sống dưới):
- `docs/`

### Key current areas (Các Khu Vực Hiện Tại Chính)
- `docs/overview/`
- `docs/architecture/`
- `docs/security/`
- `docs/operations/`
- `docs/reference/`
- `docs/decisions/`

---

## Current "Look Here First" Map (Bản Đồ "Nhìn Đây Trước" Hiện Tại)

## If debugging public route auth issues (Nếu debugging public route auth issues)
Inspect (Kiểm Tra):
- `proxy.ts`
- relevant `app/[locale]/(landing)/...` page
- `docs/security/public-routes.md`

## If debugging chat runtime behavior (Nếu debugging chat runtime behavior)
Inspect:
- `app/api/chat/route.ts`
- `lib/workspaces/runtimeMode.ts`
- `lib/context/preparedContext.ts`
- `docs/architecture/runtime-mode-routing.md`

## If debugging workspace/profile behavior (Nếu debugging workspace/profile behavior)
Inspect:
- `app/api/workspaces/...`
- `app/api/operating-profiles/...`
- `lib/workspaces/...`
- `docs/architecture/workspace-operating-profile-model.md`

## If debugging memory/context behavior (Nếu debugging memory/context behavior)
Inspect:
- `lib/context/preparedContext.ts`
- `lib/llm/conversationEngine.ts`
- memory-related API routes if involved
- `docs/architecture/memory-and-context-architecture.md`
- `docs/architecture/retrieval-and-graph-strategy.md`

## If debugging deployment/runtime mismatch (Nếu debugging deployment/runtime mismatch)
Inspect:
- GitHub Actions runs
- hosting/deploy surfaces
- affected live route/API behavior
- `docs/operations/truth-surfaces.md`
- `docs/operations/deployment.md`

---

## Caveat (Lưu Ý)

This file map is intentionally selective (Bản đồ tệp này deliberately selective)
It should evolve as the codebase changes, especially when important runtime logic moves or new major subsystems become central (Nó should evolve as the codebase changes, especially when important runtime logic moves or new major subsystems become central)