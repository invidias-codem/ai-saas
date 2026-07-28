-- Migration: Per-Task Token Metrics for OTel Analytics
-- Date: 2026-07-27
-- Purpose: Record token consumption per conversation/code task for ranking,
--          efficiency tuning, and LLM behavior analysis.
-- Related: lib/ucol/postGenerationPipeline.ts, lib/llm/conversationEngine.ts

-- ─── Table: task_token_metrics ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_token_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  conversation_id TEXT,
  request_id      TEXT NOT NULL,
  feature_type    TEXT NOT NULL CHECK (feature_type IN ('chat', 'code')),
  model_id        TEXT NOT NULL,
  provider        TEXT,
  intent_category TEXT,
  execution_mode  TEXT,
  tokens_in       BIGINT NOT NULL DEFAULT 0,
  tokens_out      BIGINT NOT NULL DEFAULT 0,
  total_tokens    BIGINT NOT NULL DEFAULT 0,
  cost_estimate   NUMERIC,
  bypass_credits  BOOLEAN DEFAULT FALSE,
  latency_ms      BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ranking queries
CREATE INDEX IF NOT EXISTS idx_task_token_metrics_user_created
  ON public.task_token_metrics (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_token_metrics_model_total
  ON public.task_token_metrics (model_id, total_tokens DESC);

CREATE INDEX IF NOT EXISTS idx_task_token_metrics_feature_created
  ON public.task_token_metrics (feature_type, created_at DESC);

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE public.task_token_metrics ENABLE ROW LEVEL SECURITY;

-- Users can view their own metrics
CREATE POLICY "Users can view own task token metrics"
  ON public.task_token_metrics
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Service role manages all writes
CREATE POLICY "Service role manages task token metrics"
  ON public.task_token_metrics
  FOR ALL
  USING (auth.role() = 'service_role');
