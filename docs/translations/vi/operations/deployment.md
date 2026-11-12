# Triển Khai (Deployment)

## Mục Đích (Purpose)

Tài liệu này giải thích (explains) deployment model cho Genie AI / `ai-saas` at a practical operational level (ở practical operational level).

Nó intended to help developers and operators understand (có ý định giúp developers và operators hiểu):
- what deployment surfaces exist (deployment surfaces nào exist)
- how code moves from repository state to live runtime (code moves from repository state to live runtime như thế nào)
- what signals are trustworthy during deployment (signal nào trustworthy during deployment)
- where deployment can appear successful or unsuccessful in misleading ways (deployment có thể appear successful or unsuccessful in misleading ways)

Tài liệu này should be read together with (cวr được đọc cùng với):
- `docs/operations/truth-surfaces.md`
- `docs/security/public-routes.md`
- `docs/reference/environment-variables.md`

---

## Nguyên Tắc Cốt Lõi (Core Principle)

Deployment is not a single event (Deployment không phải là single event). It is a chain of related but distinct states (Nó là một chain of related but distinct states):

1. code state (code state)
2. build state (build state)
3. deploy automation state (deploy automation state)
4. platform runtime state (platform runtime state)
5. live application behavior (live application behavior)

A reliable deployment process treats those states explicitly rather than collapsing them into one vague "did it deploy?" question (A reliable deployment process treats those states explicitly rather than collapsing them into one vague "did it deploy?" question).

---

## Primary Deployment Surfaces (Các Bề Mặt Triển Khai Chính)

The codebase currently involves more than one deployment-related surface (Codebase hiện tại involves more than one deployment-related surface).

## 1. GitHub Repository State (Trạng Thái Repository GitHub)

### Role (Vai Trò)
- source-of-code truth (source-of-code truth)
- trigger source for CI and deployment workflows (trigger source for CI and deployment workflows)

### Questions it answers (Câu Hỏi Mà Nó Trả Lời)
- what commit is on `main`? (commit nào đang ở `main`?)
- what code was actually pushed? (code nào actually pushed?)
- what branch or merge introduced a change? (branch hoặc merge nào introduced a change?)

### Important note (Lưu Ý Quan Trọng)
A successful push is not proof of successful build or successful live behavior (Một successful push không phải là proof của successful build hoặc successful live behavior).

---

## 2. GitHub Actions / CI Workflows

### Role (Vai Trò)
- cloud build validation (cloud build validation)
- deployment workflow execution (deployment workflow execution)
- cron/scheduled operational workflows (cron/scheduled operational workflows)
- CodeQL / validation checks (CodeQL / validation checks)

### Typical uses in this repo (Các Cách Sử Dụng Thông Thường Trong Repo Này)
- production deploy validation (production deploy validation)
- Firebase hosting deployment workflow (Firebase hosting deployment workflow)
- Vercel-related deployment flow (Vercel-related deployment flow)
- scheduled jobs such as agent/cron workflows (scheduled jobs such as agent/cron workflows)

### Important note (Lưu Ý Quan Trọng)
CI/workflow success answers some questions, but not all (CI/workflow success trả lời một số questions, nhưng không phải all).

For example (For example / Ví dụ):
- build success does not automatically prove runtime correctness (build success không automatically prove runtime correctness)
- deploy action failure does not always prove live runtime is broken (deploy action failure không always prove live runtime is broken)

---

## 3. Vercel Runtime Surface (Bề Mặt Runtime Vercel)

### Role
- primary application hosting/runtime surface (primary application hosting/runtime surface)
- likely user-facing production application runtime for major web routes (likely user-facing production application runtime for major web routes)

### Questions it answers
- is the deployed app actually serving requests? (app đã deployed actually serving requests?)
- do public/authenticated routes behave correctly? (public/authenticated routes behave correctly?)
- does the runtime artifact behave as expected? (runtime artifact behave as expected?)

### Important note
Vercel action logs and live Vercel runtime behavior are related but not identical truth surfaces (Vercel action logs and live Vercel runtime behavior are related but not identical truth surfaces).

---

## 4. Firebase Hosting Surface (Bề Mặt Hosting Firebase)

### Role
- additional hosting/deployment surface present in repo workflows (additional hosting/deployment surface present in repo workflows)

### Questions it answers
- did the Firebase-hosted deployment path complete? (Firebase-hosted deployment path complete?)
- is the Firebase-facing artifact updated where applicable? (Firebase-facing artifact updated where applicable?)

### Important note
This should be treated as a distinct deployment/output surface rather than assumed to be interchangeable with Vercel runtime truth (Này should be treated as a distinct deployment/output surface rather than assumed to be interchangeable with Vercel runtime truth).

---

## Practical Deployment Flow (Luồng Triển Khai Thực Tế / Practical Deployment Flow)

At a high level, a typical deployment path looks like (At a high level, a typical deployment path looks like):

1. code is committed locally (code is committed locally)
2. code is pushed to GitHub (code is pushed to GitHub)
3. GitHub Actions workflows trigger (GitHub Actions workflows trigger)
4. build/deploy jobs run (build/deploy jobs run)
5. hosting surfaces update as appropriate (hosting surfaces update as appropriate)
6. live runtime behavior is verified directly (live runtime behavior is verified directly)

### Important point (Điểm Quan Trọng)
Step 6 is mandatory for user-visible bug fixes (Step 6 is mandatory for user-visible bug fixes).
A workflow result alone is not enough (A workflow result alone is not enough).

---

## Recommended Deployment Verification Flow (Luồng Xác Minh Triển Khai Được Khuyến Nghị)

When shipping a change, use this order of verification (Khi shipping a change, use this order of verification):

## 1. Confirm code state (Xác Nhận Trạng Thái Code)
Check (Kiểm Tra):
- intended commit exists on the intended branch (intended commit exists on the intended branch)
- the change was actually pushed (the change was actually pushed)

## 2. Confirm workflow/build state (Xác Nhận Trạng Thái Workflow/Build)
Check:
- build jobs ran (build jobs ran)
- deploy jobs ran (deploy jobs ran)
- no obvious workflow failure blocks artifact generation (no obvious workflow failure blocks artifact generation)

## 3. Confirm live route/runtime behavior (Xác Nhận Hành Vi Route/Runtime Trực Tiếp)
Check:
- relevant routes load correctly (relevant routes load correctly)
- auth/public behavior is correct (auth/public behavior is correct)
- the actual user-visible bug is resolved (the actual user-visible bug is resolved)

## 4. Confirm integration/schema behavior if relevant (Xác Nhận Hành Vi Integration/Schema If Relevant)
If the change depends on (If the change depends on):
- DB schema (DB schema)
- cron behavior (cron behavior)
- integration callback flow (integration callback flow)

then verify those truth surfaces as well (then verify those truth surfaces as well).

---

## Known Deployment Realities in This Repo (Các Thực Tế Triển Khai Đã Biết Trong Repo Này)

This codebase has already surfaced several important deployment realities (Codebase này has already surfaced several important deployment realities).

## A. Local build truth can be unreliable (Local build truth can be unreliable / Local build truth có thể unreliable)
Local production builds have been an unreliable truth surface under constrained machine conditions (Local production builds have been an unreliable truth surface under constrained machine conditions).

### Implication (Nัย Sáng Kết)
Cloud CI build validation often carries more weight for production viability (Cloud CI build validation often carries more weight for production viability).

---

## B. Workflow logs can be noisy or lossy (Workflow logs can be noisy or lossy / Workflow logs có thể noisy hoặc lossy)
A deployment workflow may report failure while the live runtime is not actually broken, or vice versa (A deployment workflow may report failure while the live runtime is not actually broken, or vice versa).

### Implication
Treat workflow logs as one important signal, not the final authority on runtime health (Đối xử workflow logs như one important signal, not the final authority on runtime health).

---

## C. Merge success is not runtime success (Merge success is not runtime success / Merge success không phải là runtime success)
A merge to `main` can still leave (A merge to `main` can still leave):
- deploy failures (deploy failures)
- runtime regressions (runtime regressions)
- missing schema application (missing schema application)
- public/protected route mismatches (public/protected route mismatches)

### Implication
Post-merge live verification is part of deployment, not optional cleanup (Post-merge live verification is part of deployment, not optional cleanup).

---

## D. Repo migrations are not live schema proof (Repo migrations are not live schema proof / Repo migrations không phải là live schema proof)
A code deployment can succeed while the live database is still missing required schema changes (A code deployment can succeed while the live database is still missing required schema changes).

### Implication
Schema truth must be verified separately for features that depend on DB changes (Schema truth must be verified separately for features that depend on DB changes).

---

## Route-Specific Deployment Verification (Xác Minh Triển Khai Cụ Thể Cho Route)

Different changes need different final verification checks (Different changes need different final verification checks).

## Public Route Changes (Public Route Changes / Thay Đổi Public Route)
Verify (Xác Minh):
- page renders for logged-out users (page renders for logged-out users)
- locale-prefixed versions behave correctly (locale-prefixed versions behave correctly)
- route does not bounce to sign-in unintentionally (route does not bounce to sign-in unintentionally)

## Authenticated Product Changes (Authenticated Product Changes / Thay Đổi Authenticated Product)
Verify:
- logged-in state works correctly (logged-in state works correctly)
- route-level data loads (route-level data loads)
- user navigation still behaves as expected (user navigation still behaves as expected)

## API Behavior Changes (API Behavior Changes / Thay Đổi Hành Vi API)
Verify:
- actual route response behavior (actual route response behavior)
- request/response contract alignment (request/response contract alignment)
- any relevant debug headers or backend indicators (any relevant debug headers or backend indicators)

## Cron/Automation Changes (Cron/Automation Changes / Thay Đổi Cron/Automation)
Verify:
- jobs actually complete (jobs actually complete)
- operational logs over time remain healthy (operational logs over time remain healthy)

## Terminal / Raw SSE Changes (Terminal / Raw SSE Changes / Thay Đổi Terminal / Raw SSE)
Verify:
- stream remains line-framed after proxy/CDN hops (stream remains line-framed after proxy/CDN hops)
- chunked transfer is preserved (chunked transfer is preserved)
- client recovers cleanly from timeout or dropped connection (client recovers cleanly from timeout or dropped connection)
- `/api/cli/stream` does not buffer or prematurely terminate idle connections (`/api/cli/stream` does not buffer or prematurely terminate idle connections)

---

## Environment Sensitivity (Độ Nhạy Của Môi Trường / Environment Sensitivity)

Deployment behavior can depend strongly on environment configuration (Deployment behavior can depend strongly on environment configuration).

### Areas to watch (Areas to watch / Các Khu Vực Cần Theo Dõi)
- auth configuration (auth configuration)
- provider secrets/tokens (provider secrets/tokens)
- Supabase credentials (Supabase credentials)
- webhook secrets (webhook secrets)
- cron secrets (cron secrets)
- provider-specific runtime config (provider-specific runtime config)

### Important note (Lưu Ý Quan Trọng)
A build can succeed even when runtime secrets/config are wrong or incomplete (A build can succeed even when runtime secrets/config are wrong or incomplete).

That is why deployment verification must include runtime behavior, not just build state (Đó là lý do deployment verification must include runtime behavior, not just build state).

---

## Common Deployment Failure Modes (Các Chế Độ Thất Bại Triển Khai Phổ Biến)

## 1. Build succeeds, runtime still wrong (Build succeeds, runtime still wrong)
Cause examples (Cause examples / Ví Dụ Nguyên Nhân):
- route gating mismatch (route gating mismatch)
- missing runtime configuration (missing runtime configuration)
- schema drift (schema drift)
- logic bug not caught by build (logic bug not caught by build)

## 2. Workflow fails, runtime still appears healthy (Workflow fails, runtime still appears healthy)
Cause examples:
- noisy deployment action (noisy deployment action)
- secondary deploy path failure while primary runtime still serves (secondary deploy path failure while primary runtime still serves)
- logging/reporting mismatch (logging/reporting mismatch)

## 3. Code merged, schema not applied (Code merged, schema not applied)
Cause examples:
- migrations exist in git but were not applied to active DB (migrations exist in git but were not applied to active DB)
- schema cache not updated (schema cache not updated)

## 4. Public route bug survives deploy (Public route bug survives deploy)
Cause examples:
- UI changed without proxy/middleware allowlist update (UI changed without proxy/middleware allowlist update)
- locale route variants not tested (locale route variants not tested)

## 5. Local validation blocks confidence incorrectly (Local validation blocks confidence incorrectly)
Cause examples:
- machine resource constraints (machine resource constraints)
- local build instability (local build instability)
- unhealthy local environment treated as production truth (unhealthy local environment treated as production truth)

---

## Recommended Operational Habits (Thói Quen Vận Hành Được Khuyến Nghị)

## For small UI/content changes (For small UI/content changes)
- push intended commit (push intended commit)
- verify workflow triggers (verify workflow triggers)
- verify the exact live route visually/behaviorally (verify the exact live route visually/behaviorally)

## For runtime/API changes (For runtime/API changes)
- verify build state (verify build state)
- verify live API behavior (verify live API behavior)
- inspect debug indicators where available (inspect debug indicators where available)

## For schema-backed changes (For schema-backed changes)
- verify code (verify code)
- verify migration application (verify migration application)
- verify live route/API behavior that depends on schema (verify live route/API behavior that depends on schema)

## For public-route changes (For public-route changes)
- test while logged out (test while logged out)
- test locale-prefixed forms (test locale-prefixed forms)
- test entry through the actual public page that links to the route (test entry through the actual public page that links to the route)

---

## Deployment and Documentation (Triển Khai Và Tài Liệu / Deployment and Documentation)

Deployment-sensitive changes should ideally update documentation when they alter (Deployment-sensitive changes should ideally update documentation when they alter):
- route visibility (route visibility)
- auth expectations (auth expectations)
- integration surfaces (integration surfaces)
- environment variable requirements (environment variable requirements)
- operational verification expectations (operational verification expectations)

This helps keep repo docs aligned with production reality (This helps keep repo docs aligned with production reality).

---

## Summary (Tóm Tắt)

The key deployment lesson for this repo is (The key deployment lesson for this repo is):

**A successful deployment is not just a green workflow. It is a verified chain from pushed code to correct live behavior.** (A successful deployment is not just a green workflow. It is a verified chain from pushed code to correct live behavior.)

That chain should be checked explicitly, especially in a platform with (That chain should be checked explicitly, especially in a platform with):
- multiple route classes (multiple route classes)
- multiple deployment surfaces (multiple deployment surfaces)
- runtime auth boundaries (runtime auth boundaries)
- evolving schema-backed architecture (evolving schema-backed architecture)