-- Migration: Add RAG usage tracking
-- Purpose: Track API costs for rate limiting under $5/month budget

CREATE TABLE IF NOT EXISTS rag_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 4) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for monthly aggregation queries
CREATE INDEX IF NOT EXISTS idx_rag_usage_created_at ON rag_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_rag_usage_operation_type ON rag_usage(operation_type);

-- Function to get current month's RAG cost
CREATE OR REPLACE FUNCTION get_monthly_rag_cost()
RETURNS DECIMAL AS $$
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM rag_usage
  WHERE created_at >= date_trunc('month', NOW());
$$ LANGUAGE SQL STABLE;

-- Function to check if we're approaching budget limit
CREATE OR REPLACE FUNCTION is_approaching_rag_budget(threshold_percent DECIMAL DEFAULT 0.8)
RETURNS BOOLEAN AS $$
DECLARE
  monthly_budget CONSTANT DECIMAL := 5.00;
  current_cost DECIMAL;
BEGIN
  current_cost := get_monthly_rag_cost();
  RETURN current_cost >= (monthly_budget * threshold_percent);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get remaining budget
CREATE OR REPLACE FUNCTION get_remaining_rag_budget()
RETURNS DECIMAL AS $$
DECLARE
  monthly_budget CONSTANT DECIMAL := 5.00;
BEGIN
  RETURN monthly_budget - get_monthly_rag_cost();
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE rag_usage IS 'Tracks API usage costs for RAG operations to enforce $5/month budget';
COMMENT ON FUNCTION get_monthly_rag_cost() IS 'Returns total RAG costs for current month';
COMMENT ON FUNCTION is_approaching_rag_budget(DECIMAL) IS 'Returns true if current month costs exceed threshold (default 80%)';
COMMENT ON FUNCTION get_remaining_rag_budget() IS 'Returns remaining budget for current month';
