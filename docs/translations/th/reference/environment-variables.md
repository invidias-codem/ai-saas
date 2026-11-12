# Environment Variables (ตัวแปรสภาพแวดล้อม)

## Purpose (วัตถุประสงค์)

This document describes the major environment variables used by Lattice OS / `ai-saas` (เอกสารนี้อธิบาย major environment variables ที่ใช้โดย Lattice OS / `ai-saas`)

It is intended to make the platform more transparent for (มีจุดประสงค์ทำให้ platform transparent มากขึ้นสำหรับ):
- developers (นักพัฒนา)
- operators (ผู้ดำเนินการ)
- reviewers (ผู้ตรวจสอบ)
- future maintainers (future maintainers)

This is not a secrets dump (นี่ไม่ใช่ secrets dump) It is a reference for what each variable is for, which surface uses it, and whether it is intended for public/browser exposure or server-side use only (เป็น reference สำหรับแต่ละ variable ว่าสำหรับอะไร surface ไหนใช้ และว่าจะสำหรับ public/browser exposure หรือ server-side use only)

---

## Important Principle (หลักการสำคัญ)

Environment variables fall into two broad classes (Environment variables แบ่งเป็นสอง broad classes):

### Public variables (ตัวแปรสาธารณะ)
Variables prefixed with `NEXT_PUBLIC_` are expected to be exposed to browser-side code (Variables ที่ prefix ด้วย `NEXT_PUBLIC_` คาดว่า exposed to browser-side code) They must not contain secrets (ต้องไม่ contain secrets)

### Server-only variables (ตัวแปร server-only)
Non-`NEXT_PUBLIC_` variables should be treated as server-side only unless explicitly documented otherwise (Non-`NEXT_PUBLIC_` variables ควร treated as server-side only เว้นแต่ explicitly documented otherwise) They may carry credentials, tokens, or privileged configuration (อาจ carry credentials, tokens, หรือ privileged configuration)

---

## Source of Truth Note (หมายเหตุ Source of Truth)

The most explicit typed environment schema in the current codebase is (Explicit typed environment schema ที่ชัดเจนที่สุดใน current codebase คือ):
- `lib/env.ts`

This document should track that schema, but the live deployment environment must still be verified separately when debugging real runtime issues (เอกสารนี้ควร track schema นั้น แต่ live deployment environment ต้อง verified separately เมื่อ debugging real runtime issues)

---

## Deployment Mode Guidance (คำแนะนำ Deployment Mode)

Lattice should be configured in a mode-aware way rather than requiring every optional subsystem in every installation (Lattice ควร configured in a mode-aware way แทนที่จะ requiring every optional subsystem ในทุก installation)

Operationally, configuration falls into these broad classes (การดำเนินการ configuration ตกใน broad classes นี้):
- **core required**: values needed for any serious deployment (values ที่ต้องการสำหรับ serious deployment ใดๆ)
- **mode-specific required**: values required only for certain deployment modes (values ที่ต้องการเฉพาะ certain deployment modes)
- **optional feature config**: values that enable advanced or optional capabilities (values ที่ enable advanced หรือ optional capabilities)

For the initial self-hosted story, the baseline should remain centered on (สำหรับ initial self-hosted story baseline ควร centered on):
- **Mode A — Standard Internal Deployment**

That means a standard business install should prioritize configuration for (นั่นหมายถึง standard business install ควร prioritize configuration สำหรับ):
- app/runtime
- authentication
- database
- storage
- at least one supported reasoning provider (อย่างน้อยหนึ่ง supported reasoning provider)
- at least one supported embedding provider (อย่างน้อยหนึ่ง supported embedding provider)

It should not require every optional subsystem (social agents, GPU archival, advanced local retrieval, etc.) unless those capabilities are intentionally enabled (ไม่ควร require every optional subsystem (social agents, GPU archival, advanced local retrieval, etc.) เว้นแต่ those capabilities enabled อย่างเจตนา)

---

## Authentication / Clerk

## `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
### Type (ประเภท)
- Public (สาธารณะ)

### Purpose (วัตถุประสงค์)
Browser-safe Clerk publishable key used to initialize client-side auth flows (Browser-safe Clerk publishable key ใช้ initialize client-side auth flows)

### Used for (ใช้สำหรับ)
- frontend auth integration
- sign-in/sign-up UX

---

## `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
### Type
- Public

### Purpose
Optional explicit sign-in route configuration for Clerk (Optional explicit sign-in route configuration สำหรับ Clerk)

---

## `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
### Type
- Public

### Purpose
Optional explicit sign-up route configuration for Clerk (Optional explicit sign-up route configuration สำหรับ Clerk)

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
### Type
- Public

### Purpose
Optional post-sign-in redirect target (Optional post-sign-in redirect target)

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL`
### Type
- Public

### Purpose
Optional post-sign-out redirect target (Optional post-sign-out redirect target)

---

## `CLERK_SECRET_KEY`
### Type
- Server-only

### Purpose
Server-side Clerk secret used for privileged auth operations (Server-side Clerk secret ใช้สำหรับ privileged auth operations)

### Security note (หมายเหตุความปลอดภัย)
Must never be treated as browser-safe (ต้องไม่ถูก treated as browser-safe)

---

## `CLERK_WEBHOOK_SECRET`
### Type
- Server-only

### Purpose
Validates Clerk webhook calls (Validates Clerk webhook calls)

### Security note
Relevant to trust boundaries for webhook routes (เกี่ยวข้องกับ trust boundaries สำหรับ webhook routes)

---

## AI / Model Provider Variables (ตัวแปร AI / Model Provider)

## `GOOGLE_API_KEY`
### Type
- Server-only

### Purpose
API key for Google-based AI provider access (API key สำหรับ Google-based AI provider access)

### Used for
- model/provider interactions where the Google API surface is active

---

## `GOOGLE_PROJECT_ID`
### Type
- Server-only

### Purpose
Google Cloud project identifier (Google Cloud project identifier)

### Used for
- Google Cloud / Vertex-style services where applicable

---

## `GOOGLE_LOCATION`
### Type
- Server-only configuration

### Purpose
Google region/location configuration (Google region/location configuration)

### Default in schema (Default ใน schema)
- `us-central1`

---

## `GCP_SERVICE_ACCOUNT_KEY_JSON`
### Type
- Server-only secret

### Purpose
Raw service-account JSON used for privileged Google Cloud API access (Raw service-account JSON ใช้สำหรับ privileged Google Cloud API access)

### Security note
Highly sensitive (Hypersensitive) Should be treated as a secret-bearing server credential (ควร treated as a secret-bearing server credential)

---

## `REPLICATE_API_TOKEN`
### Type
- Server-only

### Purpose
Replicate provider token for model-backed generation paths (Replicate provider token สำหรับ model-backed generation paths)

---

## `REPLICATE_API_TOKEN_MUSIC`
### Type
- Server-only

### Purpose
Replicate token/configuration path for music-related generation flows (Replicate token/configuration path สำหรับ music-related generation flows)

---

## `REPLICATE_API_TOKEN_VIDEO`
### Type
- Server-only

### Purpose
Replicate token/configuration path for video-related generation flows (Replicate token/configuration path สำหรับ video-related generation flows)

---

## RAG / Retrieval / Memory Variables

## `NEXT_PUBLIC_RAG_ENABLED`
### Type
- Public configuration flag

### Purpose
Controls whether RAG/memory-related behavior is considered enabled at the client-facing config layer (Controls ว่า RAG/memory-related behavior considered enabled ที่ client-facing config layer)

### Default in schema
- `true`

### Note
Public configuration flags are not security boundaries (Public configuration flags ไม่ใช่ security boundaries) They should not be treated as proof that a backend feature is safe or unsafe (ไม่ควร treated as proof ว่า backend feature safe หรือ unsafe)

---

## `RAG_CLOUD_FUNCTION_URL`
### Type
- Server-side configuration

### Purpose
Endpoint/configuration surface for cloud-function-backed RAG behavior (Endpoint/configuration surface สำหรับ cloud-function-backed RAG behavior)

---

## `RAG_MEMORY_RETENTION_DAYS`
### Type
- Server-side configuration

### Purpose
Retention-window configuration for memory-related behavior (Retention-window configuration สำหรับ memory-related behavior)

### Default in schema
- `90`

---

## `RAG_RETRIEVAL_LIMIT`
### Type
- Server-side configuration

### Purpose
Controls retrieval count/limit for RAG-related context retrieval (Controls retrieval count/limit สำหรับ RAG-related context retrieval)

### Default in schema
- `5`

---

## `RAG_SIMILARITY_THRESHOLD`
### Type
- Server-side configuration

### Purpose
Controls similarity threshold for retrieval logic (Controls similarity threshold สำหรับ retrieval logic)

### Default in schema
- `0.6`

---

## Supabase / Persistence Variables

## `NEXT_PUBLIC_SUPABASE_URL`
### Type
- Public

### Purpose
Browser-safe Supabase project URL used by client-side or shared runtime integration (Browser-safe Supabase project URL ใช้โดย client-side หรือ shared runtime integration)

---

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`
### Type
- Public

### Purpose
Browser-safe Supabase anon key for permitted client-side access patterns (Browser-safe Supabase anon key สำหรับ permitted client-side access patterns)

### Security note
Public does not mean unrestricted (Public ไม่ได้หมายถึง unrestricted) Backend/database policies must still enforce real access boundaries (Backend/database policies ต้องยัง enforce real access boundaries)

---

## `SUPABASE_SERVICE_ROLE_KEY`
### Type
- Server-only secret

### Purpose
Privileged Supabase service-role credential (Privileged Supabase service-role credential)

### Security note
Must never be exposed to browser-side code (ต้องไม่ exposed to browser-side code) This is one of the highest-sensitivity application credentials (นี่คือหนึ่งใน highest-sensitivity application credentials)

---

## Slack Integration Variables

## `SLACK_BOT_TOKEN`
### Type
- Server-only secret

### Purpose
Slack bot token for server-side Slack integration behavior (Slack bot token สำหรับ server-side Slack integration behavior)

---

## `SLACK_SIGNING_SECRET`
### Type
- Server-only secret

### Purpose
Validates Slack callback/event authenticity (Validates Slack callback/event authenticity)

---

## `SLACK_APP_ID`
### Type
- Server-side configuration

### Purpose
Slack application identifier (Slack application identifier)

---

## `SLACK_CLIENT_ID`
### Type
- Server-side configuration

### Purpose
Slack OAuth client id for backend integration flow (Slack OAuth client id สำหรับ backend integration flow)

---

## `SLACK_CLIENT_SECRET`
### Type
- Server-only secret

### Purpose
Slack OAuth client secret (Slack OAuth client secret)

---

## `NEXT_PUBLIC_SLACK_CLIENT_ID`
### Type
- Public

### Purpose
Client-facing Slack integration support, such as Add to Slack flows (Client-facing Slack integration support, เช่น Add to Slack flows)

---

## Zapier Integration Variables

## `ZAPIER_CLIENT_ID`
### Type
- Server-side configuration

### Purpose
Zapier integration client identifier (Zapier integration client identifier)

---

## `ZAPIER_CLIENT_SECRET`
### Type
- Server-only secret

### Purpose
Zapier integration secret (Zapier integration secret)

---

## `ZAPIER_API_KEY`
### Type
- Server-only secret/configuration

### Purpose
Zapier integration API access (Zapier integration API access)

---

## GitHub / Agent / Internal Automation Variables

## `GITHUB_AGENT_TOKEN`
### Type
- Server-only secret

### Purpose
GitHub token for autonomous or assisted internal agent flows, such as repo automation (GitHub token สำหรับ autonomous หรือ assisted internal agent flows, เช่น repo automation)

---

## `GITHUB_REPO_OWNER`
### Type
- Server-side configuration

### Purpose
Default GitHub repo owner context for internal automation (Default GitHub repo owner context สำหรับ internal automation)

---

## `GITHUB_REPO_NAME`
### Type
- Server-side configuration

### Purpose
Default GitHub repo name context for internal automation (Default GitHub repo name context สำหรับ internal automation)

---

## `GITHUB_DEFAULT_BRANCH`
### Type
- Server-side configuration

### Purpose
Default branch name used by internal GitHub automation flows (Default branch name ใช้โดย internal GitHub automation flows)

### Default in schema
- `main`

---

## Webhooks / Cron / Internal Job Variables

## `VERCEL_LOG_WEBHOOK_SECRET`
### Type
- Server-only secret

### Purpose
Protects Vercel log webhook handling (Protects Vercel log webhook handling)

---

## `CRON_SECRET`
### Type
- Server-only secret

### Purpose
Authenticates cron-triggered route execution where secret-gated scheduling is required (Authenticates cron-triggered route execution ที่ secret-gated scheduling required)

### Security note
This is especially important because some cron routes may be externally reachable but should not behave as ordinary public endpoints (นี่สำคัญอย่างยิ่งเพราะ some cron routes อาจ externally reachable แต่ shouldn't behave as ordinary public endpoints)

---

## General Usage Guidance (คำแนะนำการใช้งานทั่วไป)

## Use `NEXT_PUBLIC_` only when necessary
Anything prefixed `NEXT_PUBLIC_` should be assumed visible to client-side code (อะไรที่ prefix `NEXT_PUBLIC_` ควร assumed visible to client-side code)

## Prefer typed access through `lib/env.ts`
The typed schema helps document intent and catches missing values more clearly than scattered raw `process.env` access (Typed schema ช่วย document intent และ catches missing values ชัดเจนกว่า scattered raw `process.env` access)

## Do not confuse presence with correctness
A variable existing in a local `.env` file does not prove (Variable ที่ exist ใน local `.env` file ไม่ prove):
- production has it (production มีมัน)
- the value is correct (value ถูกต้อง)
- the live system is using it as expected (live system ใช้มัน like expected)

Environment configuration still has to be verified against the actual deployment truth surface (Environment configuration ยังต้อง verified against actual deployment truth surface)

---

## Security Guidance (คำแนะนำความปลอดภัย)

The most sensitive variables in this set include (Sensitive variables มากที่สุดใน set นี้รวมถึง):
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

These should never be exposed in client-side code, screenshots, public logs, or committed plaintext config (เหล่านี้ไม่ควร exposed ใน client-side code, screenshots, public logs, หรือ committed plaintext config)

---

## Related Docs (เอกสารเกี่ยวข้อง)

This document should be read alongside (เอกสารนี้ควรอ่านควบคู่กับ):
- `docs/reference/api-reference.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- future deployment/ops configuration docs

---

## Follow-Up Improvement (การปรับปรุง Follow-Up)

A future improvement to this reference would be adding (Future improvement สำหรับ reference นี้ควร adding):
- variable → file/feature mapping
- required/optional by environment (local, preview, production)
- setup examples for non-secret local development