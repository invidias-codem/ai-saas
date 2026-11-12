# Trust Boundaries (ขอบเขตความไว้วางใจ)

## Purpose (วัตถุประสงค์)

This document explains the major trust boundaries in Genie AI / `ai-saas` (เอกสารนี้อธิบาย major trust boundaries ใน Genie AI / `ai-saas`)

It exists because the platform is not a single-surface application (มันมีอยู่เพราะ platform ไม่ใช่ single-surface application) It includes (รวมถึง):
- public landing and informational routes (public landing และ informational routes)
- authenticated product routes (authenticated product routes)
- API routes (API routes)
- cron/automation jobs (cron/automation jobs)
- integrations and webhooks (integrations และ webhooks)
- local development and operational surfaces (local development และ operational surfaces)

When those surfaces are not clearly separated, the system becomes harder to secure, harder to reason about, and easier to break accidentally (เมื่อ surfaces เหล่านี้ not clearly separated, system กลายเป็น harder to secure, harder to reason about, และ easier to break accidentally)

This document describes the current trust model at a practical architectural level (เอกสารนี้ describes current trust model at a practical architectural level)

---

## Core Principle (หลักการพื้นฐาน)

Not every surface of the application should be trusted equally (Not every surface of the application should be trusted equally)

A healthy architecture distinguishes between (A healthy architecture distinguishes between):
- who is allowed to access a surface (ใคร allowed to access a surface)
- what that surface is allowed to do (surface นั้น allowed to do อะไร)
- what assumptions the backend is allowed to make about the caller (backend allowed to make assumptions เกี่ยวกับ caller อะไร)

Trust boundaries are not only about authentication (Trust boundaries not only about authentication) They are also about (They are also about):
- execution rights (execution rights)
- data exposure (data exposure)
- operational authority (operational authority)
- integration privileges (integration privileges)
- system-to-system assumptions (system-to-system assumptions)

---

## Primary Trust Zones (Primary Trust Zones)

Genie AI should be understood as operating across several major trust zones (Genie AI should be understood as operating across several major trust zones)

## 1. Public Visitor Zone (Public Visitor Zone / โซนผู้เยี่ยมชมสาธารณะ)

### Who this includes (ใครที่ this includes)
- unauthenticated web visitors (unauthenticated web visitors)
- public readers of landing/support/blog/docs/privacy-style surfaces (public readers ของ landing/support/blog/docs/privacy-style surfaces)

### What this zone should access (โซนนี้ควร access อะไร)
- public marketing pages (public marketing pages)
- public documentation (public documentation)
- public support and policy content (public support and policy content)
- explicitly public entry flows such as sign-in/sign-up (explicitly public entry flows เช่น sign-in/sign-up)

### What this zone should not access (โซนนี้ไม่ควร access)
- authenticated user data (authenticated user data)
- protected product routes (protected product routes)
- private API behavior (private API behavior)
- mutation surfaces that assume user identity (mutation surfaces that assume user identity)

### Key risk (Key risk / ความเสี่ยงหลัก)
A public-looking page can still be blocked or misrouted if route gating is not configured correctly (A public-looking page can still be blocked or misrouted if route gating is not configured correctly)

---

## 2. Authenticated User Zone (Authenticated User Zone / โซนผู้ใช้ที่ยืนยันตัวตน)

### Who this includes
- signed-in end users using the product intentionally through supported product routes (signed-in end users using the product intentionally through supported product routes)

### What this zone should access
- workspace and conversation surfaces (workspace and conversation surfaces)
- user settings (user settings)
- authenticated APIs (authenticated APIs)
- product features scoped to their identity and permissions (product features scoped to their identity and permissions)

### What this zone should not automatically access (โซนนี้ไม่ควร automatically access)
- unrestricted internal admin behavior (unrestricted internal admin behavior)
- backend-only automation privileges (backend-only automation privileges)
- other users' state by default (other users' state by default)
- integration secrets or privileged system tools (integration secrets or privileged system tools)

### Key note (Key note / หมายเหตุสำคัญ)
Authentication is necessary but not sufficient (Authentication is necessary but not sufficient) The system should still respect feature- and data-level boundaries within authenticated use (The system should still respect feature- and data-level boundaries within authenticated use)

---

## 3. Backend Application Zone (Backend Application Zone / โซนแอปพลิเคชันแบ็กเอนด์)

### Who this includes
- server-side route handlers (server-side route handlers)
- internal product logic (internal product logic)
- trusted backend execution paths (trusted backend execution paths)

### What this zone can do (โซนนี้ can do อะไร)
- resolve runtime behavior (resolve runtime behavior)
- access trusted configuration (access trusted configuration)
- call providers using server-side credentials (call providers using server-side credentials)
- write protected state when appropriate (write protected state when appropriate)
- mediate between UI requests and persistence/integration systems (mediate between UI requests and persistence/integration systems)

### Why it matters (Why it matters / ทำไมมัน matters)
The backend application layer is a trust boundary because it has more authority than a public client (The backend application layer is a trust boundary because it has more authority than a public client) It should not simply mirror client requests blindly (It should not simply mirror client requests blindly)

---

## 4. Automation / Cron Zone (Automation / Cron Zone / โซนอัตโนมัติ / Cron)

### Who this includes
- scheduled jobs (scheduled jobs)
- background automation flows (background automation flows)
- task runners hitting internal API routes (task runners hitting internal API routes)

### What this zone can do
- run maintenance/update workflows (run maintenance/update workflows)
- perform scheduled integration behavior (perform scheduled integration behavior)
- access privileged automation routes where explicitly intended (access privileged automation routes where explicitly intended)

### Why it matters (Why it matters / ทำไมมัน matters)
Automation routes are often public in transport terms (they must be reachable), but they are not "public" in the normal user-trust sense (Automation routes are often public in transport terms (they must be reachable), but they are not "public" in the normal user-trust sense)

They require (They require):
- narrow scope (narrow scope)
- strong verification (strong verification)
- clear operational intent (clear operational intent)

### Key risk (Key risk / ความเสี่ยงหลัก)
A route being externally reachable for cron/webhook reasons does not mean it should behave like an ordinary public endpoint (A route being externally reachable for cron/webhook reasons does not mean it should behave like an ordinary public endpoint)

---

## 5. Integration / Webhook Zone (Integration / Webhook Zone / โซนการรวม / Webhook)

### Who this includes
- Slack callbacks (Slack callbacks)
- Telegram webhooks (Telegram webhooks)
- external providers or platform callbacks (external providers or platform callbacks)
- other third-party event sources (other third-party event sources)

### What this zone should be trusted for (โซนนี้ should be trusted for)
- only the specific behavior validated for that integration (only the specific behavior validated for that integration)

### What it should not be trusted for by default (What it should not be trusted for by default / สิ่งที่ไม่ควร trusted by default)
- arbitrary product actions (arbitrary product actions)
- unrestricted internal state mutation (unrestricted internal state mutation)
- broad authenticated-user equivalence (broad authenticated-user equivalence)

### Why it matters (Why it matters)
External callbacks may be legitimate but still untrusted until validated through (External callbacks may be legitimate but still untrusted until validated through):
- signing secrets (signing secrets)
- verification tokens (verification tokens)
- route-specific checks (route-specific checks)
- payload validation (payload validation)

---

## 6. Data / Persistence Zone (Data / Persistence Zone / โซนข้อมูล / Persistence)

### Who this includes
- database-backed product state (database-backed product state)
- structured persistence systems (structured persistence systems)
- schema-backed application behavior (schema-backed application behavior)

### Trust boundary function (Trust boundary function / ฟังก์ชัน Trust boundary)
The persistence layer should distinguish between (The persistence layer should distinguish between):
- public-readable data (public-readable data)
- authenticated user data (authenticated user data)
- internal system state (internal system state)
- automation-only or admin-only mutation paths (automation-only or admin-only mutation paths)

### Why it matters
A database row existing does not imply every app surface should be allowed to read or mutate it (A database row existing does not imply every app surface should be allowed to read or mutate it)

This is especially important when product architecture evolves faster than policy clarity (This is especially important when product architecture evolves faster than policy clarity)

---

## 7. Scoping Model: Users, Workspaces, Documents, and Retrieval (Scoping Model: Users, Workspaces, Documents, and Retrieval / โมเดล Scoping: Users, Workspaces, Documents, และ Retrieval)

Many failures that look like "AI bugs" are actually scoping or trust-boundary bugs (Many failures that look like "AI bugs" are actually scoping or trust-boundary bugs)

The most important scoping layers are (The most important scoping layers are):

### User Boundary (User Boundary / ขอบเขตผู้ใช้)
A missing workspace does not mean missing scope (A missing workspace does not mean missing scope)
Personal documents and personal conversations still belong to a user boundary and must never be treated as globally unscoped (Personal documents and personal conversations still belong to a user boundary and must never be treated as globally unscoped)

### Workspace Boundary (Workspace Boundary / ขอบเขต Workspace)
When a workspace exists, it is the primary collaborative/project scope for (When a workspace exists, it is the primary collaborative/project scope for):
- documents (documents)
- conversations (conversations)
- retrieval (retrieval)
- memory/context assembly (memory/context assembly)

A document attached to Workspace A should not silently influence Workspace B (A document attached to Workspace A should not silently influence Workspace B)

### Document Boundary (Document Boundary / ขอบเขตเอกสาร)
Documents are first-class scoped objects, not just transient chat attachments (Documents are first-class scoped objects, not just transient chat attachments)
A document may be (A document may be):
- personal (personal)
- workspace-scoped (workspace-scoped)
- warm (warm)
- compressing (compressing)
- cold (cold)

Chat should reference document identity or retrieved chunks, not repeatedly transport raw document bodies (Chat should reference document identity or retrieved chunks, not repeatedly transport raw document bodies)

### Retrieval Boundary (Retrieval Boundary / ขอบเขต Retrieval)
Retrieval requests should use the narrowest relevant scope available (Retrieval requests should use the narrowest relevant scope available)
Preferred scope anchors are (Preferred scope anchors are):
1. explicit document IDs (explicit document IDs)
2. workspace ID when present (workspace ID when present)
3. user ownership when workspace is absent (user ownership when workspace is absent)

Two failure modes matter here (Two failure modes matter here):
- **over-scoping**: valid context is skipped because a scope field is absent (valid context is skipped because a scope field is absent)
- **under-scoping**: unrelated documents leak into results because scope is too broad (unrelated documents leak into results because scope is too broad)

### Preview Boundary (Preview Boundary / ขอบเขต Preview)
Preview is a direct document read/hydration path, not the same thing as retrieval (Preview is a direct document read/hydration path, not the same thing as retrieval)
Preview should validate (Preview should validate):
- auth (auth)
- document identity (document identity)
- user/workspace access rights (user/workspace access rights)

A preview route should not require a workspace if the document is legitimately personal (A preview route should not require a workspace if the document is legitimately personal)

### Runtime/Provider Boundary (Runtime/Provider Boundary / ขอบเขต Runtime/Provider)
Infrastructure or provider differences must not silently change the meaning of user/workspace/document scope (Infrastructure or provider differences must not silently change the meaning of user/workspace/document scope)
Whether Lattice runs with different models, storage, or retrieval backends, scoping semantics should stay stable (Whether Lattice runs with different models, storage, or retrieval backends, scoping semantics should stay stable)

---

## 8. Local Development / Operator Zone (Local Development / Operator Zone / โซนการพัฒนาท้องถิ่น / Operator)

### Who this includes (ใครที่ this includes)
- developers with local repo access (developers with local repo access)
- local scripts and tooling (local scripts and tooling)
- operator/debug surfaces (operator/debug surfaces)
- machine-local environment state (machine-local environment state)

### Why this matters (Why this matters / ทำไมมัน matters)
Local access is highly privileged, but it is also one of the easiest places for truth confusion and accidental leakage to occur (Local access is highly privileged, but it is also one of the easiest places for truth confusion and accidental leakage to occur)

### Risks in this zone (Risks in this zone / ความเสี่ยงในโซนนี้)
- local drift mistaken for source truth (local drift mistaken for source truth)
- secrets/config mishandling (secrets/config mishandling)
- local-only fixes assumed to represent production behavior (local-only fixes assumed to represent production behavior)
- build or schema assumptions inferred from an unhealthy machine state (build or schema assumptions inferred from an unhealthy machine state)

This is a trust zone because operator actions often exceed normal application permissions dramatically (This is a trust zone because operator actions often exceed normal application permissions dramatically)

---

## 9. Terminal / Raw SSE + Local Sandbox Zone (Terminal / Raw SSE + Local Sandbox Zone / โซน Terminal / Raw SSE + Local Sandbox)

### Who this includes
- CLI clients and local shell loops (CLI clients and local shell loops)
- machine-local automation calling `/api/cli/stream` and `/api/memory/cli` (machine-local automation calling `/api/cli/stream` and `/api/memory/cli`)
- local approval-matrix behavior in `~/.lattice/settings` (local approval-matrix behavior in `~/.lattice/settings`)

### Why this matters
This zone is technically remote-backed but authority is split between (This zone is technically remote-backed but authority is split between):
- the server stream API (the server stream API)
- local client trust decisions (local client trust decisions)
- user-gated execution in the shell loop (user-gated execution in the shell loop)

It is not public, and it is not equivalent to normal authenticated product usage (It is not public, and it is not equivalent to normal authenticated product usage)

### Rules in this zone (Rules in this zone / กฎในโซนนี้)
- `/api/cli/stream` and `/api/memory/cli` require bearer-token auth when `LATTICE_CLI_TOKEN` is configured (`/api/cli/stream` and `/api/memory/cli` require bearer-token auth when `LATTICE_CLI_TOKEN` is configured)
- local approval modes affect execution authority, not server trust (local approval modes affect execution authority, not server trust)
- bearer tokens must not be treated like anonymous or public credentials (bearer tokens must not be treated like anonymous or public credentials)
- proxy or transport layers must not expose these routes as public by omission (proxy or transport layers must not expose these routes as public by omission)

---

## Boundary Types (Boundary Types / ประเภทขอบเขต)

Trust boundaries in this system appear in multiple forms (Trust boundaries in this system appear in multiple forms)

## A. Route Boundary (Route Boundary / ขอบเขตเส้นทาง)
Whether a route is public, authenticated, or restricted (Whether a route is public, authenticated, or restricted)

## B. Data Boundary (Data Boundary / ขอบเขตข้อมูล)
Whether a surface can read or mutate certain classes of state (Whether a surface can read or mutate certain classes of state)

## C. Execution Boundary (Execution Boundary / ขอบเขตการดำเนินการ)
Whether a caller can trigger high-authority logic (Whether a caller can trigger high-authority logic)

## D. Integration Boundary (Integration Boundary / ขอบเขตการรวม)
Whether an external system is allowed to invoke a narrow callback or a broader action surface (Whether an external system is allowed to invoke a narrow callback or a broader action surface)

## E. Operational Boundary (Operational Boundary / ขอบเขตการดำเนินงาน)
Whether a local or backend actor is being treated as a development/operator surface rather than a normal user surface (Whether a local or backend actor is being treated as a development/operator surface rather than a normal user surface)

---

## Public vs Protected Is Not the Whole Story (Public vs Protected Is Not the Whole Story)

One common mistake is to collapse all security thinking into a binary (One common mistake is to collapse all security thinking into a binary):
- public (public)
- authenticated (authenticated)

That is not enough for this platform (That is not enough for this platform)

For example (For example):
- a cron route may be transport-public but operationally privileged (a cron route may be transport-public but operationally privileged)
- a signed-in user is authenticated but should not automatically gain admin-like power (a signed-in user is authenticated but should not automatically gain admin-like power)
- a webhook endpoint may be reachable but only valid for one narrow integration behavior (a webhook endpoint may be reachable but only valid for one narrow integration behavior)

Trust boundaries must reflect these distinctions (Trust boundaries must reflect these distinctions)

---

## Examples of Boundary Discipline in Practice (Examples of Boundary Discipline in Practice)

## Example 1 — Public Docs Route (Example 1 — Public Docs Route)
A docs route may be public in UI intent, but unless the auth gate treats it as public, unauthenticated users get bounced (A docs route may be public in UI intent, but unless the auth gate treats it as public, unauthenticated users get bounced)

### Lesson (Lesson / บทเรียน)
Public-route intent must match actual route gating (Public-route intent must match actual route gating)

---

## Example 2 — Authenticated Product APIs (Example 2 — Authenticated Product APIs)
A signed-in user can use product APIs, but that does not mean the server should accept every client claim as authoritative (A signed-in user can use product APIs, but that does not mean the server should accept every client claim as authoritative)

### Lesson
The backend must still resolve real behavior using trusted context (The backend must still resolve real behavior using trusted context)

---

## Example 3 — Cron or Webhook Routes (Example 3 — Cron or Webhook Routes)
A route can be externally callable while still belonging to a privileged automation boundary (A route can be externally callable while still belonging to a privileged automation boundary)

### Lesson
Reachability is not the same thing as broad trust (Reachability is not the same thing as broad trust)

---

## Example 4 — Database Schema Presence (Example 4 — Database Schema Presence)
A table existing in the repository or local database does not mean the production system should assume it exists everywhere or that every caller should be allowed to use it (A table existing in the repository or local database does not mean the production system should assume it exists everywhere or that every caller should be allowed to use it)

### Lesson
Schema truth and access policy are separate concerns (Schema truth and access policy are separate concerns)

---

## Common Boundary Failures to Avoid (Common Boundary Failures to Avoid)

## 1. UI Intent Without Backend Enforcement (UI Intent Without Backend Enforcement)
A page looks public but is still protected by middleware (A page looks public but is still protected by middleware)

## 2. Client Assertions Treated as Trusted Truth (Client Assertions Treated as Trusted Truth)
The frontend claims a mode, state, or decision that the backend should really resolve itself (The frontend claims a mode, state, or decision that the backend should really resolve itself)

## 3. Overbroad Callback Trust (Overbroad Callback Trust)
An integration/webhook route accepts more authority than its narrow purpose requires (An integration/webhook route accepts more authority than its narrow purpose requires)

## 4. Authenticated Equals Admin Drift (Authenticated Equals Admin Drift)
Signed-in users are treated as if they should automatically access internal or privileged logic (Signed-in users are treated as if they should automatically access internal or privileged logic)

## 5. Local Operator Confusion (Local Operator Confusion)
Local environment behavior is mistaken for production reality or canonical architecture (Local environment behavior is mistaken for production reality or canonical architecture)

---

## Boundary Review Checklist (Boundary Review Checklist / รายการตรวจสอบขอบเขต)

When adding a new route, feature, or integration, ask (When adding a new route, feature, or integration, ask):

1. Which trust zone is the caller in? (Which trust zone is the caller in?)
2. What is the minimum authority this surface needs? (What is the minimum authority this surface needs?)
3. What state is readable from this path? (What state is readable from this path?)
4. What state is writable from this path? (What state is writable from this path?)
5. What assumptions is the backend making about the caller? (What assumptions is the backend making about the caller?)
6. Is this a public route, authenticated route, privileged backend route, or narrow integration route? (Is this a public route, authenticated route, privileged backend route, or narrow integration route?)
7. If the route is externally reachable, is it still tightly bounded in behavior? (If the route is externally reachable, is it still tightly bounded in behavior?)

---

## Relationship to Other Docs (Relationship to Other Docs / ความสัมพันธ์กับเอกสารอื่น)

This document should be read alongside (This document should be read alongside):
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- future API and trust/reference documentation

Public route documentation explains **visibility** (Public route documentation explains **visibility**)
This trust-boundary document explains **authority** (This trust-boundary document explains **authority**)

---

## Summary (Summary / สรุป)

The most important security idea for this codebase is this (The most important security idea for this codebase is this):

**Do not treat all reachable surfaces, authenticated users, or external callbacks as equally trusted.** (Do not treat all reachable surfaces, authenticated users, or external callbacks as equally trusted.)

Genie AI is a multi-surface platform, and its security depends on keeping those surfaces legible, narrow, and appropriately bounded (Genie AI is a multi-surface platform, and its security depends on keeping those surfaces legible, narrow, and appropriately bounded)