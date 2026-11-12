# Public Routes (เส้นทางสาธารณะ)

## Purpose (วัตถุประสงค์)

This document explains which Genie AI routes are intended to be publicly accessible, which are protected, and how public-route enforcement currently works (เอกสารนี้อธิบายว่า Genie AI routes ไหน intended to be publicly accessible, ไหน protected, และ public-route enforcement ทำงานอย่างไร currently)

It exists to prevent a recurring class of production bugs (มันมีอยู่เพื่อ prevent a recurring class of production bugs):
- public pages linking into auth-gated surfaces unintentionally (public pages linking into auth-gated surfaces unintentionally)
- otherwise public routes being blocked because middleware/proxy allowlists were not updated (otherwise public routes being blocked เพราะ middleware/proxy allowlists not updated)
- confusion between UI-level visibility and actual route accessibility (confusion ระหว่าง UI-level visibility และ actual route accessibility)

This document should be treated as the current route-visibility reference for the application (เอกสารนี้ควร treated as the current route-visibility reference for the application)

---

## Core Principle (หลักการพื้นฐาน)

A route is only truly public if the server-side auth gate treats it as public (Route จะ truly public ได้ก็ต่อเมื่อ server-side auth gate treats it as public)

In Genie AI, that means public access is not determined only by (ใน Genie AI หมายถึง public access not determined only by):
- whether a link appears on a landing page (whether a link appears on a landing page)
- whether a page is visually "marketing-like" (whether a page is visually "marketing-like")
- whether the route feels public by convention (whether the route feels public by convention)

It must also be explicitly allowed by the route-matching logic in the auth middleware/proxy layer (มัน must also be explicitly allowed by the route-matching logic in the auth middleware/proxy layer)

---

## Current Enforcement Layer (Current Enforcement Layer)

### Route-Gating Mechanism (Route-Gating Mechanism)
Public vs protected route behavior is primarily controlled in (Public vs protected route behavior is primarily controlled in):
- `proxy.ts`

This file contains the `isPublicRoute` matcher used alongside Clerk auth enforcement (ไฟล์นี้ contains the `isPublicRoute` matcher used alongside Clerk auth enforcement)

### Important implication (Implication สำคัญ)
Whenever a new public route is added, or a public route subtree changes, the route must be reviewed in **both** places (Whenever a new public route is added, or a public route subtree changes, the route must be reviewed in **both** places):
1. application routing/UI
2. proxy auth allowlist

If only the UI is updated, public users may still be redirected to sign-in (If only the UI is updated, public users may still be redirected to sign-in)

---

## Public Route Categories (Public Route Categories)

The application currently has several types of routes that should be considered public (The application currently has several types of routes that should be considered public)

## 1. Public Landing / Marketing Routes (Public Landing / Marketing Routes)

These are public entry surfaces intended for unauthenticated visitors (These are public entry surfaces intended for unauthenticated visitors)

### Examples (ตัวอย่าง)
- `/`
- `/:locale`

### Purpose (วัตถุประสงค์)
- product discovery (product discovery)
- positioning (positioning)
- conversion into sign-up or product entry (conversion into sign-up or product entry)

---

## 2. Public Auth Entry Routes (Public Auth Entry Routes)

These are publicly accessible because they are part of the authentication entry flow (These are publicly accessible because they are part of the authentication entry flow)

### Examples
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Purpose
- user authentication (user authentication)
- user onboarding entry (user onboarding entry)

---

## 3. Public Informational Routes (Public Informational Routes)

These are intended to remain accessible without authentication because they provide support, policy, or educational content (These are intended to remain accessible without authentication because they provide support, policy, or educational content)

### Current examples (ตัวอย่างปัจจุบัน)
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
- help users understand the platform (help users understand the platform)
- provide public support and policy information (provide public support and policy information)
- expose documentation without forcing sign-in (expose documentation without forcing sign-in)

---

## 4. Public API / Callback Surfaces (Public API / Callback Surfaces)

Some API routes must remain public because they are integration or webhook entry points (Some API routes must remain public because they are integration or webhook entry points)

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

### Explicit exclusions (Explicit exclusions / การยกเว้นอย่างชัดเจน)
The following are **not** public despite having client-side entry points or non-browser consumers (The following are **not** public despite having client-side entry points or non-browser consumers):
- `/api/cli/stream`
- `/api/memory/cli`

These routes require bearer-token auth when `LATTICE_CLI_TOKEN` is configured (These routes require bearer-token auth when `LATTICE_CLI_TOKEN` is configured) They must not be treated as public in proxy allowlists or route ops (They must not be treated as public in proxy allowlists or route ops)

### Important note (Important note / หมายเหตุสำคัญ)
Public API surface does **not** mean low-risk surface (Public API surface does **not** mean low-risk surface)
Many of these routes are public because they must accept external traffic, but they still require (Many of these routes are public because they must accept external traffic, but they still require):
- validation (validation)
- auth verification where applicable (auth verification where applicable)
- signature/token checks where appropriate (signature/token checks where appropriate)
- narrow purpose-specific behavior (narrow purpose-specific behavior)

---

## Protected Route Categories (Protected Route Categories)

The following broad route classes should be treated as protected unless explicitly documented otherwise (The following broad route classes should be treated as protected unless explicitly documented otherwise)

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

Any API route not explicitly allowlisted as public should be assumed protected (Any API route not explicitly allowlisted as public should be assumed protected)

### Typical examples
- chat execution routes (chat execution routes)
- user-specific data routes (user-specific data routes)
- workspace management routes (workspace management routes)
- profile/configuration routes (profile/configuration routes)
- internal product actions requiring user identity (internal product actions requiring user identity)

---

## Route Visibility and Locale Prefixes (Route Visibility and Locale Prefixes)

The application uses localized routing (The application uses localized routing)

### Important implication (Important implication / นัยสำคัญ)
Public route treatment must consider both (Public route treatment must consider both):
- unprefixed route forms (unprefixed route forms)
- locale-prefixed route forms (locale-prefixed route forms)

### Example (ตัวอย่าง)
If `/docs` is meant to be public, then all relevant public forms should be considered (If `/docs` is meant to be public, then all relevant public forms should be considered):
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

This is especially important for nested docs/blog/support trees (This is especially important for nested docs/blog/support trees)

---

## Known Failure Mode: Public UI Linking Into Protected Route (Known Failure Mode: Public UI Linking Into Protected Route)

A common regression pattern is (A common regression pattern is):
1. a public landing/support page links to a route such as `/docs` (a public landing/support page links to a route such as `/docs`)
2. the route exists and appears public in the UI (the route exists and appears public in the UI)
3. the route is not added to `isPublicRoute` (the route is not added to `isPublicRoute`)
4. unauthenticated users are redirected to sign-in (unauthenticated users are redirected to sign-in)

This already occurred in practice with the public docs path (This already occurred in practice with the public docs path)

### Lesson (Lesson / บทเรียน)
Whenever a public content surface is added or changed, route visibility must be reviewed as part of the implementation (Whenever a public content surface is added or changed, route visibility must be reviewed as part of the implementation)

---

## Public Docs Route Fix Example (Public Docs Route Fix Example)

The docs-route auth bug was resolved by explicitly allowlisting (The docs-route auth bug was resolved by explicitly allowlisting):
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

in `proxy.ts`.

### Why this mattered (Why this mattered / ทำไมมันจึงสำคัญ)
The support page's "View Docs" link was publicly visible, but the actual docs route subtree was not treated as public by the auth gate (The support page's "View Docs" link was publicly visible, but the actual docs route subtree was not treated as public by the auth gate)

This is the exact kind of mismatch this document exists to prevent (This is the exact kind of mismatch this document exists to prevent)

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

This prevents the codebase from silently drifting away from intended access policy (This prevents the codebase from silently drifting away from intended access policy)

---

## Recommended Future Follow-Ups (Recommended Future Follow-Ups)

The route-visibility story would be strengthened further by adding (The route-visibility story would be strengthened further by adding):
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

These would help connect public-route documentation to broader auth, API, and deployment verification practice (These would help connect public-route documentation to broader auth, API, and deployment verification practice)