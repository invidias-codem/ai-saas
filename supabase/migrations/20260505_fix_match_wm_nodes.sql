-- ============================================================
-- Migration: 20260505_fix_match_wm_nodes
-- Purpose:   Fix match_wm_nodes to accept `text` for user_id
--            instead of `uuid` to correctly handle Clerk IDs,
--            and restore the correct projection join logic.
-- ============================================================

CREATE OR REPLACE FUNCTION match_wm_nodes (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id text
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  similarity float,
  trust_tier trust_tier
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id::uuid,
    v.name,
    v.type,
    v.description,
    1 - (gn.embedding <=> query_embedding) AS similarity,
    v.trust_tier
  FROM wm_nodes_view v
  JOIN graph_nodes gn ON gn.id = v.id::uuid
  WHERE v.user_id = p_user_id
    AND gn.embedding IS NOT NULL
    AND 1 - (gn.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;
