# Plan: Unauthenticated Platform Exploration (pre-sign-in tour) + Ko-fi Billing

## Status: DECISIONS LOCKED — pending your approval to build
- Tour route: **`/explore`**
- Premium model: **Conversation, Memory, Code = free after sign-in**;
  **Media studio (image/music/video) + Expert/Chameleon + advanced Telemetry = paid**.
- Tour style: **lightly interactive demos** (sample pre-loaded conversation, read-only Memory graph).
- Billing: **Ko-fi** (replaces Stripe). Webhook does email→Clerk match, extends `premium_until`.

## 1. Problem
Landing CTA "Explore the platform" → `/docs` (not the product). All real features assume an
authenticated Clerk user; gating scattered. We want anonymous visitors to browse read-only
capabilities, then hit a Clerk sign-in ("workspace intelligence") to go deeper, with
Media/Expert/Telemetry additionally gated by a Ko-fi-backed subscription.

## 2. Verified architecture (from code, not assumed)
- CTA: `components/marketing/solution-matrix.tsx:71` → `href="/docs"`.
- No root `middleware.ts`. Per-route gating: `requireAuth()` / `auth()` server-side,
  `useAuth()` client-side. Reference pattern: `/conversation/new/route.ts` does
  `auth()` → `redirect('/sign-in?redirect_url=/conversation')`.
- `(dashboard)` group: `layout.tsx` renders Navbar+Sidebar, NO group gate, NO index page.
- `ClerkProvider` wraps all at `app/[locale]/layout.tsx`.
- **Subscription resolver lives in `lib/credits.ts` `hasUnlimitedUsageAccess()`** (lines 106-130):
  reads `subscriptions` table keyed by `clerk_user_id`, currently `tier` + `stripe_status`.
  This is THE function premium paths already call — `requirePlan` must reuse it.

## 3. Approach — new public `(explore)` route group (read-only, divorced from auth)
Chosen over demo-mode-flag (bleeds unauth state into gated components) and pure-marketing tour.

## 4. Implementation steps
1. **Repoint CTA** `solution-matrix.tsx` → `href="/explore"`.
2. **Public tour surface** `app/[locale]/(explore)/` (NO `auth()`/`requireAuth()`, sample data only):
   - `page.tsx`: feature grid → each links to `/explore/[feature]`.
   - `/explore/[feature]/page.tsx`: lightly interactive read-only demo (sample chat,
     read-only memory graph, static media/expert/telemetry UI + "unlock" CTA).
3. **Fail-closed middleware** `middleware.ts` (`clerkMiddleware`): protect all routes by
   default; **explicitly whitelist** `/explore`, `/docs`, `/sign-in`, `/sign-up`,
   `/api/webhooks/kofi`. Redirect everything else to
   `redirectToSignIn({ redirect_url: req.url })`. Keeps existing per-route `requireAuth()`
   as defense-in-depth.
4. **Ko-fi schema update** (`lib/credits.ts` + Supabase migration):
   - In `subscriptions` table: **KEEP `tier`** (pro/enterprise distinction), **ADD
     `premium_until timestamptz`**, **REMOVE `stripe_status`** (no longer used).
   - Update `hasUnlimitedUsageAccess()` (line 124-130) to:
     `data?.tier === 'pro' && data?.premium_until && new Date(data.premium_until) > new Date()`.
     (Retains `enterprise` unlimited, MASTER/allowlist bypasses unchanged.)
   - New `lib/security/requirePlan.ts` → `requirePlan(userId)` reuses the updated resolver.
5. **Ko-fi webhook** `/api/webhooks/kofi/route.ts` — **SYNCHRONOUS, not queued** (see §5).
6. **Premium gate** (additive, after auth): Media/Expert/Telemetry routes call
   `requirePlan()`; on fail → paywall modal (reuse `PricingModal` styling).
7. **Upgrade CTA "workspace intelligence"**: demos + gated-route unauthorized →
   `/sign-up?redirect_url=/<feature>`.
8. **Manual claim fallback UI** — see §6 (Placement).
9. **Verify**: `tsc --noEmit`; local — `/explore` 200, real route unauth → 307 sign-in
   (redirect_url preserved), premium unauth → paywall; Ko-fi webhook test (HMAC + idempotency);
   push; poll live.

## 5. Ko-fi Webhook: SYNCHRONOUS processing (LOCKED DECISION)
**Decision: handle the DB write synchronously inside the POST handler. Do NOT add a queue.**
Rationale: the workload is one HMAC verify + one Clerk email lookup + one `subscriptions`
upsert (sub-100ms). Ko-fi retries on non-2xx, giving at-least-once delivery + retry for free.
A queue would be premature infra (vision: lean footprint) and would *lose* retry safety if we
returned 200 before processing.

### Three idempotency / safety guardrails (must implement)
1. **Verify the Ko-fi verification token (HMAC) BEFORE any DB work** → `401` on mismatch.
   (Middleware whitelists `/api/webhooks/kofi` from auth, but the route does its own HMAC.)
2. **Idempotency via `kofi_transaction_id`**: use it as the idempotency key. Upsert
   `premium_until = GREATEST(existing_premium_until, now + 30d)` so a duplicate delivery can
   never *shorten* a sub. Store applied transaction IDs (or check before extending).
3. **Return `500` on DB/Clerk failure (NEVER `200`)** so Ko-fi retries. Return `200` ONLY
   after the write succeeds. Wrap the write in try/catch.
- Optional perf: cache `email → clerk_user_id` in Supabase so the hot path is one read + one
  upsert (avoids Clerk latency on every delivery).

## 6. Manual Claim Fallback — Placement (LOCKED DECISION)
Add a **new "Membership" Card** to `app/[locale]/(dashboard)/(routes)/settings/page.tsx`,
placed **immediately after `CreditsCard`** (top of the settings stack, before Slack/Vault).
Rationale: billing-adjacent, and a user bounced from a paywall lands on Settings expecting to
manage their plan — the escape hatch must be front-and-center.
- Card shows current plan state (Free / Pro until <date>).
- **Claim fallback form** (manual transaction ID + email input), shown when:
  - `requirePlan()` fails AND no matched `subscriptions` row exists for this Clerk user
    (i.e. webhook couldn't auto-match their Ko-fi email), OR always available as a
    self-serve escape hatch.
- Submit → `POST /api/settings/claim` → verifies the Ko-fi transaction id against Ko-fi API
  (or a recorded-purchases table) and, on success, sets `premium_until`.

## 7. Invariants / risks
- Middleware ADDS gates; never removes existing auth. Premium gate additive. CodeQL must pass.
- Tour pages: ZERO user-data queries (sample/mock only).
- Schema change must update BOTH the `subscriptions` table AND `hasUnlimitedUsageAccess()` —
  leaving the old `stripe_status` read in place would silently break premium access.
- Brand coherence: Lattice OS = surface, Weaver = face, Relay = invisible.

## 8. Files touched (preview)
- `components/marketing/solution-matrix.tsx` (CTA href)
- `middleware.ts` (new, fail-closed + whitelist)
- `app/[locale]/(explore)/page.tsx` + `/explore/[feature]/page.tsx` (new)
- `lib/credits.ts` (schema resolver update) + Supabase migration (add `premium_until`, drop `stripe_status`)
- `lib/security/requirePlan.ts` (new)
- `/api/webhooks/kofi/route.ts` (new, sync + HMAC + idempotent)
- `/api/settings/claim/route.ts` (new, manual fallback)
- `app/[locale]/(dashboard)/(routes)/settings/page.tsx` (Membership card + claim form)
- Premium route pages: `/image`, `/music`, `/video`, `/expert`, `/(routes)/telemetry` (gate)
- Possibly small demo components under `components/explore/`
