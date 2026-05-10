-- Migration: Error Resolution Agent columns on the logs table
-- Adds autonomous resolution pipeline state tracking.
-- Run: supabase db push OR execute directly in Supabase SQL editor.

-- Add resolution pipeline columns
ALTER TABLE logs
  ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS classification_summary TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pr_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pr_number INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for efficient polling of pending errors
CREATE INDEX IF NOT EXISTS idx_logs_resolution_pending
  ON logs (level, resolution_status, timestamp)
  WHERE level = 'error';

-- Comment for documentation
COMMENT ON COLUMN logs.resolution_status IS
  'UCOL agent pipeline status: pending | classifying | exploring | generating | pr_open | resolved | needs_human | failed';
COMMENT ON COLUMN logs.pr_url IS
  'GitHub PR URL opened by the error resolution agent';
COMMENT ON COLUMN logs.pr_number IS
  'GitHub PR number opened by the error resolution agent';
