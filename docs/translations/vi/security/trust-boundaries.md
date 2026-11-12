# Ranh Giới Niềm Tin (Trust Boundaries)

## Mục Đích (Purpose)

Tài liệu này giải thích (explains) các major trust boundaries (ranh giới niềm tin chính) trong Genie AI / `ai-saas`.

Nó tồn tại vì platform (nền tảng) không phải là single-surface application (ứng dụng đơn일 bề mặt). Nó includes (bao gồm):
- public landing and informational routes (các tuyến đường landing và informational công khai)
- authenticated product routes (các tuyến đường sản phẩm đã xác thực)
- API routes (các tuyến đường API)
- cron/automation jobs (công việc cron/automation)
- integrations and webhooks (tích hợp và webhooks)
- local development and operational surfaces (các bề mặt phát triển cục bộ và vận hành)

When those surfaces are not clearly separated (Khi những surfaces đó không được separated rõ ràng), the system becomes harder to secure (hệ thống trở nên khó secure hơn), harder to reason about (khó reason about hơn), và easier to break accidentally (dễ break accidentally hơn).

Tài liệu này describes the current trust model (mô tả mô hình niềm tin hiện tại) at a practical architectural level (ở practical architectural level).

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Not every surface of the application should be trusted equally (Không phải mọi surface của application đều should be trusted equally).

A healthy architecture distinguishes between (Một healthy architecture distinguishes between / phân biệt giữa):
- who is allowed to access a surface (ai được allowed to access a surface)
- what that surface is allowed to do (surface đó được allowed to do gì)
- what assumptions the backend is allowed to make about the caller (backend được allowed to make assumptions gì về caller)

Trust boundaries are not only about authentication (Trust boundaries không chỉ về authentication). They are also about (Chúng cũng về):
- execution rights (quyền thực thi)
- data exposure (phơi bày dữ liệu)
- operational authority (quyền hạn vận hành)
- integration privileges (đặc quyền tích hợp)
- system-to-system assumptions (giả định system-to-system)

---

## Primary Trust Zones (Các Vùng Niềm Tin Chính)

Genie AI should be understood as operating across several major trust zones (Genie AI nên được understood as operating across several major trust zones).

## 1. Public Visitor Zone (Vùng Khách Truy Cập Công Khai)

### Who this includes (Ai mà this includes)
- unauthenticated web visitors (khách truy cập web chưa xác thực)
- public readers of landing/support/blog/docs/privacy-style surfaces (độc giả công khai của landing/support/blog/docs/privacy-style surfaces)

### What this zone should access (Vùng này nên access gì)
- public marketing pages (public marketing pages)
- public documentation (public documentation)
- public support and policy content (public support and policy content)
- explicitly public entry flows such as sign-in/sign-up (explicitly public entry flows như sign-in/sign-up)

### What this zone should not access (Vùng này không nên access)
- authenticated user data (authenticated user data)
- protected product routes (protected product routes)
- private API behavior (private API behavior)
- mutation surfaces that assume user identity (mutation surfaces that assume user identity)

### Key risk (Key risk / Rủi ro chính)
A public-looking page can still be blocked or misrouted if route gating is not configured correctly (Một public-looking page vẫn có thể bị blocked hoặc misrouted nếu route gating not configured correctly).

---

## 2. Authenticated User Zone (Vùng Người Dùng Đã Xác Thực)

### Who this includes
- signed-in end users using the product intentionally through supported product routes (signed-in end users using the product intentionally through supported product routes)

### What this zone should access
- workspace and conversation surfaces (workspace and conversation surfaces)
- user settings (user settings)
- authenticated APIs (authenticated APIs)
- product features scoped to their identity and permissions (product features scoped to their identity and permissions)

### What this zone should not automatically access (Vùng này không nên automatically access)
- unrestricted internal admin behavior (unrestricted internal admin behavior)
- backend-only automation privileges (backend-only automation privileges)
- other users' state by default (other users' state by default)
- integration secrets or privileged system tools (integration secrets or privileged system tools)

### Key note (Key note / Ghi chú quan trọng)
Authentication is necessary but not sufficient (Authentication is necessary but not sufficient). The system should still respect feature- and data-level boundaries within authenticated use (The system should still respect feature- and data-level boundaries within authenticated use).

---

## 3. Backend Application Zone (Vùng Ứng Dụng Backend)

### Who this includes
- server-side route handlers (server-side route handlers)
- internal product logic (internal product logic)
- trusted backend execution paths (trusted backend execution paths)

### What this zone can do (Vùng này can do gì)
- resolve runtime behavior (resolve runtime behavior)
- access trusted configuration (access trusted configuration)
- call providers using server-side credentials (call providers using server-side credentials)
- write protected state when appropriate (write protected state when appropriate)
- mediate between UI requests and persistence/integration systems (mediate between UI requests and persistence/integration systems)

### Why it matters (Tại sao điều này quan trọng)
The backend application layer is a trust boundary because it has more authority than a public client (The backend application layer is a trust boundary because it has more authority than a public client). It should not simply mirror client requests blindly (It should not simply mirror client requests blindly).

---

## 4. Automation / Cron Zone (Vùng Tự Động Hóa / Cron)

### Who this includes
- scheduled jobs (scheduled jobs)
- background automation flows (background automation flows)
- task runners hitting internal API routes (task runners hitting internal API routes)

### What this zone can do
- run maintenance/update workflows (run maintenance/update workflows)
- perform scheduled integration behavior (perform scheduled integration behavior)
- access privileged automation routes where explicitly intended (access privileged automation routes where explicitly intended)

### Why this matters (Tại sao điều này quan trọng)
Automation routes are often public in transport terms (they must be reachable), but they are not "public" in the normal user-trust sense (Automation routes are often public in transport terms (they must be reachable), but they are not "public" in the normal user-trust sense).

They require (Chúng require):
- narrow scope (narrow scope)
- strong verification (strong verification)
- clear operational intent (clear operational intent)

### Key risk (Key risk / Rủi ro chính)
A route being externally reachable for cron/webhook reasons does not mean it should behave like an ordinary public endpoint (Một route being externally reachable for cron/webhook reasons does not mean it should behave like an ordinary public endpoint).

---

## 5. Integration / Webhook Zone (Vùng Tích Hợp / Webhook)

### Who this includes
- Slack callbacks (Slack callbacks)
- Telegram webhooks (Telegram webhooks)
- external providers or platform callbacks (external providers or platform callbacks)
- other third-party event sources (other third-party event sources)

### What this zone should be trusted for (Vùng này should be trusted for)
- only the specific behavior validated for that integration (only the specific behavior validated for that integration)

### What it should not be trusted for by default (What it should not be trusted for by default / Những gì không nên trusted by default)
- arbitrary product actions (arbitrary product actions)
- unrestricted internal state mutation (unrestricted internal state mutation)
- broad authenticated-user equivalence (broad authenticated-user equivalence)

### Why this matters (Tại sao điều này quan trọng)
External callbacks may be legitimate but still untrusted until validated through (External callbacks may be legitimate but still untrusted until validated through):
- signing secrets (signing secrets)
- verification tokens (verification tokens)
- route-specific checks (route-specific checks)
- payload validation (payload validation)

---

## 6. Data / Persistence Zone (Vùng Dữ Liệu / Persistence)

### Who this includes
- database-backed product state (database-backed product state)
- structured persistence systems (structured persistence systems)
- schema-backed application behavior (schema-backed application behavior)

### Trust boundary function (Trust boundary function / Chức năng ranh giới niềm tin)
The persistence layer should distinguish between (The persistence layer should distinguish between):
- public-readable data (public-readable data)
- authenticated user data (authenticated user data)
- internal system state (internal system state)
- automation-only or admin-only mutation paths (automation-only or admin-only mutation paths)

### Why this matters (Tại sao điều này quan trọng)
A database row existing does not imply every app surface should be allowed to read or mutate it (A database row existing does not imply every app surface should be allowed to read or mutate it).

This is especially important when product architecture evolves faster than policy clarity (This is especially important when product architecture evolves faster than policy clarity).

---

## 7. Scoping Model: Users, Workspaces, Documents, and Retrieval (Mô Hình Scoping: Users, Workspaces, Documents, and Retrieval)

Many failures that look like "AI bugs" are actually scoping or trust-boundary bugs (Many failures that look like "AI bugs" are actually scoping or trust-boundary bugs).

The most important scoping layers are (The most important scoping layers are):

### User Boundary (Ranh Giới Người Dùng)
A missing workspace does not mean missing scope (A missing workspace does not mean missing scope).
Personal documents and personal conversations still belong to a user boundary and must never be treated as globally unscoped (Personal documents and personal conversations still belong to a user boundary and must never be treated as globally unscoped).

### Workspace Boundary (Ranh Giới Workspace)
When a workspace exists, it is the primary collaborative/project scope for (When a workspace exists, it is the primary collaborative/project scope for):
- documents (documents)
- conversations (conversations)
- retrieval (retrieval)
- memory/context assembly (memory/context assembly)

A document attached to Workspace A should not silently influence Workspace B (A document attached to Workspace A should not silently influence Workspace B).

### Document Boundary (Ranh Giới Tài Liệu)
Documents are first-class scoped objects, not just transient chat attachments (Documents are first-class scoped objects, not just transient chat attachments).
A document may be (A document may be):
- personal (personal)
- workspace-scoped (workspace-scoped)
- warm (warm)
- compressing (compressing)
- cold (cold)

Chat should reference document identity or retrieved chunks, not repeatedly transport raw document bodies (Chat should reference document identity or retrieved chunks, not repeatedly transport raw document bodies).

### Retrieval Boundary (Ranh Giới Retrieval / Truy Xuất)
Retrieval requests should use the narrowest relevant scope available (Retrieval requests should use the narrowest relevant scope available).
Preferred scope anchors are (Preferred scope anchors are):
1. explicit document IDs (explicit document IDs)
2. workspace ID when present (workspace ID when present)
3. user ownership when workspace is absent (user ownership when workspace is absent)

Two failure modes matter here (Two failure modes matter here):
- **over-scoping**: valid context is skipped because a scope field is absent (valid context is skipped because a scope field is absent)
- **under-scoping**: unrelated documents leak into results because scope is too broad (unrelated documents leak into results because scope is too broad)

### Preview Boundary (Ranh Giới Preview)
Preview is a direct document read/hydration path, not the same thing as retrieval (Preview is a direct document read/hydration path, not the same thing as retrieval).
Preview should validate (Preview should validate):
- auth (auth)
- document identity (document identity)
- user/workspace access rights (user/workspace access rights)

A preview route should not require a workspace if the document is legitimately personal (A preview route should not require a workspace if the document is legitimately personal).

### Runtime/Provider Boundary (Ranh Giới Runtime/Provider)
Infrastructure or provider differences must not silently change the meaning of user/workspace/document scope (Infrastructure or provider differences must not silently change the meaning of user/workspace/document scope).
Whether Lattice runs with different models, storage, or retrieval backends, scoping semantics should stay stable (Whether Lattice runs with different models, storage, or retrieval backends, scoping semantics should stay stable).

---

## 8. Local Development / Operator Zone (Vùng Phát Triển Cục Bộ / Operator)

### Who this includes (Ai mà this includes)
- developers with local repo access (developers with local repo access)
- local scripts and tooling (local scripts and tooling)
- operator/debug surfaces (operator/debug surfaces)
- machine-local environment state (machine-local environment state)

### Why this matters (Tại sao điều này quan trọng)
Local access is highly privileged, but it is also one of the easiest places for truth confusion and accidental leakage to occur (Local access is highly privileged, but it is also one of the easiest places for truth confusion and accidental leakage to occur).

### Risks in this zone (Risks in this zone / Rủi ro trong vùng này)
- local drift mistaken for source truth (local drift mistaken for source truth)
- secrets/config mishandling (secrets/config mishandling)
- local-only fixes assumed to represent production behavior (local-only fixes assumed to represent production behavior)
- build or schema assumptions inferred from an unhealthy machine state (build or schema assumptions inferred from an unhealthy machine state)

This is a trust zone because operator actions often exceed normal application permissions dramatically (This is a trust zone because operator actions often exceed normal application permissions dramatically).

---

## 9. Terminal / Raw SSE + Local Sandbox Zone (Vùng Terminal / Raw SSE + Local Sandbox)

### Who this includes
- CLI clients and local shell loops (CLI clients and local shell loops)
- machine-local automation calling `/api/cli/stream` and `/api/memory/cli` (machine-local automation calling `/api/cli/stream` and `/api/memory/cli`)
- local approval-matrix behavior in `~/.lattice/settings` (local approval-matrix behavior in `~/.lattice/settings`)

### Why this matters (Tại sao điều này quan trọng)
This zone is technically remote-backed but authority is split between (This zone is technically remote-backed but authority is split between):
- the server stream API (the server stream API)
- local client trust decisions (local client trust decisions)
- user-gated execution in the shell loop (user-gated execution in the shell loop)

It is not public, and it is not equivalent to normal authenticated product usage (It is not public, and it is not equivalent to normal authenticated product usage).

### Rules in this zone (Rules in this zone / Quy tắc trong vùng này)
- `/api/cli/stream` and `/api/memory/cli` require bearer-token auth when `LATTICE_CLI_TOKEN` is configured (`/api/cli/stream` and `/api/memory/cli` require bearer-token auth when `LATTICE_CLI_TOKEN` is configured)
- local approval modes affect execution authority, not server trust (local approval modes affect execution authority, not server trust)
- bearer tokens must not be treated like anonymous or public credentials (bearer tokens must not be treated like anonymous or public credentials)
- proxy or transport layers must not expose these routes as public by omission (proxy or transport layers must not expose these routes as public by omission)

---

## Boundary Types (Các Loại Ranh Giới)

Trust boundaries in this system appear in multiple forms (Trust boundaries in this system appear in multiple forms).

## A. Route Boundary (Ranh Giới Tuyến Đường)
Whether a route is public, authenticated, or restricted (Whether a route is public, authenticated, or restricted).

## B. Data Boundary (Ranh Giới Dữ Liệu)
Whether a surface can read or mutate certain classes of state (Whether a surface can read or mutate certain classes of state).

## C. Execution Boundary (Ranh Giới Thực Thi)
Whether a caller can trigger high-authority logic (Whether a caller can trigger high-authority logic).

## D. Integration Boundary (Ranh Giới Tích Hợp)
Whether an external system is allowed to invoke a narrow callback or a broader action surface (Whether an external system is allowed to invoke a narrow callback or a broader action surface).

## E. Operational Boundary (Ranh Giới Vận Hành)
Whether a local or backend actor is being treated as a development/operator surface rather than a normal user surface (Whether a local or backend actor is being treated as a development/operator surface rather than a normal user surface).

---

## Public vs Protected Is Not the Whole Story (Public vs Protected Không Phải Là Cả Câu Chuyện)

One common mistake is to collapse all security thinking into a binary (One common mistake is to collapse all security thinking into a binary):
- public (public)
- authenticated (authenticated)

That is not enough for this platform (That is not enough for this platform).

For example (For example):
- a cron route may be transport-public but operationally privileged (a cron route may be transport-public but operationally privileged)
- a signed-in user is authenticated but should not automatically gain admin-like power (a signed-in user is authenticated but should not automatically gain admin-like power)
- a webhook endpoint may be reachable but only valid for one narrow integration behavior (a webhook endpoint may be reachable but only valid for one narrow integration behavior)

Trust boundaries must reflect these distinctions (Trust boundaries must reflect these distinctions).

---

## Examples of Boundary Discipline in Practice (Các Ví Dụ Về Kỷ Luật Ranh Giới Trong Thực Tế)

## Example 1 — Public Docs Route (Example 1 — Public Docs Route)
A docs route may be public in UI intent, but unless the auth gate treats it as public, unauthenticated users get bounced (A docs route may be public in UI intent, but unless the auth gate treats it as public, unauthenticated users get bounced).

### Lesson (Bài Học)
Public-route intent must match actual route gating (Public-route intent must match actual route gating).

---

## Example 2 — Authenticated Product APIs (Example 2 — Authenticated Product APIs)
A signed-in user can use product APIs, but that does not mean the server should accept every client claim as authoritative (A signed-in user can use product APIs, but that does not mean the server should accept every client claim as authoritative).

### Lesson
The backend must still resolve real behavior using trusted context (The backend must still resolve real behavior using trusted context).

---

## Example 3 — Cron or Webhook Routes (Example 3 — Cron or Webhook Routes)
A route can be externally callable while still belonging to a privileged automation boundary (A route can be externally callable while still belonging to a privileged automation boundary).

### Lesson
Reachability is not the same thing as broad trust (Reachability is not the same thing as broad trust).

---

## Example 4 — Database Schema Presence (Example 4 — Database Schema Presence)
A table existing in the repository or local database does not mean the production system should assume it exists everywhere or that every caller should be allowed to use it (A table existing in the repository or local database does not mean the production system should assume it exists everywhere or that every caller should be allowed to use it).

### Lesson
Schema truth and access policy are separate concerns (Schema truth and access policy are separate concerns).

---

## Common Boundary Failures to Avoid (Các Chế Độ Thất Bại Ranh Giới Phổ Biến Cần Tránh)

## 1. UI Intent Without Backend Enforcement (UI Intent Without Backend Enforcement)
A page looks public but is still protected by middleware (A page looks public but is still protected by middleware).

## 2. Client Assertions Treated as Trusted Truth (Client Assertions Treated as Trusted Truth)
The frontend claims a mode, state, or decision that the backend should really resolve itself (The frontend claims a mode, state, or decision that the backend should really resolve itself).

## 3. Overbroad Callback Trust (Overbroad Callback Trust)
An integration/webhook route accepts more authority than its narrow purpose requires (An integration/webhook route accepts more authority than its narrow purpose requires).

## 4. Authenticated Equals Admin Drift (Authenticated Equals Admin Drift)
Signed-in users are treated as if they should automatically access internal or privileged logic (Signed-in users are treated as if they should automatically access internal or privileged logic).

## 5. Local Operator Confusion (Local Operator Confusion)
Local environment behavior is mistaken for production reality or canonical architecture (Local environment behavior is mistaken for production reality or canonical architecture).

---

## Boundary Review Checklist (Danh Sách Kiểm Tra Ranh Giới)

When adding a new route, feature, or integration, ask (Khi adding a new route, feature, or integration, ask):

1. Which trust zone is the caller in? (Which trust zone is the caller in?)
2. What is the minimum authority this surface needs? (What is the minimum authority this surface needs?)
3. What state is readable from this path? (What state is readable from this path?)
4. What state is writable from this path? (What state is writable from this path?)
5. What assumptions is the backend making about the caller? (What assumptions is the backend making about the caller?)
6. Is this a public route, authenticated route, privileged backend route, or narrow integration route? (Is this a public route, authenticated route, privileged backend route, or narrow integration route?)
7. If the route is externally reachable, is it still tightly bounded in behavior? (If the route is externally reachable, is it still tightly bounded in behavior?)

---

## Relationship to Other Docs (Mối Quan Hệ Với Các Tài Liệu Khác)

This document should be read alongside (Tài liệu này nên được đọc cùng với):
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- future API and trust/reference documentation

Public route documentation explains **visibility** (Public route documentation explains **visibility**).
This trust-boundary document explains **authority** (This trust-boundary document explains **authority**).

---

## Summary (Tóm Tắt)

The most important security idea for this codebase is this (The most important security idea for this codebase is this):

**Do not treat all reachable surfaces, authenticated users, or external callbacks as equally trusted.** (Do not treat all reachable surfaces, authenticated users, or external callbacks as equally trusted.)

Genie AI is a multi-surface platform, and its security depends on keeping those surfaces legible, narrow, and appropriately bounded (Genie AI is a multi-surface platform, and its security depends on keeping those surfaces legible, narrow, and appropriately bounded).