-- ============================================================
-- Migration: 20260514101500_add_ai_output_audit_explanation
-- Purpose:   Repair ai_output_audit schema drift by adding the
--            explanation column when older environments created
--            the table from the earlier world-model schema.
--
-- Background:
--   - 20260304000003_world_model_schema.sql creates ai_output_audit
--     without explanation.
--   - 20260305000000_delta_engine_schema.sql defines explanation,
--     but CREATE TABLE IF NOT EXISTS does not evolve an existing table.
--
-- Runtime symptom:
--   PGRST204: Could not find the 'explanation' column of
--   'ai_output_audit' in the schema cache.
-- ============================================================

ALTER TABLE ai_output_audit
ADD COLUMN IF NOT EXISTS explanation TEXT;

COMMENT ON COLUMN ai_output_audit.explanation IS
  'Human-readable explanation for the audit verdict or graph lookup result.';
