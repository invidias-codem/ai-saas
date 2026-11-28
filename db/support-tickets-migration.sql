-- Support ticket intake for Path B: public form → Supabase persistence.
-- Idempotent; safe to re-run. Apply via: supabase db query --linked -f research/_notes/support-tickets-migration.sql

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  email       citext NOT NULL,
  subject     text NOT NULL,
  message     text NOT NULL,
  source      text NOT NULL DEFAULT 'landing-support-form',
  ip_hash     text,
  read_at     timestamptz,
  resolved_at timestamptz
);

-- citext requires the extension — usually already enabled in Supabase.
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- No direct reads/writes from anon/auth in v0 — service_role only via the API.
DROP POLICY IF EXISTS support_tickets_no_public ON public.support_tickets;

CREATE INDEX IF NOT EXISTS support_tickets_created_idx
  ON public.support_tickets (created_at DESC);

COMMENT ON TABLE public.support_tickets IS 'Inbound support requests from the unauth /support contact form (Path B: DB-first, email optional).';
