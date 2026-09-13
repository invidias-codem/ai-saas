-- ============================================================================
-- Phase 3 Durable Build State — additive, narrowly-scoped.
--
-- code_builder_builds: the durable snapshot of one Code Builder build.
--   "Where is this build right now?" (NOT the event stream — that's Phase 4).
--
-- Identity model:
--   build_id        = logical/business identity (created by the API, stable).
--   trigger_run_id  = execution identity (may CHANGE across retries/replacement;
--                     never the build identity).
--   request_id      = correlation identity (one user turn).
--   operation_key   = deterministic dedup key (codebuild:<buildId>:v1).
--
-- Invariants:
--   * build_id is UNIQUE — a retry/replay with the same build_id UPDATES the
--     existing row, never inserts a second logical build.
--   * Terminal states (completed/failed/cancelled) are idempotent.
--   * trigger_run_id is updatable (execution may be retried), not part of the
--     build identity.
--   * User-facing reads scoped by user_id via RLS; writes via service_role.
--
-- RUN SAFELY via linked/migration flow only (never `supabase db push`).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Canonical status + phase enums (explicit, bounded transitions enforced by
-- the buildStore layer, not by DB triggers — keep the DB boring and audit-free).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_builder_status') THEN
        CREATE TYPE public.code_builder_status AS ENUM (
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'code_builder_phase') THEN
        CREATE TYPE public.code_builder_phase AS ENUM (
            'queued',
            'planning',
            'generating',
            'verifying',
            'completed'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.code_builder_builds (
    build_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    workspace_id    TEXT,
    request_id      TEXT,
    trigger_run_id  TEXT,
    operation_key   TEXT,
    status          public.code_builder_status NOT NULL DEFAULT 'queued',
    phase           public.code_builder_phase NOT NULL DEFAULT 'queued',
    progress        INTEGER NOT NULL DEFAULT 0,
    mode            TEXT NOT NULL DEFAULT 'full',
    prompt          TEXT,
    error_code      TEXT,
    error_message   TEXT,          -- sanitized before write (no keys/stack dumps)
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup identity: one logical build per build_id (already guaranteed by PK),
-- plus a deterministic operation_key index for reconciliation (partial, so
-- legacy/absent keys are unaffected).
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_builder_builds_operation_key
    ON public.code_builder_builds(operation_key)
    WHERE operation_key IS NOT NULL;

-- Lookup by user (RBAC reads) and by trigger run (execution correlation).
CREATE INDEX IF NOT EXISTS idx_code_builder_builds_user
    ON public.code_builder_builds(user_id);
CREATE INDEX IF NOT EXISTS idx_code_builder_builds_trigger_run
    ON public.code_builder_builds(trigger_run_id);

-- updated_at maintenance (boring, no business logic).
CREATE OR REPLACE FUNCTION public.touch_code_builder_build()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_code_builder_builds_touch ON public.code_builder_builds;
CREATE TRIGGER trg_code_builder_builds_touch
    BEFORE UPDATE ON public.code_builder_builds
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_code_builder_build();

-- RLS: user-facing reads are tenant/user scoped. Writes go through service_role.
ALTER TABLE public.code_builder_builds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.code_builder_builds FROM PUBLIC, anon, authenticated;

-- Users read their own builds (RBAC read path for the future dashboard).
CREATE POLICY "users_read_own_builds" ON public.code_builder_builds
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Service role owns writes + reads (server path).
GRANT SELECT, INSERT, UPDATE ON TABLE public.code_builder_builds TO service_role;

COMMIT;