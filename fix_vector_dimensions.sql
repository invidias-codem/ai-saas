-- FIX VECTOR DIMENSIONS (ROBUST INDEX CLEANUP)
-- PROBLEM: Tables have hidden/named indexes (hnsw/ivfflat) that enforce <2000 dims.
-- SOLUTION: Dynamic script to find and drop ALL indexes on the 'embedding' column.

-- 1. Dynamic Index Drop Block
DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- Find and drop all indexes on memory_bank.embedding
    FOR r IN 
        SELECT i.relname as index_name
        FROM pg_class t, pg_class i, pg_index ix, pg_attribute a
        WHERE t.oid = ix.indrelid 
          AND i.oid = ix.indexrelid 
          AND a.attrelid = t.oid 
          AND a.attnum = ANY(ix.indkey) 
          AND t.relname = 'memory_bank' 
          AND a.attname = 'embedding'
    LOOP 
        RAISE NOTICE 'Dropping index: %', r.index_name;
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.index_name); 
    END LOOP;

    -- Find and drop all indexes on graph_nodes.embedding
    FOR r IN 
        SELECT i.relname as index_name
        FROM pg_class t, pg_class i, pg_index ix, pg_attribute a
        WHERE t.oid = ix.indrelid 
          AND i.oid = ix.indexrelid 
          AND a.attrelid = t.oid 
          AND a.attnum = ANY(ix.indkey) 
          AND t.relname = 'graph_nodes' 
          AND a.attname = 'embedding'
    LOOP 
        RAISE NOTICE 'Dropping index: %', r.index_name;
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.index_name); 
    END LOOP;
END $$;

-- 2. Truncate tables to remove mismatched data
TRUNCATE TABLE public.memory_bank CASCADE;

-- 3. Alter memory_bank table (Now safe as no indexes exist)
ALTER TABLE public.memory_bank 
ALTER COLUMN embedding TYPE vector(3072);

-- 4. Alter graph_nodes table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'graph_nodes') THEN
        DELETE FROM public.graph_nodes; 
        ALTER TABLE public.graph_nodes ALTER COLUMN embedding TYPE vector(3072);
    END IF;
END $$;

-- 5. Cleanup functions (Remove all signature variations)
DROP FUNCTION IF EXISTS match_memories(vector(768), float, int, text);
DROP FUNCTION IF EXISTS match_memories(vector(3072), float, int, text);
DROP FUNCTION IF EXISTS match_memories(vector, float, int, text);
DROP FUNCTION IF EXISTS match_memories(vector(3072), float, int, text, text);

-- 6. Re-create match_memories function (3072 dims)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(3072),
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

-- 7. Cleanup graph functions
DROP FUNCTION IF EXISTS match_nodes(vector(768), float, int, text);
DROP FUNCTION IF EXISTS match_nodes(vector(3072), float, int, text);
DROP FUNCTION IF EXISTS match_nodes(vector, float, int, text);

-- 8. Re-create match_nodes function (3072 dims)
CREATE OR REPLACE FUNCTION match_nodes(
    query_embedding VECTOR(3072),
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
