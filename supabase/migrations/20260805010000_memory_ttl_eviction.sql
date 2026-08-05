-- ============================================================
-- Migration: 20260805010000_memory_ttl_eviction.sql
-- Purpose: Add TTL/usage tracking to workspace_memories and
--          provide automated expired-memory cleanup.
-- ============================================================

-- 1. Add TTL and usage tracking columns
ALTER TABLE public.workspace_memories
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 1;

-- 2. Index for efficient TTL cleanup queries
CREATE INDEX IF NOT EXISTS idx_workspace_memories_expires
  ON public.workspace_memories(expires_at)
  WHERE expires_at IS NOT NULL;

-- 3. Automated eviction RPC
CREATE OR REPLACE FUNCTION purge_expired_workspace_memories()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.workspace_memories
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
