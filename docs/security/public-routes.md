# Public Routes

## Purpose

This document explains which Genie AI routes are intended to be publicly accessible, which are protected, and how public-route enforcement currently works.

It exists to prevent a recurring class of production bugs:
- public pages linking into auth-gated surfaces unintentionally
- otherwise public routes being blocked because middleware/proxy allowlists were not updated
- confusion between UI-level visibility and actual route accessibility

This document should be treated as the current route-visibility reference for the application.

---

## Core Principle

A route is only truly public if the server-side auth gate treats it as public.

In Genie AI, that means public access is not determined only by:
- whether a link appears on a landing page
- whether a page is visually “marketing-like”
- whether the route feels public by convention

It must also be explicitly allowed by the route-matching logic in the auth middleware/proxy layer.

---

## Current Enforcement Layer

### Route-Gating Mechanism
Public vs protected route behavior is primarily controlled in:
- `proxy.ts`

This file contains the `isPublicRoute` matcher used alongside Clerk auth enforcement.

### Important implication
Whenever a new public route is added, or a public route subtree changes, the route must be reviewed in **both** places:
1. application routing/UI
2. proxy auth allowlist

If only the UI is updated, public users may still be redirected to sign-in.

---

## Public Route Categories

The application currently has several types of routes that should be considered public.

## 1. Public Landing / Marketing Routes

These are public entry surfaces intended for unauthenticated visitors.

### Examples
- `/`
- `/:locale`

### Purpose
- product discovery
- positioning
- conversion into sign-up or product entry

---

## 2. Public Auth Entry Routes

These are publicly accessible because they are part of the authentication entry flow.

### Examples
- `/sign-in(.*)`
- `/sign-up(.*)`
- `/:locale/sign-in(.*)`
- `/:locale/sign-up(.*)`

### Purpose
- user authentication
- user onboarding entry

---

## 3. Public Informational Routes

These are intended to remain accessible without authentication because they provide support, policy, or educational content.

### Current examples
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
- help users understand the platform
- provide public support and policy information
- expose documentation without forcing sign-in

---

## 4. Public API / Callback Surfaces

Some API routes must remain public because they are integration or webhook entry points.

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

### Explicit exclusions
The following are **not** public despite having client-side entry points or non-browser consumers:
- `/api/cli/stream`
- `/api/memory/cli`

These routes require bearer-token auth when `LATTICE_CLI_TOKEN` is configured. They must not be treated as public in proxy allowlists or route ops.

### Important note
Public API surface does **not** mean low-risk surface.
Many of these routes are public because they must accept external traffic, but they still require:
- validation
- auth verification where applicable
- signature/token checks where appropriate
- narrow purpose-specific behavior

---

## Protected Route Categories

The following broad route classes should be treated as protected unless explicitly documented otherwise.

## 1. Authenticated Product Routes

### Examples
- dashboard routes
- conversation routes
- workspace routes
- settings
- authenticated generation tools
- user-specific onboarding/product state surfaces

### Purpose
- expose actual product functionality
- operate on user state
- access protected application data

---

## 2. Protected API Routes

Any API route not explicitly allowlisted as public should be assumed protected.

### Typical examples
- chat execution routes
- user-specific data routes
- workspace management routes
- profile/configuration routes
- internal product actions requiring user identity

---

## Route Visibility and Locale Prefixes

The application uses localized routing.

### Important implication
Public route treatment must consider both:
- unprefixed route forms
- locale-prefixed route forms

### Example
If `/docs` is meant to be public, then all relevant public forms should be considered:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

This is especially important for nested docs/blog/support trees.

---

## Known Failure Mode: Public UI Linking Into Protected Route

A common regression pattern is:
1. a public landing/support page links to a route such as `/docs`
2. the route exists and appears public in the UI
3. the route is not added to `isPublicRoute`
4. unauthenticated users are redirected to sign-in

This already occurred in practice with the public docs path.

### Lesson
Whenever a public content surface is added or changed, route visibility must be reviewed as part of the implementation.

---

## Public Docs Route Fix Example

The docs-route auth bug was resolved by explicitly allowlisting:
- `/docs`
- `/:locale/docs`
- `/docs/(.*)`
- `/:locale/docs/(.*)`

in `proxy.ts`.

### Why this mattered
The support page’s “View Docs” link was publicly visible, but the actual docs route subtree was not treated as public by the auth gate.

This is the exact kind of mismatch this document exists to prevent.

---

## Review Checklist for Any New Public Route

When adding a new public route, verify all of the following:

1. **UI intent**
- Is this actually meant to be public?

2. **Route tree coverage**
- Does the allowlist include both root and nested forms if needed?

3. **Locale coverage**
- Does the allowlist include locale-prefixed variants?

4. **Middleware/proxy alignment**
- Is `proxy.ts` updated accordingly?

5. **Auth behavior test**
- Was the route tested in a logged-out session?

6. **Public-link flow test**
- Was the route tested through the actual public entry page that links to it?

---

## Safe Documentation Practice

Whenever route visibility changes, documentation should ideally be updated alongside code if the change affects:
- public access expectations
- support flows
- docs/blog/privacy visibility
- integration/webhook behavior

This prevents the codebase from silently drifting away from intended access policy.

---

## Recommended Future Follow-Ups

The route-visibility story would be strengthened further by adding:
- `docs/security/trust-boundaries.md`
- `docs/reference/api-reference.md`
- `docs/operations/route-verification-checklist.md`

These would help connect public-route documentation to broader auth, API, and deployment verification practice.
