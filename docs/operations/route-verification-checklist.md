# Route Verification Checklist

## Purpose

This document provides a practical checklist for verifying route behavior in Genie AI / `ai-saas`.

It is intended to reduce a common class of regressions where:
- public routes unexpectedly bounce to auth
- locale-prefixed variants behave differently than base routes
- API behavior diverges from route expectations
- deploy/build confidence is assumed without route-level runtime verification

This is a lightweight operational checklist, not a replacement for deeper testing.

---

## Core Principle

A route is not verified just because:
- the code compiled
- the page exists in the repo
- a deploy workflow turned green

A route is only verified when the relevant runtime behavior has been tested for the actual use case.

---

## When to Use This Checklist

Use this checklist when changing:
- public informational pages
- authenticated pages
- auth/public route boundaries
- locale-sensitive routes
- support/blog/docs/privacy surfaces
- route-linked navigation flows
- route handlers that materially affect user-visible behavior

---

## Route Verification Dimensions

Every route change should be considered across at least these dimensions:

1. visibility
2. auth behavior
3. locale behavior
4. navigation path
5. runtime correctness
6. API dependency correctness (if applicable)

---

## Public Route Checklist

For a route intended to be public, verify:

- [ ] route loads while logged out
- [ ] route does not redirect to sign-in unexpectedly
- [ ] route works from the actual public page that links to it
- [ ] locale-prefixed route variants also work if applicable
- [ ] nested route variants work if applicable
- [ ] `proxy.ts` / public-route allowlist reflects intended visibility
- [ ] runtime content actually renders, not just shell HTML

### Example routes
- docs
- support
- privacy
- blog
- public landing sections

---

## Authenticated Route Checklist

For a route intended to be protected, verify:

- [ ] route requires sign-in when logged out
- [ ] route loads correctly when logged in
- [ ] user-specific data resolves as expected
- [ ] navigation into the route works from the intended entry path
- [ ] route does not accidentally expose partial content publicly

### Example routes
- dashboard
- workspaces
- conversations
- settings

---

## Locale Verification Checklist

For any route in the localized app structure, verify:

- [ ] non-locale or base behavior is understood
- [ ] locale-prefixed path loads correctly
- [ ] canonical linked path matches intended locale behavior
- [ ] redirects do not break locale handling
- [ ] generated links point to the correct localized destination

### Why this matters
Localized routes can look correct in one path form while still failing in another.

---

## Navigation Verification Checklist

For any route that is reached through UI navigation, verify:

- [ ] direct URL access works as intended
- [ ] in-app navigation works as intended
- [ ] entry through the actual user-facing button/link works
- [ ] mobile and desktop nav flows behave consistently where relevant

### Why this matters
A route can work directly by URL but still fail through its real entry surface.

---

## API-Dependent Route Checklist

For pages that depend on API-backed runtime data, verify:

- [ ] the page shell loads
- [ ] the page data loads successfully
- [ ] the relevant API routes are behaving correctly at runtime
- [ ] auth/public expectations match between page and API dependencies
- [ ] missing schema/config issues are ruled out if the route depends on DB state

---

## Public/Auth Boundary Regression Checklist

Use this when a bug looks like “this should be public but isn’t” or “this should be protected but leaked.”

- [ ] confirm intended route visibility
- [ ] inspect `proxy.ts` allowlist behavior
- [ ] check locale-prefixed and nested path coverage
- [ ] verify logged-out behavior directly
- [ ] verify the route from the public UI entry point
- [ ] check whether the page links into a protected subtree by mistake

---

## Truth Surfaces to Use

### For code/path existence
- source-of-code truth

### For auth/public behavior
- live runtime truth
- public-route documentation

### For route-backed data issues
- API runtime truth
- schema/database truth if relevant

### For deployment concerns
- deploy truth plus live runtime verification

---

## Minimal Verification Standard

At minimum, a meaningful route fix/change should verify:

- [ ] intended route path
- [ ] intended auth behavior
- [ ] intended entry path
- [ ] intended live runtime outcome

Anything less is often too weak for this codebase’s route complexity.

---

## Summary

The key rule is simple:

**Verify routes in the way users actually reach them, not just in the way developers imagine them.**
