-- ============================================================================
-- Phase 8D Preview Share — additive, narrowly-scoped.
--
-- preview_shares: stable, Lattice-controlled share links for sandbox previews.
-- Every share link is an unguessable token that resolves through an
-- authorization-checked route. The raw sandbox URL is never handed out;
-- consumers receive only the share link, which enforces auth on each request.
--
-- Identity model:
--   id           = share identity (stable).
--   preview_id   = references preview_sandboxes (the sandbox being shared).
--   user_id      = owner who created the share.
--   share_token  = unguessable token in the public share URL.
--
-- Invariants:
--   * One share per preview (re-share updates the token).
--   * Writes go through service_role; user reads scoped by user_id via RLS.
--   * No expiration column yet — shares live until the preview expires.
--     Do NOT label links "private" or "revocable" until enforcement exists
--     (see Issue #479).
--
-- Run via `supabase migration up --linked`.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.preview_shares (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preview_id   UUID NOT NULL REFERENCES public.preview_sandboxes(id),
    user_id      TEXT NOT NULL,
    share_token  TEXT NOT NULL UNIQUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One share per preview.
CREATE UNIQUE INDEX IF NOT EXISTS idx_preview_shares_preview
    ON public.preview_shares(preview_id);

-- Lookup by token (public resolution path) and by owner (dashboard).
CREATE INDEX IF NOT EXISTS idx_preview_shares_token
    ON public.preview_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_preview_shares_user
    ON public.preview_shares(user_id);

-- RLS: user-facing reads are user-scoped. Writes go through service_role.
ALTER TABLE public.preview_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.preview_shares FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preview_shares FROM authenticated;

GRANT SELECT ON TABLE public.preview_shares TO authenticated;
CREATE POLICY "users_read_own_shares" ON public.preview_shares
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid()::text);

-- Service role owns writes + reads (server path).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.preview_shares TO service_role;

COMMIT;
