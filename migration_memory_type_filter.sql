-- Migration: Add feature type filtering to memory search
-- Run this in Supabase SQL Editor

-- Drop existing function to update signature
DROP FUNCTION IF EXISTS match_memories(vector, double precision, integer, text);
DROP FUNCTION IF EXISTS match_memories(vector, float, integer, text);

-- Re-create match_memories with optional filter_feature_type
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    filter_user_id TEXT,
    filter_feature_type TEXT DEFAULT NULL -- New optional parameter
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    type TEXT,
    confidence DECIMAL,
    similarity FLOAT,
    source_conversation_id UUID,
    metadata JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        memory_bank.id,
        memory_bank.content,
        memory_bank.type,
        memory_bank.confidence,
        1 - (memory_bank.embedding <=> query_embedding) AS similarity,
        memory_bank.source_conversation_id,
        memory_bank.metadata
    FROM public.memory_bank
    WHERE memory_bank.user_id = filter_user_id
        AND (memory_bank.expires_at IS NULL OR memory_bank.expires_at > now())
        AND 1 - (memory_bank.embedding <=> query_embedding) > match_threshold
        -- Filter by feature type if provided (checks metadata->>'featureType' or top-level type if you used that)
        -- Assuming featureType is stored in metadata based on my analysis of captureMemory
        AND (filter_feature_type IS NULL OR memory_bank.metadata->>'featureType' = filter_feature_type)
    ORDER BY memory_bank.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

SELECT '✅ Migration completed: match_memories updated with feature type filtering.' as status;
