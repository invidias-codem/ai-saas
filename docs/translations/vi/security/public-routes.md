# Các Tuyến Đường Công Khai (Public Routes)

## Mục Đích (Purpose)

Tài liệu này giải thích các Genie AI routes nào intended to be publicly accessible (được dự định truy cập công khai), protected (được bảo vệ), và public-route enforcement hiện tại hoạt động như thế nào.

Nó tồn tại để prevent (ngăn chặn) một recurring class of production bugs (lớp lỗi sản xuất lặp lại):
- public pages linking into auth-gated surfaces unintentionally (các trang công khai liên kết vào auth-gated surfaces vô tình)
- otherwise public routes being blocked because middleware/proxy allowlists were not updated (các public routes khác bị blocked vì middleware/proxy allowlists chưa được updated)
- confusion between UI-level visibility and actual route accessibility (sự nhầm lẫn giữa UI-level visibility và actual route accessibility)

Tài liệu này nên được đối xử như current route-visibility reference cho application.

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Một route chỉ truly public (thực sự công khai) nếu server-side auth gate treats it as public (coi nó là công khai).

Trong Genie AI, điều đó nghĩa là public access not determined only by (không chỉ được xác định bởi):
- whether a link appears on a landing page (liên kết có xuất hiện trên landing page không)
- whether a page is visually "marketing-like" (trang có trông "marketing-like" không)
- whether the route feels public by convention (tuyến đường cảm thấy public theo convention)

Nó cũng phải explicitly allowed by the route-matching logic in the auth middleware/proxy layer (cũng phải được phép một cách rõ ràng bởi route-matching logic trong auth middleware/proxy layer).

---

## Current Enforcement Layer (Lớp Thực Thi Hiện Tại)

### Route-Gating Mechanism (Cơ Chế Gating Tuyến Đường)
Public vs protected route behavior is primarily controlled in (Public vs protected route behavior chủ yếu được controlled trong):
- `proxy.ts`

File này contains the `isPublicRoute` matcher used alongside Clerk auth enforcement (File này chứa `isPublicRoute` matcher used alongside Clerk auth enforcement).

### Important implication (Nัย Quan Trọng)
Whenever a new public route is added, or a public route subtree changes, the route must be reviewed in **both** places (Khi một new public route được added, hoặc public route subtree changes, route phải được reviewed ở **both** places):
1. application routing/UI
2. proxy auth allowlist

If only the UI is updated, public users may still be redirected to sign-in (Nếu only the UI is updated, public users may still be redirected to sign-in).

---

## Public Route Categories (Các Danh Mục Tuyến Đường Công Khai)

The application currently has several types of routes that should be considered public (Application hiện tại có several types of routes that should be considered public).

## 1. Public Landing / Marketing Routes (Public Landing / Marketing Routes)

These are public entry surfaces intended for unauthenticated visitors (Đây là public entry surfaces intended for unauthenticated visitors).

### Examples (Ví Dụ)
- `/`
- `/:locale`

### Purpose (Mục Đích)
- product discovery (khám phá sản phẩm)
- positioning (định vị)
- conversion into sign-up or product entry (chuyển đổi sang sign-up or product entry)

---

## 2. Public Auth Entry Routes (Public Auth Entry Routes)

These are publicly accessible because they are part of the authentication entry flow (These are publicly accessible because they are part of the authentication entry flow).

### Examples
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Purpose
- user authentication (xác thực người dùng)
- user onboarding entry (điểm nhập user onboarding)

---

## 3. Public Informational Routes (Public Informational Routes)

These are intended to remain accessible without authentication because they provide support, policy, or educational content (These are intended to remain accessible without authentication because they provide support, policy, or educational content).

### Current examples (Ví dụ hiện tại)
- `/privacy`
- `/:locale/privacy`
- `/support`
- `/:locale/support`
- `/slack`
- `/:locale/slack`
- `/blog(.*)`
- `/:locale/blog(.*)`
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

### Purpose
- help users understand the platform (giúp users understand the platform)
- provide public support and policy information (cung cấp public support and policy information)
- expose documentation without forcing sign-in (expose documentation without forcing sign-in)

---

## 4. Public API / Callback Surfaces (Public API / Callback Surfaces)

Some API routes must remain public because they are integration or webhook entry points (Some API routes must remain public because they are integration or webhook entry points).

### Current examples
- `/api/guest-chat`
- `/api/feedback`
- `/api/integrations/slack/callback`
- `/api/integrations/slack/events`
- `/api/integrations/slack/command`
- `/api/integrations/slack/interactivity`
- `/api/integrations/slack/auth`
- `/api/webhooks/kofi`
- `/api/support/verify-donation`
- `/api/integrations/telegram/webhook`
- `/api/internal/jklaw`
- `/api/internal/route-to-jklaw`
- `/api/referral/capture`
- `/api/cron(.*)`
- `/api/test-mcts`
- `/api/webhooks/vercel-logs`

### Explicit exclusions (Loại trừ rõ ràng)
The following are **not** public despite having client-side entry points or non-browser consumers (The following are **not** public despite having client-side entry points or non-browser consumers):
- `/api/cli/stream`
- `/api/memory/cli`

These routes require bearer-token auth when `LATTICE_CLI_TOKEN` is configured (These routes require bearer-token auth when `LATTICE_CLI_TOKEN` is configured). They must not be treated as public in proxy allowlists or route ops (They must not be treated as public in proxy allowlists or route ops).

### Important note (Lưu ý quan trọng)
Public API surface does **not** mean low-risk surface (Public API surface không mean low-risk surface). Many of these routes are public because they must accept external traffic, but they still require (Many of these routes are public because they must accept external traffic, but they still require):
- validation (validation)
- auth verification where applicable (auth verification where applicable)
- signature/token checks where appropriate (signature/token checks where appropriate)
- narrow purpose-specific behavior (narrow purpose-specific behavior)

---

## Protected Route Categories (Protected Route Categories)

The following broad route classes should be treated as protected unless explicitly documented otherwise (The following broad route classes should be treated as protected unless explicitly documented otherwise).

## 1. Authenticated Product Routes (Authenticated Product Routes)

### Examples
- dashboard routes (dashboard routes)
- conversation routes (conversation routes)
- workspace routes (workspace routes)
- settings (settings)
- authenticated generation tools (authenticated generation tools)
- user-specific onboarding/product state surfaces (user-specific onboarding/product state surfaces)

### Purpose
- expose actual product functionality (expose actual product functionality)
- operate on user state (operate on user state)
- access protected application data (access protected application data)

---

## 2. Protected API Routes (Protected API Routes)

Any API route not explicitly allowlisted as public should be assumed protected (Any API route not explicitly allowlisted as public should be assumed protected).

### Typical examples
- chat execution routes (chat execution routes)
- user-specific data routes (user-specific data routes)
- workspace management routes (workspace management routes)
- profile/configuration routes (profile/configuration routes)
- internal product actions requiring user identity (internal product actions requiring user identity)

---

## Route Visibility and Locale Prefixes (Route Visibility and Locale Prefixes)

The application uses localized routing (The application uses localized routing).

### Important implication (Nãi Quan Trọng)
Public route treatment must consider both (Public route treatment must consider both):
- unprefixed route forms (unprefixed route forms)
- locale-prefixed route forms (locale-prefixed route forms)

### Example (Ví Dụ)
If `/docs` is meant to be public, then all relevant public forms should be considered (If `/docs` is meant to be public, then all relevant public forms should be considered):
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

This is especially important for nested docs/blog/support trees (This is especially important for nested docs/blog/support trees).

---

## Known Failure Mode: Public UI Linking Into Protected Route (Known Failure Mode: Public UI Linking Into Protected Route)

A common regression pattern is (A common regression pattern is):
1. a public landing/support page links to a route such as `/docs` (a public landing/support page links to a route such as `/docs`)
2. the route exists and appears public in the UI (the route exists and appears public in the UI)
3. the route is not added to `isPublicRoute` (the route is not added to `isPublicRoute`)
4. unauthenticated users are redirected to sign-in (unauthenticated users are redirected to sign-in)

This already occurred in practice with the public docs path (This already occurred in practice with the public docs path).

### Lesson (Bài Học)
Whenever a public content surface is added or changed, route visibility must be reviewed as part of the implementation (Whenever a public content surface is added or changed, route visibility must be reviewed as part of the implementation).

---

## Public Docs Route Fix Example (Public Docs Route Fix Example)

The docs-route auth bug was resolved by explicitly allowlisting (The docs-route auth bug was resolved by explicitly allowlisting):
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

in `proxy.ts`.

### Why this mattered (Tại Sao Điều Này Quan Trọng)
The support page's "View Docs" link was publicly visible, but the actual docs route subtree was not treated as public by the auth gate (The support page's "View Docs" link was publicly visible, but the actual docs route subtree was not treated as public by the auth gate).

This is the exact kind of mismatch this document exists to prevent (This is the exact kind of mismatch this document exists to prevent).

---

## Review Checklist for Any New Public Route (Review Checklist for Any New Public Route)

When adding a new public route, verify all of the following (When adding a new public route, verify all of the following):

1. **UI intent**
- Is this actually meant to be public? (Is this actually meant to be public?)

2. **Route tree coverage**
- Does the allowlist include both root and nested forms if needed? (Does the allowlist include both root and nested forms if needed?)

3. **Locale coverage**
- Does the allowlist include locale-prefixed variants? (Does the allowlist include locale-prefixed variants?)

4. **Middleware/proxy alignment**
- Is `proxy.ts` updated accordingly? (Is `proxy.ts` updated accordingly?)

5. **Auth behavior test**
- Was the route tested in a logged-out session? (Was the route tested in a logged-out session?)

6. **Public-link flow test**
- Was the route tested through the actual public entry page that links to it? (Was the route tested through the actual public entry page that links to it?)

---

## Safe Documentation Practice (Safe Documentation Practice)

Whenever route visibility changes, documentation should ideally be updated alongside code if the change affects (Whenever route visibility changes, documentation should ideally be updated alongside code if the change affects):
- public access expectations (public access expectations)
- support flows (support flows)
- docs/blog/privacy visibility (docs/blog/privacy visibility)
- integration/webhook behavior (integration/webhook behavior)

This prevents the codebase from silently drifting away from intended access policy (This prevents the codebase from silently drifting away from intended access policy).

---

## Recommended Future Follow-Ups (Recommended Future Follow-Ups)

The route-visibility story would be strengthened further by adding (The route-visibility story would be strengthened further by adding):
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

These would help connect public-route documentation to broader auth, API, and deployment verification practice (These would help connect public-route documentation to broader auth, API, and deployment verification practice).