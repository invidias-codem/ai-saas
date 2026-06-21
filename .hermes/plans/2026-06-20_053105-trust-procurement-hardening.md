# Trust + Procurement Hardening Sprint Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make Lattice OS safer and more enterprise-procurement-ready by reducing dependency risk, establishing admin/security primitives, and improving appliance readiness.

**Architecture:** Start with measurable security debt reduction, then add procurement-facing controls around membership, roles, auditability, license activation, and deployment preflight. Keep UCOL/IP internals protected and avoid changes that increase user-facing latency.

**Tech Stack:** TypeScript, Next.js App Router, Supabase migrations/RLS, Clerk auth, Vercel, GitHub Actions, npm/pnpm lockfiles.

---

## Current Context

- BYOK Supabase migration confirmed applied successfully by JJ.
- Repo: `invidias-codem/ai-saas` on `main`.
- Working tree was clean at sprint kickoff.
- Live Dependabot query reported 51 open alerts:
  - critical: 1
  - high: 18
  - medium: 25
  - low: 7
- Highest-priority manifests/packages from live alert triage:
  - `anycrawl/pnpm-lock.yaml`: `fast-xml-parser`, `undici`, `form-data`, `tar`, `file-type`, `@babel/core`, `@ai-sdk/provider-utils`, `uuid`, `js-yaml`
  - `packages/ucol-node/package-lock.json`: `hono`, `ws`, `@babel/core`, `js-yaml`
  - `functions/package-lock.json`: `form-data`, `protobufjs`, `@opentelemetry/core`, `js-yaml`, `qs`, `uuid`, `fast-xml-parser`, `@babel/core`
  - `relay-client/package-lock.json`: `form-data`
  - root `pnpm-lock.yaml` / `package.json`: `xlsx`, `ws`, `js-yaml`, `uuid`, `postcss`
  - `remote/package-lock.json`: `js-yaml`, `uuid`

## Non-negotiables from `vision.md`

- All env vars must be validated via `lib/env.ts`; no raw `process.env` access.
- Secrets must never be committed.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Avoid stored XSS, SSRF, and command injection.
- Rate-limit public endpoints.
- CodeQL must pass.
- Preserve append-only knowledge graph semantics.
- Do not expose UCOL/DARE-TIES internals in prospect-facing surfaces.

---

## Sprint Backlog

### Task 1: Patch critical/high Dependabot alerts first

**Objective:** Remove the procurement-blocking critical/high dependency alerts with the smallest safe lockfile/package changes.

**Files likely touched:**
- `anycrawl/pnpm-lock.yaml`
- `packages/ucol-node/package.json`
- `packages/ucol-node/package-lock.json`
- `functions/package.json`
- `functions/package-lock.json`
- `relay-client/package.json`
- `relay-client/package-lock.json`
- root `package.json`
- root `pnpm-lock.yaml`

**Steps:**
1. For each manifest, inspect direct vs transitive dependency ownership.
2. Prefer package-manager native updates over manual lockfile edits.
3. Patch direct dependencies first:
   - `hono >= 4.12.25`
   - `ws >= 8.21.0`
   - `form-data >= 4.0.6` where v4 is used
   - `protobufjs >= 7.6.3`
   - `js-yaml >= 4.2.0`
   - `uuid >= 11.1.1` where compatible
   - `undici >= 7.28.0`
   - `fast-xml-parser >= 5.7.0`
4. For `xlsx`, investigate replacement or mitigation because Dependabot reports no patched version for some advisories.
5. Run manifest-specific installs to regenerate locks.
6. Re-run Dependabot API query and record remaining alerts.

**Validation:**
- `npm audit --omit=dev` where package-lock projects support it.
- `pnpm audit` where pnpm projects support it.
- Existing package tests/builds for touched workspaces.
- `gh api repos/invidias-codem/ai-saas/dependabot/alerts --paginate` confirms critical/high count decreased.

---

### Task 2: Add an enterprise security/advisory report artifact

**Objective:** Produce a lightweight procurement-facing security status snapshot without revealing proprietary internals.

**Files likely touched:**
- `docs/security/` or `docs/enterprise/` new markdown file
- Possibly `scripts/security/` helper script

**Steps:**
1. Add a generated/adaptable dependency-risk report template.
2. Include sections for dependency status, headers, auth, audit logging, data isolation, and appliance readiness.
3. Ensure copy stays high-level and does not reveal UCOL internals.
4. Add a script or documented command to refresh Dependabot counts.

**Validation:**
- Markdown renders cleanly.
- Commands in the doc run locally.

---

### Task 3: Org/member/RBAC foundation audit

**Objective:** Determine what exists and implement the minimal missing enterprise admin primitives.

**Files to inspect first:**
- `supabase/migrations/*.sql`
- `lib/**/auth*`
- `lib/**/workspace*`
- `app/**/admin*`
- `app/api/**`

**Steps:**
1. Inventory current workspace/project membership model.
2. Identify whether orgs, roles, and admin permissions already exist.
3. If absent, add a migration for org/project members using least-privilege roles.
4. Add RLS policies that preserve workspace/project isolation.
5. Add server-only helpers for permission checks.
6. Wire only one or two critical admin routes first; avoid broad UI churn.

**Validation:**
- Migration applies cleanly in a local/test Supabase flow if available.
- Unit tests cover permission allow/deny cases.
- No raw service-role exposure to client code.

---

### Task 4: Expand audit logging for procurement-critical events

**Objective:** Make security/admin/data operations traceable.

**Events to cover:**
- License activation/deactivation.
- API key creation/revocation.
- BYOK provider key create/update/delete.
- Workspace/project member invite/remove/role change.
- Data export/delete requests.
- Admin setting changes.

**Steps:**
1. Inventory existing audit tables/RPCs.
2. Add missing event enum/type constants.
3. Add server-side audit writer utility if missing.
4. Integrate with the highest-risk endpoints first.
5. Add tests that audit records are created without leaking secrets.

**Validation:**
- Tests prove events are persisted.
- Audit payloads redact secrets and sensitive tokens.

---

### Task 5: Harden license activation and appliance preflight

**Objective:** Make Docker/appliance deployment easier for design partners and safer for procurement review.

**Files likely touched:**
- `lib/env.ts`
- `app/api/**/license/**`
- `app/api/**/health/**` or `app/api/**/preflight/**`
- `docs/**deployment**` / `docs/**enterprise**`

**Steps:**
1. Inspect current enterprise license migration and activation code.
2. Ensure all required env vars are Zod-validated in `lib/env.ts`.
3. Add a server-only preflight endpoint that reports non-secret readiness checks:
   - database reachable
   - license configured/valid status class
   - required env vars present, without values
   - vector/embedding dependency status
   - storage/webhook configuration status
4. Rate-limit the endpoint or require admin/auth if exposed.
5. Add tests for redaction and failure modes.

**Validation:**
- Endpoint never returns secret values.
- Local tests cover missing env, invalid license, and healthy config shapes.

---

## Execution Order

1. Dependency alert reduction: critical/high first.
2. Validate and push safe dependency batch.
3. Org/RBAC inventory and minimal missing foundation.
4. Audit logging expansion.
5. License/preflight hardening.
6. Final CI pass and Dependabot recount.

## Open Questions

- Should `anycrawl` be treated as production-critical, optional, or removable from the deployment path?
- Can `xlsx` be replaced with a safer maintained alternative, or is it required for an existing import/export flow?
- Should enterprise orgs be a first-class entity now, or should workspace/project membership remain the boundary for design partners?

## Verification Commands

```bash
git status --short --branch
npm test -- --runInBand
npm run typecheck
npm run build
npm run security:test

gh api repos/invidias-codem/ai-saas/dependabot/alerts --paginate
```

Adjust package-manager commands per workspace (`npm`, `pnpm`) based on the touched manifest.
