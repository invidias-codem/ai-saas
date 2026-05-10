-- Migration: Delta Engine — add refresh RPC + trust tier column
-- Depends on: 20260305_delta_engine_schema.sql

-- 1. RPC to refresh model_truth_scores materialized view
--    Called by /api/cron/refresh-truth-scores
CREATE OR REPLACE FUNCTION refresh_model_truth_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY model_truth_scores;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_model_truth_scores() TO service_role;

-- 2. Add trust_tier column to ai_output_audit if not present
--    Lets us query audit rows by the trust tier they were promoted to
ALTER TABLE ai_output_audit
  ADD COLUMN IF NOT EXISTS trust_tier TEXT DEFAULT 'UNVERIFIED'
    CHECK (trust_tier IN ('AXIOM', 'CONFIRMED', 'SUPPORTED', 'UNVERIFIED'));

-- 3. Index for trust tier queries
CREATE INDEX IF NOT EXISTS idx_ai_output_audit_trust_tier
  ON ai_output_audit(trust_tier);

-- 4. View: current session hallucination summary (useful for debugging)
CREATE OR REPLACE VIEW session_delta_summary AS
SELECT
  session_id,
  model,
  COUNT(*)                                                          AS total_claims,
  ROUND(AVG(delta_score)::numeric, 3)                               AS avg_delta_score,
  ROUND(AVG(CASE WHEN verdict IN ('CONTRADICTED','MISATTRIBUTED')
               THEN 1.0 ELSE 0.0 END)::numeric, 3)                 AS hallucination_rate,
  COUNT(CASE WHEN verdict = 'CONFIRMED' THEN 1 END)                 AS confirmed_count,
  COUNT(CASE WHEN verdict = 'CONTRADICTED' THEN 1 END)              AS contradicted_count,
  MAX(created_at)                                                   AS last_claim_at
FROM ai_output_audit
GROUP BY session_id, model;

COMMENT ON VIEW session_delta_summary IS
  'Per-session delta score summary. Used by admin dashboard and DeltaEngine diagnostics.';
