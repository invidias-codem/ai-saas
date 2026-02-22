-- Migration: Create logs table + Error Resolution Agent columns
-- Run this in Supabase SQL Editor if the logs table does not yet exist.

CREATE TABLE IF NOT EXISTS logs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level                  TEXT NOT NULL DEFAULT 'info',   -- 'error' | 'warn' | 'info' | 'debug'
  message                TEXT NOT NULL,
  source                 TEXT NOT NULL DEFAULT 'vercel',
  metadata               JSONB DEFAULT '{}',

  -- UCOL Error Resolution Agent columns
  resolution_status      TEXT DEFAULT NULL,  -- pending | classifying | exploring | generating | pr_open | resolved | needs_human | failed
  classification         TEXT DEFAULT NULL,  -- error category label
  classification_summary TEXT DEFAULT NULL,
  pr_url                 TEXT DEFAULT NULL,
  pr_number              INTEGER DEFAULT NULL,
  agent_error            TEXT DEFAULT NULL,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Efficient polling index for the resolution agent
CREATE INDEX IF NOT EXISTS idx_logs_resolution_pending
  ON logs (level, resolution_status, timestamp)
  WHERE level = 'error';

-- General purpose indexes
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level     ON logs (level);

COMMENT ON TABLE logs IS 'Vercel production logs ingested via Log Drain webhook. Error rows are processed by the UCOL Error Resolution Agent.';
COMMENT ON COLUMN logs.resolution_status IS 'pending | classifying | exploring | generating | pr_open | resolved | needs_human | failed';
COMMENT ON COLUMN logs.pr_url IS 'GitHub PR URL opened by the error resolution agent';
