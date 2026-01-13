-- Fix Knowledge Graph Schema Issues (CORRECTED ORDER)
-- Run this in your Supabase SQL Editor

-- =====================================================
-- STEP 1: DROP ALL POLICIES FIRST (before altering columns)
-- =====================================================
DROP POLICY IF EXISTS "Users can insert their own nodes" ON graph_nodes;
DROP POLICY IF EXISTS "Users can select their own nodes" ON graph_nodes;
DROP POLICY IF EXISTS "Users can update their own nodes" ON graph_nodes;
DROP POLICY IF EXISTS "Users can delete their own nodes" ON graph_nodes;

DROP POLICY IF EXISTS "Users can insert their own edges" ON graph_edges;
DROP POLICY IF EXISTS "Users can select their own edges" ON graph_edges;
DROP POLICY IF EXISTS "Users can update their own edges" ON graph_edges;
DROP POLICY IF EXISTS "Users can delete their own edges" ON graph_edges;

-- =====================================================
-- STEP 2: DROP FOREIGN KEY CONSTRAINTS
-- =====================================================
ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS graph_nodes_user_id_fkey;
ALTER TABLE graph_edges DROP CONSTRAINT IF EXISTS graph_edges_user_id_fkey;

-- =====================================================
-- STEP 3: ALTER COLUMN TYPES
-- =====================================================
-- Change user_id from UUID to TEXT for Clerk compatibility
ALTER TABLE graph_nodes ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE graph_edges ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- =====================================================
-- STEP 4: FIX EMBEDDING DIMENSION (1536 -> 768)
-- =====================================================
-- Drop the index that depends on the column
DROP INDEX IF EXISTS graph_nodes_embedding_idx;

-- Alter the embedding column dimension
ALTER TABLE graph_nodes ALTER COLUMN embedding TYPE vector(768);

-- Recreate the HNSW index
CREATE INDEX IF NOT EXISTS graph_nodes_embedding_idx ON graph_nodes USING hnsw (embedding vector_cosine_ops);

-- =====================================================
-- STEP 5: UPDATE THE MATCH_NODES FUNCTION
-- =====================================================
DROP FUNCTION IF EXISTS match_nodes(vector(1536), float, int, uuid);
DROP FUNCTION IF EXISTS match_nodes(vector(768), float, int, uuid);
DROP FUNCTION IF EXISTS match_nodes(vector(768), float, int, text);

CREATE OR REPLACE FUNCTION match_nodes(
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
  similarity float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    graph_nodes.id,
    graph_nodes.name,
    graph_nodes.type,
    graph_nodes.description,
    1 - (graph_nodes.embedding <=> query_embedding) as similarity
  FROM graph_nodes
  WHERE graph_nodes.user_id = p_user_id
  AND 1 - (graph_nodes.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- =====================================================
-- STEP 6: RECREATE RLS POLICIES WITH TEXT COMPARISON
-- =====================================================
CREATE POLICY "Users can insert their own nodes"
  ON graph_nodes FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can select their own nodes"
  ON graph_nodes FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own nodes"
  ON graph_nodes FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own nodes"
  ON graph_nodes FOR DELETE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own edges"
  ON graph_edges FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can select their own edges"
  ON graph_edges FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own edges"
  ON graph_edges FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own edges"
  ON graph_edges FOR DELETE
  USING (auth.uid()::text = user_id);
