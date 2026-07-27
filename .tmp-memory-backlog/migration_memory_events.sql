-- memory_events table for Siri/Genie/System observability
-- Safe additive migration — no existing tables modified

CREATE TABLE IF NOT EXISTS public.memory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    workspace_id TEXT,
    session_id TEXT,
    source TEXT NOT NULL CHECK (source IN ('siri', 'genie', 'system')),
    entity_refs JSONB DEFAULT '[]'::jsonb,
    tool_invocations JSONB DEFAULT '[]'::jsonb,
    model_decision JSONB,
    prompt_hash TEXT,
    result_summary TEXT DEFAULT '',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_estimate NUMERIC,
    confidence NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now(),
    valid_from TIMESTAMPTZ DEFAULT now(),
    valid_until TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_memory_events_user_id
    ON public.memory_events(user_id);

CREATE INDEX IF NOT EXISTS idx_memory_events_workspace_id
    ON public.memory_events(workspace_id);

CREATE INDEX IF NOT EXISTS idx_memory_events_created_at
    ON public.memory_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_events_source
    ON public.memory_events(source);

ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable service-role full access"
    ON public.memory_events
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

GRANT ALL ON public.memory_events TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.memory_events_id_seq TO authenticated, anon;

-- Optional lightweight retention helper (run on cron if desired)
-- DELETE FROM public.memory_events
-- WHERE valid_until IS NOT NULL AND valid_until < now();
