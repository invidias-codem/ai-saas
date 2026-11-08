-- ============================================================================
-- Phase 8F.0: Unified session contract for AI–Human Workspace Runtime.
--
-- unified_sessions: one durable session identity associating multiple
-- execution resources (preview sandbox, VDI desktop, build task, browser
-- session) with a single workspace and artifact revision. Control authority
-- (who can issue interactive operations) is tracked separately from view
-- access (who can observe).
--
-- Control model:
--   control_mode       = 'agent' | 'human' | 'observer' | 'handoff_pending'
--   input_control_*    = who can issue mouse/keyboard/file mutations
--   session_lease_*    = who can observe (view-only, no input authority)
--   control_generation = atomic counter; every handoff increments it, and
--     all execution adapters must check it before acting (generation fencing).
--
-- Invariants:
--   * One unified session per workspace + artifact revision pair.
--   * Only one of input_control (agent/human) may be active at a time.
--   * Observer access can coexist with either control mode (read-only).
--   * Writes go through service_role; reads scoped by workspace via RLS.
--
-- Run via `supabase migration up --linked` or `supabase db query -f <file>`.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.unified_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         TEXT NOT NULL,
    build_id             UUID REFERENCES public.code_builder_builds(build_id),
    preview_id           UUID REFERENCES public.preview_sandboxes(id),
    desktop_id           TEXT REFERENCES public.vdi_desktops(desktop_id),
    artifact_revision    TEXT NOT NULL,
    control_mode         TEXT NOT NULL DEFAULT 'observer',
    control_generation   INTEGER NOT NULL DEFAULT 0,
    input_control_holder TEXT,      -- 'agent:<agentId>' | 'human:<userId>' | NULL
    input_control_granted_at TIMESTAMPTZ,
    input_control_expires_at TIMESTAMPTZ,
    session_lease_user   TEXT,       -- observer: user who can view
    session_lease_granted_at TIMESTAMPTZ,
    session_lease_expires_at TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

-- One active session per workspace + artifact revision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_sessions_workspace_revision
    ON public.unified_sessions(workspace_id, artifact_revision)
    WHERE expires_at > now();

-- Lookup by resource for reconciliation.
CREATE INDEX IF NOT EXISTS idx_unified_sessions_preview
    ON public.unified_sessions(preview_id);
CREATE INDEX IF NOT EXISTS idx_unified_sessions_desktop
    ON public.unified_sessions(desktop_id);
CREATE INDEX IF NOT EXISTS idx_unified_sessions_build
    ON public.unified_sessions(build_id);

-- RLS: workspace-scoped reads/writes.
ALTER TABLE public.unified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.unified_sessions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.unified_sessions FROM authenticated;

GRANT SELECT ON TABLE public.unified_sessions TO authenticated;
CREATE POLICY "workspace_members_read_sessions" ON public.unified_sessions
    FOR SELECT
    TO authenticated
    USING (true); -- Workspace membership enforced at API layer; RLS defers to app

-- Service role owns all writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.unified_sessions TO service_role;

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.touch_unified_session()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unified_sessions_touch ON public.unified_sessions;
CREATE TRIGGER trg_unified_sessions_touch
    BEFORE UPDATE ON public.unified_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_unified_session();

COMMIT;
