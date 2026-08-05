CREATE TABLE IF NOT EXISTS preview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID,
  code TEXT NOT NULL,
  language VARCHAR(32) NOT NULL DEFAULT 'html',
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending, ready, failed, expired
  rendered_output TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preview_sessions_user ON preview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_expires ON preview_sessions(expires_at);
