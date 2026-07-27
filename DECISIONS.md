# Lattice OS — Architectural Decisions

## Purpose
This file resolves open architectural questions so contributors stop re-litigating them. Each decision is final unless explicitly revisited by JJ.

---

## 1. Monorepo tool: pnpm workspaces only (no Turborepo / Nx)

**Decision:** Stick with vanilla pnpm workspaces for now.

**Rationale:**
- The 4 workspace packages are small; Turborepo’s task graph caching returns diminishing returns versus the added config surface.
- Nx is powerful but opinionated; we’re not big enough to amortize its schema.
- pnpm workspaces + explicit `pnpm --dir` builds are already proven in Vercel.

**Revisit trigger:** > 15 workspace packages OR > 3 min local build time.

---

## 2. Remote MCP hosting: Vercel Edge Function

**Decision:** Remote MCP lives as Vercel API routes (`app/api/v1/mcp/**`) behind Clerk auth, not a separate Railway/Render service.

**Rationale:**
- Keeps auth, secrets, and domain in one place.
- The StreamableHTTPServerTransport already works over HTTP.
- Vercel cron + serverless scale is sufficient for beta traffic.

**Revisit trigger:** > 500 concurrent MCP sessions OR need for persistent long-lived connections.

---

## 3. Dynamic client registration whitelist

**Decision:** Any authenticated user can register an OAuth client (proof-of-concept). Production will add a review/approval step.

**Rationale:**
- Speed of evaluation is paramount during the pilot.
- Registrar is scoped by workspace; abuse is bounded.
- Post-pilot: route to a Pending Approval state with admin review.

---

## 4. Rate limiting user-ID keying

**Decision:** Key MCP rate limits by `userId` + endpoint type (`ai`, `mutation`, `query`), falling back to in-memory in dev and Upstash Redis in prod.

**Rationale:**
- Users are the security principal, not IPs (shared networks, NATs).
- Maintains contract present in chat/code endpoints.

---

## 5. Python CLI remains standalone (no TypeScript migration)

**Decision:** The Python CLI in `scripts/lattice-cli/` is not being ported into the monorepo. It stays as a standalone binary/pip package.

**Rationale:**
- The CLI is an appliance management layer, not a product dependency.
- Nuitka-compiled binaries don’t benefit from sharing TS core code.
- The CLI can still import Zod schemas via `pydantic`-style validation if needed later.

**Revisit trigger:** Need for shared business logic between CLI and web app.

---

## 6. Package publish strategy

**Decision:** Publish `@lattice-os/*` packages to npm under `beta` tag until 1.0.0. Use `oxlint` in CI but do not gate builds on zero warnings yet.

**Rationale:**
- Allows early adopters / partners without self-hosting the monorepo.
- `beta` tag signals readiness without breaking SemVer guarantees.

---

## 7. OXC adoption

**Decision:** Add `oxlint` as a fast CI linter alongside TypeScript. Keep `eslint` for now and migrate incrementally.

**Rationale:**
- OXC is fast enough for pre-commit hooks.
- Full migration is churn; benefit is marginal until the team hits a real perf wall.

---

## 8. iOS 27 Siri Observability: PWA-first, Apple account blocked

**Decision:** Ship a web-native PWA Memory Center first. Defer Foundation Models / App Intents / Core AI / Evaluations native iOS integration until an Apple developer account and Xcode 27 are available on this machine.

**Rationale:**
- No active Apple developer account on the current build host; Xcode-born phases are currently blocked.
- A PWA delivers the observability layer immediately with the same data model that will later map to SwiftData.
- Offline-first IndexedDB via `idb` plus service worker + Background Sync gives native-equivalent local persistence.
- `display: standalone` PWA chrome is close enough for install-to-home-screen testing while waiting for native.

**Tradeoff accepted:** Users do not get on-device Foundation Models or App Intents until Phase 2 unblocks. The backend ingest contract is identical for both PWA and native paths.

**Revisit trigger:** Active Apple developer account + Xcode 27 installed on a build host.
