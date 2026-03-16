-- Migration: Token Budget Guard
-- Date: 2026-03-08
-- Purpose: Track monthly LLM token usage per user for budget enforcement.
--          Supports weighted accounting (Claude costs more budget than Gemini Flash).
-- Related: lib/security/budgetGuard.ts

-- ─── Table: user_token_budgets ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_token_budgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  month_key     TEXT NOT NULL,          -- Format: 'YYYY-MM' (e.g. '2026-03')
  tokens_used   BIGINT NOT NULL DEFAULT 0,
  last_model    TEXT,                   -- Last model used (for diagnostics)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_token_budgets_unique UNIQUE (user_id, month_key)
);

-- Index for fast per-user monthly lookups
CREATE INDEX IF NOT EXISTS idx_token_budgets_user_month
  ON user_token_budgets (user_id, month_key);

-- ─── Tier column on supporter_credits ────────────────────────────────────────
-- Add tier field if it doesn't exist yet.
-- Valid values: 'free', 'pro', 'enterprise'

ALTER TABLE supporter_credits
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro', 'enterprise'));

-- ─── RPC: increment_token_usage ──────────────────────────────────────────────
-- Atomically upsert token usage for a user's current month.
-- Creates the row if it doesn't exist (new month), otherwise increments.

CREATE OR REPLACE FUNCTION increment_token_usage(
  p_user_id   TEXT,
  p_month_key TEXT,
  p_tokens    BIGINT,
  p_model     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_token_budgets (user_id, month_key, tokens_used, last_model, updated_at)
  VALUES (p_user_id, p_month_key, p_tokens, p_model, NOW())
  ON CONFLICT (user_id, month_key)
  DO UPDATE SET
    tokens_used = user_token_budgets.tokens_used + EXCLUDED.tokens_used,
    last_model  = COALESCE(EXCLUDED.last_model, user_token_budgets.last_model),
    updated_at  = NOW();
END;
$$;

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE user_token_budgets ENABLE ROW LEVEL SECURITY;

-- Users can only read their own budget (for UI display)
CREATE POLICY "Users can view own token budget"
  ON user_token_budgets
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Only service role can insert/update (application writes via service key)
CREATE POLICY "Service role manages token budgets"
  ON user_token_budgets
  FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Helpful view: current month usage ───────────────────────────────────────

CREATE OR REPLACE VIEW current_month_token_usage AS
SELECT
  user_id,
  tokens_used,
  last_model,
  updated_at
FROM user_token_budgets
WHERE month_key = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM');
