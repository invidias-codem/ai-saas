-- Phase 2 Relay Active Session Modifications

ALTER TABLE relay_sessions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ALTER COLUMN response_summary DROP NOT NULL;

CREATE INDEX IF NOT EXISTS relay_sessions_status_idx ON relay_sessions(status);
