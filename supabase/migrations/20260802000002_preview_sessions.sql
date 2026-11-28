CREATE TABLE IF NOT EXISTS public.preview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tenant_id UUID,
  code TEXT NOT NULL,
  language VARCHAR(32) NOT NULL DEFAULT 'html',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  rendered_output TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preview_sessions_user ON public.preview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_expires ON public.preview_sessions(expires_at);

ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role can manage preview_sessions"
ON public.preview_sessions
FOR ALL
TO service_role
USING (auth.role() = 'service_role');

CREATE POLICY "Users can view their own preview sessions"
ON public.preview_sessions
FOR SELECT
TO authenticated
USING (user_id = (select auth.jwt()->>'sub'));

CREATE POLICY "Users can insert their own preview sessions"
ON public.preview_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = (select auth.jwt()->>'sub'));
