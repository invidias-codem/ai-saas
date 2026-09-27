-- ============================================================================
-- Phase 4B Durable Build Results — additive, narrowly-scoped.
--
-- code_builder_builds.plan_json + files_json store the *result* of a build so
-- the UI can hydrate plan/files on completed builds, including page reload.
--
-- Invariants:
--   * Columns are NULL until the worker's runCodeBuilder resolves; only
--     completeBuild(...) writes them. Status transition to 'completed' is
--     atomic with the artifact write (single UPDATE).
--   * Artifact writes are retry-safe: completeBuild is already idempotent
--     (`.not('status', 'in', '(completed,failed,cancelled)')`); a second call
--     preserves the first write.
--   * RLS still scopes reads by user_id; artifacts never cross user boundary.
--   * Reads of running builds do NOT select these columns (they can be MBs)
--     — only the owner-authorized completion fetch returns them.
--
-- Run via `supabase migration up --linked` (existing pattern for this folder).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.code_builder_builds
    ADD COLUMN IF NOT EXISTS plan_json  JSONB,
    ADD COLUMN IF NOT EXISTS files_json JSONB;

COMMENT ON COLUMN public.code_builder_builds.plan_json IS
    'ProjectPlan snapshot written once by codeBuilderTask at completion. Immutable post-write.';
COMMENT ON COLUMN public.code_builder_builds.files_json IS
    'GeneratedFile[] snapshot written once by codeBuilderTask at completion. Immutable post-write.';

COMMIT;
