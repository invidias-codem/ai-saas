-- Knowledge Graph Tables

-- Enable vector extension if not already enabled (should be from previous setup)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Graph Nodes
CREATE TABLE IF NOT EXISTS graph_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'person', 'project', 'technology', 'organization'
  description TEXT,
  embedding vector(1536), -- For semantic search of entities
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB,
  -- Ensure unique entities per type for a user
  UNIQUE(user_id, name, type)
);

-- Indexes for Nodes
CREATE INDEX IF NOT EXISTS distinct_node_type_idx ON graph_nodes(type);
CREATE INDEX IF NOT EXISTS node_user_id_idx ON graph_nodes(user_id);
-- HNSW index for vector search on nodes
CREATE INDEX IF NOT EXISTS graph_nodes_embedding_idx ON graph_nodes USING hnsw (embedding vector_cosine_ops);

-- RLS for Nodes
ALTER TABLE graph_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own nodes"
  ON graph_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own nodes"
  ON graph_nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own nodes"
  ON graph_nodes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own nodes"
  ON graph_nodes FOR DELETE
  USING (auth.uid() = user_id);


-- 2. Graph Edges
CREATE TABLE IF NOT EXISTS graph_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_node_id UUID REFERENCES graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID REFERENCES graph_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL, -- e.g., 'uses', 'authored', 'part_of'
  weight FLOAT DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB,
  -- Prevent duplicate edges of same type between same nodes
  UNIQUE(source_node_id, target_node_id, relation)
);

-- Indexes for Edges
CREATE INDEX IF NOT EXISTS edge_source_idx ON graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS edge_target_idx ON graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS edge_user_id_idx ON graph_edges(user_id);

-- RLS for Edges
ALTER TABLE graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own edges"
  ON graph_edges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own edges"
  ON graph_edges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own edges"
  ON graph_edges FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own edges"
  ON graph_edges FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Helper Functions

-- Function to match nodes by embedding (semantic search)
CREATE OR REPLACE FUNCTION match_nodes(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
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
