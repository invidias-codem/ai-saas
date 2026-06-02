-- 1. Root Grants Table (Truth in Cloud)
CREATE TABLE IF NOT EXISTS public.harness_root_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    path TEXT NOT NULL,
    label TEXT NOT NULL,
    read_only BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Telemetry Events Table (Push to Cloud)
CREATE TABLE IF NOT EXISTS public.harness_telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    path_accessed TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,
    operation_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.harness_root_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harness_telemetry_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for harness_root_grants
CREATE POLICY "Users can view their own root grants"
    ON public.harness_root_grants FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own root grants"
    ON public.harness_root_grants FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own root grants"
    ON public.harness_root_grants FOR DELETE
    USING (auth.uid()::text = user_id);

-- RLS Policies for harness_telemetry_events
CREATE POLICY "Users can view their own telemetry events"
    ON public.harness_telemetry_events FOR SELECT
    USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own telemetry events"
    ON public.harness_telemetry_events FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);
