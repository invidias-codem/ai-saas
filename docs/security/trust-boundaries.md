# Trust Boundaries

## Purpose

This document explains the major trust boundaries in Genie AI / `ai-saas`.

It exists because the platform is not a single-surface application. It includes:
- public landing and informational routes
- authenticated product routes
- API routes
- cron/automation jobs
- integrations and webhooks
- local development and operational surfaces

When those surfaces are not clearly separated, the system becomes harder to secure, harder to reason about, and easier to break accidentally.

This document describes the current trust model at a practical architectural level.

---

## Core Principle

Not every surface of the application should be trusted equally.

A healthy architecture distinguishes between:
- who is allowed to access a surface
- what that surface is allowed to do
- what assumptions the backend is allowed to make about the caller

Trust boundaries are not only about authentication. They are also about:
- execution rights
- data exposure
- operational authority
- integration privileges
- system-to-system assumptions

---

## Primary Trust Zones

Genie AI should be understood as operating across several major trust zones.

## 1. Public Visitor Zone

### Who this includes
- unauthenticated web visitors
- public readers of landing/support/blog/docs/privacy-style surfaces

### What this zone should access
- public marketing pages
- public documentation
- public support and policy content
- explicitly public entry flows such as sign-in/sign-up

### What this zone should not access
- authenticated user data
- protected product routes
- private API behavior
- mutation surfaces that assume user identity

### Key risk
A public-looking page can still be blocked or misrouted if route gating is not configured correctly.

---

## 2. Authenticated User Zone

### Who this includes
- signed-in end users using the product intentionally through supported product routes

### What this zone should access
- workspace and conversation surfaces
- user settings
- authenticated APIs
- product features scoped to their identity and permissions

### What this zone should not automatically access
- unrestricted internal admin behavior
- backend-only automation privileges
- other users’ state by default
- integration secrets or privileged system tools

### Key note
Authentication is necessary but not sufficient. The system should still respect feature- and data-level boundaries within authenticated use.

---

## 3. Backend Application Zone

### Who this includes
- server-side route handlers
- internal product logic
- trusted backend execution paths

### What this zone can do
- resolve runtime behavior
- access trusted configuration
- call providers using server-side credentials
- write protected state when appropriate
- mediate between UI requests and persistence/integration systems

### Why this matters
The backend application layer is a trust boundary because it has more authority than a public client. It should not simply mirror client requests blindly.

---

## 4. Automation / Cron Zone

### Who this includes
- scheduled jobs
- background automation flows
- task runners hitting internal API routes

### What this zone can do
- run maintenance/update workflows
- perform scheduled integration behavior
- access privileged automation routes where explicitly intended

### Why this matters
Automation routes are often public in transport terms (they must be reachable), but they are not “public” in the normal user-trust sense.

They require:
- narrow scope
- strong verification
- clear operational intent

### Key risk
A route being externally reachable for cron/webhook reasons does not mean it should behave like an ordinary public endpoint.

---

## 5. Integration / Webhook Zone

### Who this includes
- Slack callbacks
- Telegram webhooks
- external providers or platform callbacks
- other third-party event sources

### What this zone should be trusted for
- only the specific behavior validated for that integration

### What it should not be trusted for by default
- arbitrary product actions
- unrestricted internal state mutation
- broad authenticated-user equivalence

### Why this matters
External callbacks may be legitimate but still untrusted until validated through:
- signing secrets
- verification tokens
- route-specific checks
- payload validation

---

## 6. Data / Persistence Zone

### Who this includes
- database-backed product state
- structured persistence systems
- schema-backed application behavior

### Trust boundary function
The persistence layer should distinguish between:
- public-readable data
- authenticated user data
- internal system state
- automation-only or admin-only mutation paths

### Why this matters
A database row existing does not imply every app surface should be allowed to read or mutate it.

This is especially important when product architecture evolves faster than policy clarity.

---

## 7. Scoping Model: Users, Workspaces, Documents, and Retrieval

Many failures that look like “AI bugs” are actually scoping or trust-boundary bugs.

The most important scoping layers are:

### User boundary
A missing workspace does not mean missing scope.
Personal documents and personal conversations still belong to a user boundary and must never be treated as globally unscoped.

### Workspace boundary
When a workspace exists, it is the primary collaborative/project scope for:
- documents
- conversations
- retrieval
- memory/context assembly

A document attached to Workspace A should not silently influence Workspace B.

### Document boundary
Documents are first-class scoped objects, not just transient chat attachments.
A document may be:
- personal
- workspace-scoped
- warm
- compressing
- cold

Chat should reference document identity or retrieved chunks, not repeatedly transport raw document bodies.

### Retrieval boundary
Retrieval requests should use the narrowest relevant scope available.
Preferred scope anchors are:
1. explicit document IDs
2. workspace ID when present
3. user ownership when workspace is absent

Two failure modes matter here:
- **over-scoping**: valid context is skipped because a scope field is absent
- **under-scoping**: unrelated documents leak into results because scope is too broad

### Preview boundary
Preview is a direct document read/hydration path, not the same thing as retrieval.
Preview should validate:
- auth
- document identity
- user/workspace access rights

A preview route should not require a workspace if the document is legitimately personal.

### Runtime/provider boundary
Infrastructure or provider differences must not silently change the meaning of user/workspace/document scope.
Whether Lattice runs with different models, storage, or retrieval backends, scoping semantics should stay stable.

---

## 8. Local Development / Operator Zone

### Who this includes
- developers with local repo access
- local scripts and tooling
- operator/debug surfaces
- machine-local environment state

### Why this matters
Local access is highly privileged, but it is also one of the easiest places for truth confusion and accidental leakage to occur.

### Risks in this zone
- local drift mistaken for source truth
- secrets/config mishandling
- local-only fixes assumed to represent production behavior
- build or schema assumptions inferred from an unhealthy machine state

This is a trust zone because operator actions often exceed normal application permissions dramatically.

---

## Boundary Types

Trust boundaries in this system appear in multiple forms.

## A. Route Boundary
Whether a route is public, authenticated, or restricted.

## B. Data Boundary
Whether a surface can read or mutate certain classes of state.

## C. Execution Boundary
Whether a caller can trigger high-authority logic.

## D. Integration Boundary
Whether an external system is allowed to invoke a narrow callback or a broader action surface.

## E. Operational Boundary
Whether a local or backend actor is being treated as a development/operator surface rather than a normal user surface.

---

## Public vs Protected Is Not the Whole Story

One common mistake is to collapse all security thinking into a binary:
- public
- authenticated

That is not enough for this platform.

For example:
- a cron route may be transport-public but operationally privileged
- a signed-in user is authenticated but should not automatically gain admin-like power
- a webhook endpoint may be reachable but only valid for one narrow integration behavior

Trust boundaries must reflect these distinctions.

---

## Examples of Boundary Discipline in Practice

## Example 1 — Public Docs Route
A docs route may be public in UI intent, but unless the auth gate treats it as public, unauthenticated users get bounced.

### Lesson
Public-route intent must match actual route gating.

---

## Example 2 — Authenticated Product APIs
A signed-in user can use product APIs, but that does not mean the server should accept every client claim as authoritative.

### Lesson
The backend must still resolve real behavior using trusted context.

---

## Example 3 — Cron or Webhook Routes
A route can be externally callable while still belonging to a privileged automation boundary.

### Lesson
Reachability is not the same thing as broad trust.

---

## Example 4 — Database Schema Presence
A table existing in the repository or local database does not mean the production system should assume it exists everywhere or that every caller should be allowed to use it.

### Lesson
Schema truth and access policy are separate concerns.

---

## Common Boundary Failures to Avoid

## 1. UI Intent Without Backend Enforcement
A page looks public but is still protected by middleware.

## 2. Client Assertions Treated as Trusted Truth
The frontend claims a mode, state, or decision that the backend should really resolve itself.

## 3. Overbroad Callback Trust
An integration/webhook route accepts more authority than its narrow purpose requires.

## 4. Authenticated Equals Admin Drift
Signed-in users are treated as if they should automatically access internal or privileged logic.

## 5. Local Operator Confusion
Local environment behavior is mistaken for production reality or canonical architecture.

---

## Boundary Review Checklist

When adding a new route, feature, or integration, ask:

1. Which trust zone is the caller in?
2. What is the minimum authority this surface needs?
3. What state is readable from this path?
4. What state is writable from this path?
5. What assumptions is the backend making about the caller?
6. Is this a public route, authenticated route, privileged backend route, or narrow integration route?
7. If the route is externally reachable, is it still tightly bounded in behavior?

---

## Relationship to Other Docs

This document should be read alongside:
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- future API and trust/reference documentation

Public route documentation explains **visibility**.
This trust-boundary document explains **authority**.

---

## Summary

The most important security idea for this codebase is this:

**Do not treat all reachable surfaces, authenticated users, or external callbacks as equally trusted.**

Genie AI is a multi-surface platform, and its security depends on keeping those surfaces legible, narrow, and appropriately bounded.
