-- Migration: Add match_code_embeddings RPC function
-- Executed via a RPC function in Supabase to calculate cosine distance for vectors.

CREATE OR REPLACE FUNCTION match_code_embeddings (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_repo TEXT,
  filter_workspace_id UUID
) RETURNS TABLE (
  id UUID,
  file_path TEXT,
  content_chunk TEXT,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    github_embeddings.id,
    github_embeddings.file_path,
    github_embeddings.content_chunk,
    1 - (github_embeddings.embedding <=> query_embedding) AS similarity
  FROM github_embeddings
  WHERE github_embeddings.workspace_id = filter_workspace_id
    AND github_embeddings.repo_full_name = filter_repo
    AND 1 - (github_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY github_embeddings.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
