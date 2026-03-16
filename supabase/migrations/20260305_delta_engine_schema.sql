-- Phase 3: Delta Engine Schema
-- AI Output Audit Table and Truth Scoring

-- 1. Create audit table
CREATE TABLE IF NOT EXISTS ai_output_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  session_id      TEXT,
  model           TEXT NOT NULL,
  claim_text      TEXT NOT NULL,
  claim_embedding VECTOR(1536),
  verdict         TEXT NOT NULL, -- 'CONFIRMED' | 'SUPPORTED' | 'UNVERIFIED' | 'CONTRADICTED' | 'MISATTRIBUTED' | 'OUTDATED'
  confidence      FLOAT,
  graph_edge_id   UUID REFERENCES knowledge_edges(id),
  contradicts_node UUID REFERENCES knowledge_nodes(id),
  delta_score     FLOAT, -- 0.0 = perfect match, 1.0 = complete fabrication
  domain          TEXT, -- 'code', 'current_events', 'product', 'personal', 'general'
  explanation     TEXT
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_output_audit_session_id ON ai_output_audit(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_output_audit_model ON ai_output_audit(model);
CREATE INDEX IF NOT EXISTS idx_ai_output_audit_verdict ON ai_output_audit(verdict);
CREATE INDEX IF NOT EXISTS idx_ai_output_audit_created_at ON ai_output_audit(created_at);

-- 3. Materialized View for Model Truth Scores
CREATE MATERIALIZED VIEW IF NOT EXISTS model_truth_scores AS
SELECT
  model,
  domain,
  COUNT(*) AS total_claims,
  AVG(CASE WHEN verdict = 'CONFIRMED' THEN 1.0 ELSE 0.0 END) AS confirmed_rate,
  AVG(CASE WHEN verdict = 'SUPPORTED' THEN 1.0 ELSE 0.0 END) AS supported_rate,
  AVG(CASE WHEN verdict IN ('CONTRADICTED', 'MISATTRIBUTED') THEN 1.0 ELSE 0.0 END) AS hallucination_rate,
  AVG(CASE WHEN verdict = 'MISATTRIBUTED' THEN 1.0 ELSE 0.0 END) AS misattribution_rate,
  AVG(delta_score) AS avg_delta_score,
  MAX(created_at) as last_evaluated
FROM ai_output_audit
GROUP BY model, domain;

-- 4. Index on Materialized View
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_truth_scores_model_domain ON model_truth_scores(model, domain);

-- 5. RLS Policies
ALTER TABLE ai_output_audit ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (internal logging)
CREATE POLICY "Service role can insert audit logs"
  ON ai_output_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can read audit logs"
  ON ai_output_audit
  FOR SELECT
  TO service_role
  USING (true);

-- Allow authenticated users to read their own session audits?
-- For now, keep it internal/admin only or service role.
-- If user wants to see their audit history, we'd need session_id linkage to user_id.
-- Assuming session_id matches user_id or is linked.

-- 6. Comment for scheduling
COMMENT ON MATERIALIZED VIEW model_truth_scores IS 'Refreshed periodically by cron or trigger to update model performance metrics.';
