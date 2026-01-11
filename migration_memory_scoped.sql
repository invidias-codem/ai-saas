-- Conversation-Scoped Memory Isolation
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Create scoped memory query function
-- ============================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS match_memories_scoped(vector, float, integer, text, uuid, boolean);

-- Create new scoped function
CREATE OR REPLACE FUNCTION match_memories_scoped(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    filter_user_id TEXT,
    filter_conversation_id UUID,
    include_global BOOLEAN DEFAULT false
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    type TEXT,
    confidence DECIMAL,
    similarity FLOAT,
    source_conversation_id UUID,
    scope TEXT
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
        memory_bank.scope
    FROM public.memory_bank
    WHERE memory_bank.user_id = filter_user_id
        AND (memory_bank.expires_at IS NULL OR memory_bank.expires_at > now())
        AND (
            -- Memories from this specific conversation
            memory_bank.source_conversation_id = filter_conversation_id
            OR
            -- Global memories (if enabled)
            (include_global AND memory_bank.scope = 'persistent')
        )
        AND 1 - (memory_bank.embedding <=> query_embedding) > match_threshold
    ORDER BY memory_bank.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- STEP 2: Update existing memories to conversation scope
-- ============================================

-- Update all existing memories to use 'conversation' scope
-- This prevents context bleeding
UPDATE public.memory_bank
SET scope = 'conversation'
WHERE scope = 'persistent' OR scope = 'session' OR scope IS NULL;

-- Optionally, mark high-confidence personal info as global
-- Uncomment if you want some memories to be global by default
/*
UPDATE public.memory_bank
SET scope = 'persistent'
WHERE type IN ('personal_info', 'preference')
AND confidence > 0.9;
*/

-- ============================================
-- STEP 3: Verify changes
-- ============================================

-- Check function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'match_memories_scoped';

-- Check memory scopes
SELECT 
    scope,
    COUNT(*) as count
FROM public.memory_bank
GROUP BY scope
ORDER BY count DESC;

-- Test scoped query (replace with actual values)
-- SELECT * FROM match_memories_scoped(
--     array_fill(0, ARRAY[768])::vector,  -- placeholder embedding
--     0.5,                                  -- threshold
--     10,                                   -- limit
--     'your-user-id',                       -- user_id
--     'conversation-uuid',                  -- conversation_id
--     false                                 -- include_global
-- );

-- Success message
SELECT '✅ Conversation-scoped memory isolation enabled!' as status;
