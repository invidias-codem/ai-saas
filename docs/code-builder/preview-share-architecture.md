# Code Builder: Sandbox Micro-App Previews and Shareable Publishing

> Status: implementation slices proposed. Phase 8A manifest contract implemented in
> this PR; no sandbox is provisioned and no production app is changed.
> Builds on `ai/plans/code-builder-durable-factory.md` (Phases 8–10).

## User experience

After a successful Code Builder run:

1. The owner selects **Preview**. Lattice assembles the immutable build snapshot
   into a trusted web project and runs it in an isolated Vercel Sandbox.
2. The Preview tab shows the running app, device-size toggles, logs, and a clear
   sandbox state (starting, ready, sleeping, failed).
3. **Share** creates an intentional, revocable access grant. The share page is
   a Lattice URL, never the raw infrastructure URL.
4. **Publish** (separate action) creates an immutable hosted release with a
   stable site URL. Preview expiration must not delete source or publications.

Manus separates temporary sandbox preview URLs from permanent published URLs;
Lattice must do the same. Avoid promising that an expired sandbox URL remains
reachable.

## Existing repo and migration constraints

- `src/trigger/codeBuilderTask.ts` currently completes a build with
  `plan_json` and `files_json` in `code_builder_builds`.
- `app/[locale]/(dashboard)/(routes)/code/components/CodePanel.tsx` has a
  browser `blob:` preview and a preview_sessions-based HTML renderer.
- `app/api/preview/render/route.ts` serves generated HTML/JS on the
  main application origin; do **not** use this route as a public share host.
- Completed artifacts are component files, not necessarily a runnable
  project. The current five-file production example has `app/page.tsx`
  and four components, but no trusted package manifest or lockfile.
- Build ids are UUIDs; Trigger run IDs must not become user-facing app IDs.
- The new preview feature must be feature flagged, not replace the existing
  successful build path as part of rollout.

## Architecture and trust boundaries

```text
Code Builder / Trigger.dev
    -> owner-scoped completeBuild files_json + plan_json
    -> validated PreviewManifest + sha256 digest (Phase 8A)
    -> trusted Next.js micro-app template with pinned lockfile (8B)
    -> Trigger preview-provision task (8C)
    -> Vercel Sandbox (isolated file system, no Lattice secrets)
       -> npm ci --ignore-scripts, typecheck/build, start :3000 on 0.0.0.0
       -> readiness probe, bounded structured diagnostics
    -> preview session/URL (ephemeral, owner scoped)
    -> separate share grant / preview gateway (8D)
    -> immutable Vercel publish deployment (8E)
```

Vercel Sandbox is a temporary execution runtime, **not** the source of truth.
The authoritative artifact is the versioned source snapshot stored in Supabase
(or Supabase Storage when JSON payloads exceed durable-row budgets). Keep
`artifactSha256` as the identity of an immutable revision.

### Identity and state

- `buildId` (UUID): logical Code Builder job, owner-scoped.
- `artifactSha256`: immutable content fingerprint, independent of file order.
- `microAppId` (UUID): long-lived user-facing app identity.
- `previewId` (UUID): one preview attempt for one artifact revision.
- `sandboxName`: infrastructure locator, never public business identity.
- `shareSlug` / `shareTokenHash`: revocable sharing identity; raw token
  must not be stored in plaintext.
- `publishedVersionId`: immutable deployed release identity.

Preview statuses: `queued -> assembling -> provisioning -> installing ->
building -> starting -> ready`. From ready: `sleeping`, `expired`,
or `failed`; a new preview attempt can restore a persisted revision.
Do not mutate the completed Code Builder status on preview failures.

### Data schema (Phase 8B migration; not applied in 8A)

Propose separate tables:
- `micro_apps`: app_id, owner_user_id, workspace_id, name, current_revision_id,
  visibility, created_at/updated_at.
- `micro_app_revisions`: revision_id, app_id, build_id, sha256, artifact_ref,
  creation time, immutable after insert.
- `micro_app_previews`: preview_id, revision_id, sandbox_name, port, status,
  expires_at, last_heartbeat, diagnostic_code, current public origin metadata.
- `micro_app_shares`: share_id, app_id, revision_id, token_hash, visibility,
  expires_at, revoked_at, allowed origin policy, created_by.
- `micro_app_publications`: publication_id, app_id, revision_id, Vercel
  deployment reference, published_at, stable publication slug.

Every owner operation verifies Clerk identity and accepted workspace access.
Use service-role database writes only on the server/worker, enforce RLS on
owner-readable tables, and grant no anonymous access to source artifacts.
Share reads use a narrow server boundary and never expose raw source by default.
Avoid public `SECURITY DEFINER` functions.

### API boundary (Phase 8C/8D)

- `POST /api/code-builder/build/{buildId}/preview`: authenticated owner,
  completed artifact, idempotent keyed by buildId + artifact hash; returns
  202 and previewId.
- `GET /api/code-builder/previews/{previewId}`: owner-scoped status,
  progress, readiness, structured diagnostics, expiration.
- `POST /api/code-builder/previews/{previewId}/resume`: owner
  rehydrates from immutable artifact after an idle stop.
- `POST /api/micro-apps/{appId}/shares`: create bounded access grant.
- `DELETE /api/micro-apps/{appId}/shares/{shareId}`: revoke.
- `GET /s/{slug}`: Lattice share landing page, subject to permission grant.
- `POST /api/micro-apps/{appId}/publish`: explicit publish action.
- `GET /p/{slug}`: stable published app redirect or versioned launch page.

**Security nuance:** An arbitrary Vercel Sandbox `domain(3000)` URL is
a public HTTPS origin while the port is exposed. A share landing page
that hides that URL does **not** make it private or revocable; anyone
who learns the raw origin may bypass Lattice's share gate.
Before claiming private/revocable previews, implement an independently
enforced preview ingress gate (or serve an access-controlled immutable
deployment), and verify raw-origin bypass is impossible. For the first MVP,
explicitly label raw-domain access as unlisted/public and allow share only
after the user approves that visibility.

### Sandbox provisioning and safeguards

- The trusted project template owns `package.json`, lockfile, Next/TS
  config, scripts, `app/layout.tsx`, and dependency allowlist; generated
  source cannot override them. Pin versions and use `npm ci --ignore-scripts`.
- **Never** mount the Lattice source repo or pass `SUPABASE_SERVICE_ROLE_KEY`,
  `NVIDIA_API_KEY`, `TRIGGER_SECRET_KEY`, Vercel access tokens or cookies
  into a sandbox. Running apps are adversarial inputs.
- Sandbox SDK caller authenticates with scoped Vercel credentials. Trigger.dev
  runs **outside** Vercel, so it needs explicit server-only SDK auth; OIDC is
  automatic only when running inside Vercel Functions.
- Use CPU/memory caps, per-user concurrency, operation idempotency, hard
  session timeouts, idle shutdown, and max failed repair attempts.
- Restrict egress to the needed package registry only during dependency
  resolution, then deny egress for the running preview by default. Never
  allow untrusted install scripts when provisioning.
- Expose only the approved port; server listens on `0.0.0.0`. Probe
  HTTP readiness before returning a usable URL. Restart processes on resume:
  filesystem snapshots do not preserve running processes.
- Browser iframe must be on a different origin from `gen1e.xyz`, with
  no `allow-same-origin` in the iframe sandbox and no platform cookies
  or credentials. Use a strict host-side postMessage origin+source check.
- Preserve stderr/exit code, command name, timeout, and sanitized file
  diagnostics against previewId in durable telemetry. Avoid generic
  'preview failed' without a diagnosis.

### Implementation slices

**8A (this PR):** preview source manifest + path/size/config authority
validation, deterministic artifact digest, lifecycle types, contract tests.
No new dependency, database schema, sandbox, or deploy.

**8B:** pinned Next.js template and immutable revision tables; read-only
backfill existing successful builds; content-addressed artifact storage.
Test RLS and owner-only read access.

**8C:** `@vercel/sandbox` adapter and Trigger preview-provision task,
creation from templates, file upload, dependency install, compile, live server,
readiness, bounded retries and cleanup. Test sandbox failure and timeout
with mocked SDK; live qualification behind feature flag.

**8D:** Preview/Logs/Share UI with mobile+desktop frames and explicit
readiness/expiration states. Isolate share access using an enforceable
ingress policy; include share/revoke/expiry tests and verify no raw-origin
bypass. Prefer dedicated preview origin.

**8E:** immutable one-click **Publish** to a separate Vercel deployment,
stable slug, revision history, rollback/unpublish, basic analytics. Keep
preview sessions and publication state independent.

## Release gates

1. Real production build with `app/page.tsx` + components produces an
   immutable manifest and valid trusted project.
2. No secrets cross into the sandbox; unsafe paths and untrusted configs fail closed.
3. Typecheck/build starts the app, external readiness probe returns HTTP 200,
   and iframe renders on both mobile and desktop.
4. Logs identify compilation/runtime failure; successful build record stays
   completed even if preview fails.
5. Preview stop/expiry does not lose source; resume creates a working preview.
6. Private/revoked shares cannot be accessed directly or through raw sandbox
   origins; temporary previews do not masquerade as permanent publications.
7. Sandbox quotas and idle cleanup are enforced, including for abandoned runs.

References: Vercel Sandbox SDK (https://vercel.com/docs/sandbox),
Manus website publishing (https://open.manus.ai/docs/v2/website).
