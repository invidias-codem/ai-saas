-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: 20260312_critic_verdicts.sql
-- Purpose:   Storage for UCOL OutputCritic verdicts (Foundation Agent Phase 2)
-- Table:     ucol_critic_verdicts
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ucol_critic_verdicts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text,
  task_type      text,
  severity       text        NOT NULL CHECK (severity IN ('pass', 'warn', 'block')),
  checks         jsonb       NOT NULL DEFAULT '[]',
  overall_reason text,
  output_preview text,       -- first 200 chars of the critiqued output
  latency_ms     int,
  created_at     timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_critic_verdicts_severity
  ON ucol_critic_verdicts(severity);

CREATE INDEX IF NOT EXISTS idx_critic_verdicts_user
  ON ucol_critic_verdicts(user_id);

CREATE INDEX IF NOT EXISTS idx_critic_verdicts_created
  ON ucol_critic_verdicts(created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE ucol_critic_verdicts ENABLE ROW LEVEL SECURITY;

-- Only the service role can read/write critic verdicts.
-- Individual users never see raw critic output (internal audit log).
CREATE POLICY "service_role_only"
  ON ucol_critic_verdicts
  FOR ALL
  USING (current_setting('role', true) = 'service_role');
