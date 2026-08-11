-- risk_events: high-velocity append-only table for ALE telemetry ingestion.

CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL REFERENCES public.risk_weights(event_type),
  trace_id text,
  workspace_id text,
  user_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT risk_events_pkey PRIMARY KEY (id)
);

-- Fast lookups by time and event type.
CREATE INDEX IF NOT EXISTS idx_risk_events_timestamp ON public.risk_events (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_event_type ON public.risk_events (event_type);

ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- Backend/telemetry service inserts only; dashboard users read via view.
CREATE POLICY "Backend can insert risk events"
  ON public.risk_events FOR INSERT
  TO service_role
  USING (true);

-- Authenticated users read own/org-scoped events; tighten later with RLS if needed.
CREATE POLICY "Authenticated users can read risk events"
  ON public.risk_events FOR SELECT
  TO authenticated
  USING (true);
