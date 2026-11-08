-- ============================================================================
-- Phase 8C Preview Sandbox — additive, narrowly-scoped.
--
-- preview_sandboxes: tracks isolated sandbox instances for generated micro-app
-- previews. Each sandbox runs generated code in a separate Vercel Sandbox VM,
-- never on the same origin as gen1e.xyz.
--
-- Identity model:
--   id            = preview identity (stable, owner-scoped).
--   build_id      = references code_builder_builds (canonical source artifact).
--   sandbox_id    = Vercel Sandbox VM id (execution identity).
--   sandbox_url   = isolated preview URL (separate origin).
--
-- Invariants:
--   * One sandbox per preview row (build_id + user_id scope).
--   * Terminal states (ready/failed/expired) are idempotent.
--   * Writes go through service_role; user reads scoped by user_id via RLS.
--   * expires_at governs automatic cleanup; no platform secrets stored.
--
-- Run via `supabase migration up --linked`.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.preview_sandboxes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_id       UUID NOT NULL REFERENCES public.code_builder_builds(build_id),
    user_id        TEXT NOT NULL,
    workspace_id   TEXT,
    sandbox_id     TEXT NOT NULL,
    sandbox_url    TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'provisioning',
    expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active sandbox per build per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_preview_sandboxes_build_user
    ON public.preview_sandboxes(build_id, user_id)
    WHERE status IN ('provisioning', 'ready');

-- Lookup by owner (dashboard) and by sandbox id (health checks / cleanup).
CREATE INDEX IF NOT EXISTS idx_preview_sandboxes_user
    ON public.preview_sandboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sandboxes_sandbox_id
    ON public.preview_sandboxes(sandbox_id);
CREATE INDEX IF NOT EXISTS idx_preview_sandboxes_expires
    ON public.preview_sandboxes(expires_at);

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.touch_preview_sandbox()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preview_sandboxes_touch ON public.preview_sandboxes;
CREATE TRIGGER trg_preview_sandboxes_touch
    BEFORE UPDATE ON public.preview_sandboxes
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_preview_sandbox();

-- RLS: user-facing reads are user-scoped. Writes go through service_role.
ALTER TABLE public.preview_sandboxes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.preview_sandboxes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preview_sandboxes FROM authenticated;

GRANT SELECT ON TABLE public.preview_sandboxes TO authenticated;
CREATE POLICY "users_read_own_sandboxes" ON public.preview_sandboxes
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Service role owns writes + reads (server path).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.preview_sandboxes TO service_role;

COMMIT;
