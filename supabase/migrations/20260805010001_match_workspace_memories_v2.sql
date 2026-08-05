-- ============================================================
-- Migration: 20260805010001_match_workspace_memories_v2.sql
-- Purpose: Versioned vector-match RPC with expiration filtering
--          and access-heat telemetry for workspace_memories.
-- ============================================================

CREATE OR REPLACE FUNCTION match_workspace_memories_v2 (
  query_embedding vector(768),
  target_workspace_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
) AS $$
BEGIN
  -- Touch access metadata on candidate rows without affecting ranking
  UPDATE public.workspace_memories wm
  SET
    last_accessed_at = NOW(),
    access_count = wm.access_count + 1
  WHERE wm.workspace_id = target_workspace_id
    AND (wm.expires_at IS NULL OR wm.expires_at > NOW())
    AND wm.embedding_768 IS NOT NULL
    AND (1 - (wm.embedding_768 <=> query_embedding)) > match_threshold;

  RETURN QUERY
  SELECT
    wm.id,
    wm.content,
    wm.metadata,
    (1 - (wm.embedding_768 <=> query_embedding))::FLOAT AS similarity,
    wm.created_at
  FROM public.workspace_memories wm
  WHERE wm.workspace_id = target_workspace_id
    AND (wm.expires_at IS NULL OR wm.expires_at > NOW())
    AND wm.embedding_768 IS NOT NULL
    AND (1 - (wm.embedding_768 <=> query_embedding)) > match_threshold
  ORDER BY
    wm.embedding_768 <=> query_embedding,
    wm.created_at DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
