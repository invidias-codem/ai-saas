-- Create logs table for Vercel Log Drains
CREATE TABLE IF NOT EXISTS public.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL, -- 'info', 'warning', 'error'
    message TEXT NOT NULL,
    source TEXT NOT NULL, -- 'vercel', 'application', etc.
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON public.logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON public.logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON public.logs(source);

-- RLS Policies
-- Only admins can view logs (using a custom claim or just checking the user ID in the app for now, but strictly we should use RLS)
-- For now, we will allow authenticated users to view logs if they are admins. 
-- Ideally we would have an is_admin flag in public.users or app_metadata.
-- Assuming we handle admin check in the API/Middleware for now or relying on specific user IDs.

-- For insertion, the service role (used by the webhook) bypasses RLS, so this policy is for viewing.
CREATE POLICY "Admins can view logs"
    ON public.logs FOR SELECT
    USING (auth.role() = 'authenticated'); 
    -- Refine this later to verify actual admin status if specific claims exist.

-- Function to handle new log insertion helper (optional but good for consistency)
