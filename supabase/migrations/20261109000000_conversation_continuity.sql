-- Conversation Continuity C0: durable run identities, minimal audit events.
-- Schema only. Do NOT enable the feature flag until the Trigger worker, API
-- admissions, identity checks, and resume UI are qualified together.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.conversation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id text NOT NULL,
  request_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK
    (status IN ('queued','running','awaiting_approval','completed','failed','cancelled')),
  phase text NOT NULL DEFAULT 'queued' CHECK (char_length(phase) BETWEEN 1 AND 80),
  engine text NOT NULL CHECK
    (engine IN ('conversation','code','research','image','video','audio','browser','data')),
  trigger_run_id text,
  control_generation bigint NOT NULL DEFAULT 0 CHECK (control_generation >= 0),
  last_event_sequence bigint NOT NULL DEFAULT 0 CHECK (last_event_sequence >= 0),
  result_ref text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT conversation_runs_idempotency UNIQUE (user_id, conversation_id, request_key),
  CONSTRAINT conversation_runs_terminal_result CHECK
    (status <> 'completed' OR (result_ref IS NOT NULL AND length(result_ref) > 0))
);

CREATE INDEX IF NOT EXISTS conversation_runs_conversation_recent
  ON public.conversation_runs(user_id, conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS conversation_runs_trigger
  ON public.conversation_runs(trigger_run_id) WHERE trigger_run_id IS NOT NULL;

-- Event content must be bounded, structured metadata, not raw chat transcripts,
-- credentials, full prompts, or provider scratchpad. Durable artifacts live
-- in separately protected stores and are referenced by immutable IDs.
CREATE TABLE IF NOT EXISTS public.conversation_run_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.conversation_runs(id) ON DELETE CASCADE,
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  event_kind text NOT NULL CHECK
    (event_kind IN ('queued','started','checkpoint','delegated','handoff',
                    'awaiting_approval','resumed','completed','failed','cancelled')),
  engine text CHECK
    (engine IN ('conversation','code','research','image','video','audio','browser','data')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_run_events_order UNIQUE (run_id, event_sequence)
);

CREATE INDEX IF NOT EXISTS conversation_run_events_run_order
  ON public.conversation_run_events(run_id, event_sequence);

-- Clerk user IDs do not equal Supabase auth.uid(). These rows are service-only.
-- The service MUST check conversation owner and requested workspace before
-- using service_role; API-level caller identity is never accepted from JSON.
ALTER TABLE public.conversation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_run_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conversation_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.conversation_run_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.conversation_run_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_run_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.conversation_run_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.touch_conversation_run()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_conversation_run_touch ON public.conversation_runs;
CREATE TRIGGER trg_conversation_run_touch
  BEFORE UPDATE ON public.conversation_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_run();

COMMIT;
