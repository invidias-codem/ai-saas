-- FIX VECTOR DIMENSIONS (AMBIGUITY FIX)
-- We need to drop the specific signatures of the functions to avoid "not unique" errors.

-- 1. Alter memory_bank table (Forces validation of 768 dimensions)
ALTER TABLE public.memory_bank 
ALTER COLUMN embedding TYPE vector(768);

-- 2. Alter graph_nodes table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'graph_nodes') THEN
        ALTER TABLE public.graph_nodes ALTER COLUMN embedding TYPE vector(768);
    END IF;
END $$;

-- 3. Drop ALL potential variations of match_memories explicitly
-- Dropping by signature is safer than generic name
DROP FUNCTION IF EXISTS match_memories(vector(3072), float, int, text);
DROP FUNCTION IF EXISTS match_memories(vector(768), float, int, text);
DROP FUNCTION IF EXISTS match_memories(vector, float, int, text);
-- Also drop the one with extra feature_type arg if it exists from a partial run
DROP FUNCTION IF EXISTS match_memories(vector(768), float, int, text, text);

-- 4. Re-create match_memories function (768 dims)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    filter_user_id TEXT,
    filter_feature_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    type TEXT,
    metadata JSONB,
    similarity FLOAT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        memory_bank.id,
        memory_bank.content,
        memory_bank.type,
        memory_bank.metadata,
        1 - (memory_bank.embedding <=> query_embedding) AS similarity,
        memory_bank.extracted_at as created_at
    FROM public.memory_bank
    WHERE memory_bank.user_id = filter_user_id
        AND (memory_bank.expires_at IS NULL OR memory_bank.expires_at > now())
        AND (filter_feature_type IS NULL OR memory_bank.metadata->>'featureType' = filter_feature_type)
        AND 1 - (memory_bank.embedding <=> query_embedding) > match_threshold
    ORDER BY memory_bank.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 5. Drop ALL potential variations of match_nodes
DROP FUNCTION IF EXISTS match_nodes(vector(3072), float, int, text);
DROP FUNCTION IF EXISTS match_nodes(vector(768), float, int, text);
DROP FUNCTION IF EXISTS match_nodes(vector, float, int, text);

-- 6. Re-create match_nodes function (768 dims)
CREATE OR REPLACE FUNCTION match_nodes(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    p_user_id TEXT
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    type TEXT,
    description TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        graph_nodes.id,
        graph_nodes.name,
        graph_nodes.type,
        graph_nodes.description,
        1 - (graph_nodes.embedding <=> query_embedding) AS similarity
    FROM public.graph_nodes
    WHERE graph_nodes.user_id = p_user_id
        AND 1 - (graph_nodes.embedding <=> query_embedding) > match_threshold
    ORDER BY graph_nodes.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
