# Biến Môi Trường (Environment Variables)

## Mục Đích (Purpose)

Tài liệu này mô tả (describes) các major environment variables (biến môi trường chính) được sử dụng bởi Lattice OS / `ai-saas`.

Nó intended to make the platform more transparent for (nó nhằm mục đích làm cho platform transparent hơn cho):
- developers (nhà phát triển)
- operators (người vận hành)
- reviewers (người xem xét)
- future maintainers (người bảo trì tương lai)

This is not a secrets dump (Đây không phải là secrets dump). It is a reference for what each variable is for, which surface uses it, and whether it is intended for public/browser exposure or server-side use only (Đây là reference cho xem mỗi variable dùng cho gì, surface nào sử dụng nó, và có intended cho public/browser exposure hay server-side use only).

---

## Important Principle (Nguyên Tắc Quan Trọng)

Environment variables fall into two broad classes (Environment variables rơi vào hai broad classes):

### Public variables (Biến công khai)
Variables prefixed with `NEXT_PUBLIC_` are expected to be exposed to browser-side code (Variables có prefix `NEXT_PUBLIC_` được expected exposed to browser-side code). They must not contain secrets (Chúng không được contain secrets).

### Server-only variables (Biến chỉ dành cho Server)
Non-`NEXT_PUBLIC_` variables should be treated as server-side only unless explicitly documented otherwise (Non-`NEXT_PUBLIC_` variables nên được treated as server-side only trừ khi explicitly documented otherwise). They may carry credentials, tokens, or privileged configuration (Chúng có thể carry credentials, tokens, hoặc privileged configuration).

---

## Source of Truth Note (Ghi Chú Nguồn Sự Thật)

The most explicit typed environment schema in the current codebase is (Explicit typed environment schema rõ ràng nhất trong current codebase là):
- `lib/env.ts`

This document should track that schema, but the live deployment environment must still be verified separately when debugging real runtime issues (Tài liệu này nên track schema đó, nhưng live deployment environment vẫn phải verified separately khi debugging real runtime issues).

---

## Deployment Mode Guidance (Hướng Dẫn Chế Độ Triển Khai)

Lattice should be configured in a mode-aware way rather than requiring every optional subsystem in every installation (Lattice nên được configured in a mode-aware way thay vì requiring every optional subsystem trong mọi installation).

Operationally, configuration falls into these broad classes (Vận hành, configuration rơi vào các broad classes này):
- **core required**: values needed for any serious deployment (values cần cho any serious deployment)
- **mode-specific required**: values required only for certain deployment modes (values chỉ cần cho certain deployment modes)
- **optional feature config**: values that enable advanced or optional capabilities (values enable advanced hoặc optional capabilities)

For the initial self-hosted story, the baseline should remain centered on (Cho initial self-hosted story, baseline nên remain centered on):
- **Mode A — Standard Internal Deployment**

That means a standard business install should prioritize configuration for (Điều đó nghĩa standard business install nên prioritize configuration cho):
- app/runtime
- authentication
- database
- storage
- at least one supported reasoning provider (ít nhất một supported reasoning provider)
- at least one supported embedding provider (ít nhất một supported embedding provider)

It should not require every optional subsystem (social agents, GPU archival, advanced local retrieval, etc.) unless those capabilities are intentionally enabled (Nó không nên require every optional subsystem (social agents, GPU archival, advanced local retrieval, etc.) trừ khi those capabilities intentionally enabled).

---

## Authentication / Clerk (Xác Thực / Clerk)

## `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
### Type (Loại)
- Public (Công khai)

### Purpose (Mục đích)
Browser-safe Clerk publishable key used to initialize client-side auth flows (Browser-safe Clerk publishable key dùng để initialize client-side auth flows).

### Used for (Được dùng cho)
- frontend auth integration
- sign-in/sign-up UX

---

## `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
### Type
- Public

### Purpose
Optional explicit sign-in route configuration for Clerk (Optional explicit sign-in route configuration cho Clerk).

---

## `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
### Type
- Public

### Purpose
Optional explicit sign-up route configuration for Clerk (Optional explicit sign-up route configuration cho Clerk).

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
### Type
- Public

### Purpose
Optional post-sign-in redirect target (Optional post-sign-in redirect target).

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL`
### Type
- Public

### Purpose
Optional post-sign-out redirect target (Optional post-sign-out redirect target).

---

## `CLERK_SECRET_KEY`
### Type
- Server-only (Chỉ Server)

### Purpose
Server-side Clerk secret used for privileged auth operations (Server-side Clerk secret dùng cho privileged auth operations).

### Security note (Ghi chú bảo mật)
Must never be treated as browser-safe (Không bao giờ được treated as browser-safe).

---

## `CLERK_WEBHOOK_SECRET`
### Type
- Server-only

### Purpose
Validates Clerk webhook calls (Validates Clerk webhook calls).

### Security note
Relevant to trust boundaries for webhook routes (Liên quan đến trust boundaries cho webhook routes).

---

## AI / Model Provider Variables (Các Biến Nhà Cung Cấp AI / Model)

## `GOOGLE_API_KEY`
### Type
- Server-only

### Purpose
API key for Google-based AI provider access (API key cho Google-based AI provider access).

### Used for
- model/provider interactions where the Google API surface is active

---

## `GOOGLE_PROJECT_ID`
### Type
- Server-only

### Purpose
Google Cloud project identifier (Định danh dự án Google Cloud).

### Used for
- Google Cloud / Vertex-style services where applicable

---

## `GOOGLE_LOCATION`
### Type
- Server-only configuration

### Purpose
Google region/location configuration (Cấu hình region/location Google).

### Default in schema (Mặc định trong schema)
- `us-central1`

---

## `GCP_SERVICE_ACCOUNT_KEY_JSON`
### Type
- Server-only secret

### Purpose
Raw service-account JSON used for privileged Google Cloud API access (Raw service-account JSON dùng cho privileged Google Cloud API access).

### Security note
Highly sensitive (Rất nhạy cảm). Should be treated as a secret-bearing server credential (Nên treated as a secret-bearing server credential).

---

## `REPLICATE_API_TOKEN`
### Type
- Server-only

### Purpose
Replicate provider token for model-backed generation paths (Replicate provider token cho model-backed generation paths).

---

## `REPLICATE_API_TOKEN_MUSIC`
### Type
- Server-only

### Purpose
Replicate token/configuration path for music-related generation flows (Replicate token/configuration path cho music-related generation flows).

---

## `REPLICATE_API_TOKEN_VIDEO`
### Type
- Server-only

### Purpose
Replicate token/configuration path for video-related generation flows (Replicate token/configuration path cho video-related generation flows).

---

## RAG / Retrieval / Memory Variables (Các Biến RAG / Retrieval / Memory)

## `NEXT_PUBLIC_RAG_ENABLED`
### Type
- Public configuration flag (Cờ cấu hình công khai)

### Purpose
Controls whether RAG/memory-related behavior is considered enabled at the client-facing config layer (Controls xem RAG/memory-related behavior có considered enabled ở client-facing config layer không).

### Default in schema (Mặc định trong schema)
- `true`

### Note
Public configuration flags are not security boundaries (Public configuration flags không phải security boundaries). They should not be treated as proof that a backend feature is safe or unsafe (Chúng không nên treated as proof rằng backend feature safe hoặc unsafe).

---

## `RAG_CLOUD_FUNCTION_URL`
### Type
- Server-side configuration

### Purpose
Endpoint/configuration surface for cloud-function-backed RAG behavior (Endpoint/configuration surface cho cloud-function-backed RAG behavior).

---

## `RAG_MEMORY_RETENTION_DAYS`
### Type
- Server-side configuration

### Purpose
Retention-window configuration for memory-related behavior (Cấu hình cửa sổ retention cho memory-related behavior).

### Default in schema
- `90`

---

## `RAG_RETRIEVAL_LIMIT`
### Type
- Server-side configuration

### Purpose
Controls retrieval count/limit for RAG-related context retrieval (Controls retrieval count/limit cho RAG-related context retrieval).

### Default in schema
- `5`

---

## `RAG_SIMILARITY_THRESHOLD`
### Type
- Server-side configuration

### Purpose
Controls similarity threshold for retrieval logic (Controls similarity threshold cho retrieval logic).

### Default in schema
- `0.6`

---

## Supabase / Persistence Variables (Các Biến Supabase / Persistence)

## `NEXT_PUBLIC_SUPABASE_URL`
### Type
- Public

### Purpose
Browser-safe Supabase project URL used by client-side or shared runtime integration (Browser-safe Supabase project URL dùng bởi client-side hoặc shared runtime integration).

---

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`
### Type
- Public

### Purpose
Browser-safe Supabase anon key for permitted client-side access patterns (Browser-safe Supabase anon key cho permitted client-side access patterns).

### Security note
Public does not mean unrestricted (Public không có nghĩa unrestricted). Backend/database policies must still enforce real access boundaries (Backend/database policies vẫn phải enforce real access boundaries).

---

## `SUPABASE_SERVICE_ROLE_KEY`
### Type
- Server-only secret

### Purpose
Privileged Supabase service-role credential (Credential Supabase service-role đặc quyền).

### Security note
Must never be exposed to browser-side code (Không bao giờ được exposed to browser-side code). This is one of the highest-sensitivity application credentials (Đây là một trong highest-sensitivity application credentials).

---

## Slack Integration Variables (Các Biến Tích Hợp Slack)

## `SLACK_BOT_TOKEN`
### Type
- Server-only secret

### Purpose
Slack bot token for server-side Slack integration behavior (Slack bot token cho server-side Slack integration behavior).

---

## `SLACK_SIGNING_SECRET`
### Type
- Server-only secret

### Purpose
Validates Slack callback/event authenticity (Validates Slack callback/event authenticity).

---

## `SLACK_APP_ID`
### Type
- Server-side configuration

### Purpose
Slack application identifier (Định danh ứng dụng Slack).

---

## `SLACK_CLIENT_ID`
### Type
- Server-side configuration

### Purpose
Slack OAuth client id for backend integration flow (Slack OAuth client id cho backend integration flow).

---

## `SLACK_CLIENT_SECRET`
### Type
- Server-only secret

### Purpose
Slack OAuth client secret (Slack OAuth client secret).

---

## `NEXT_PUBLIC_SLACK_CLIENT_ID`
### Type
- Public

### Purpose
Client-facing Slack integration support, such as Add to Slack flows (Client-facing Slack integration support, như Add to Slack flows).

---

## Zapier Integration Variables (Các Biến Tích Hợp Zapier)

## `ZAPIER_CLIENT_ID`
### Type
- Server-side configuration

### Purpose
Zapier integration client identifier (Zapier integration client identifier).

---

## `ZAPIER_CLIENT_SECRET`
### Type
- Server-only secret

### Purpose
Zapier integration secret (Zapier integration secret).

---

## `ZAPIER_API_KEY`
### Type
- Server-only secret/configuration

### Purpose
Zapier integration API access (Zapier integration API access).

---

## GitHub / Agent / Internal Automation Variables (Các Biến GitHub / Agent / Tự Động Hóa Nội Bộ)

## `GITHUB_AGENT_TOKEN`
### Type
- Server-only secret

### Purpose
GitHub token for autonomous or assisted internal agent flows, such as repo automation (GitHub token cho autonomous hoặc assisted internal agent flows, như repo automation).

---

## `GITHUB_REPO_OWNER`
### Type
- Server-side configuration

### Purpose
Default GitHub repo owner context for internal automation (Default GitHub repo owner context cho internal automation).

---

## `GITHUB_REPO_NAME`
### Type
- Server-side configuration

### Purpose
Default GitHub repo name context for internal automation (Default GitHub repo name context cho internal automation).

---

## `GITHUB_DEFAULT_BRANCH`
### Type
- Server-side configuration

### Purpose
Default branch name used by internal GitHub automation flows (Default branch name dùng bởi internal GitHub automation flows).

### Default in schema
- `main`

---

## Webhooks / Cron / Internal Job Variables (Các Biến Webhooks / Cron / Công Việc Nội Bộ)

## `VERCEL_LOG_WEBHOOK_SECRET`
### Type
- Server-only secret

### Purpose
Protects Vercel log webhook handling (Bảo vệ Vercel log webhook handling).

---

## `CRON_SECRET`
### Type
- Server-only secret

### Purpose
Authenticates cron-triggered route execution where secret-gated scheduling is required (Xác thực cron-triggered route execution nơi secret-gated scheduling required).

### Security note
This is especially important because some cron routes may be externally reachable but should not behave as ordinary public endpoints (Điều này đặc biệt quan trọng vì some cron routes có thể externally reachable nhưng không nên behave as ordinary public endpoints).

---

## General Usage Guidance (Hướng Dẫn Sử Dụng Chung)

## Use `NEXT_PUBLIC_` only when necessary
Anything prefixed `NEXT_PUBLIC_` should be assumed visible to client-side code (Bất cứ thứ gì prefix `NEXT_PUBLIC_` nên assumed visible to client-side code).

## Prefer typed access through `lib/env.ts`
The typed schema helps document intent and catches missing values more clearly than scattered raw `process.env` access (Typed schema giúp document intent và catches missing values rõ ràng hơn scattered raw `process.env` access).

## Do not confuse presence with correctness
A variable existing in a local `.env` file does not prove (Một variable exist trong local `.env` file không prove):
- production has it (production có nó)
- the value is correct (value đúng)
- the live system is using it as expected (live system dùng nó như expected)

Environment configuration still has to be verified against the actual deployment truth surface (Environment configuration vẫn phải verified against actual deployment truth surface).

---

## Security Guidance (Hướng Dẫn Bảo Mật)

The most sensitive variables in this set include (Các variable nhạy cảm nhất trong set này bao gồm):
- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`
- `GCP_SERVICE_ACCOUNT_KEY_JSON`
- `REPLICATE_API_TOKEN*`
- `GITHUB_AGENT_TOKEN`
- `CRON_SECRET`
- `VERCEL_LOG_WEBHOOK_SECRET`

These should never be exposed in client-side code, screenshots, public logs, or committed plaintext config (Những thứ này không bao giờ nên exposed trong client-side code, screenshots, public logs, hoặc committed plaintext config).

---

## Related Docs (Tài Liệu Liên Quan)

This document should be read alongside (Tài liệu này nên được đọc cùng với):
- `docs/reference/api-reference.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- future deployment/ops configuration docs

---

## Follow-Up Improvement (Cải Tiến Follow-Up)

A future improvement to this reference would be adding (Một future improvement cho reference này sẽ là adding):
- variable → file/feature mapping
- required/optional by environment (local, preview, production)
- setup examples for non-secret local development