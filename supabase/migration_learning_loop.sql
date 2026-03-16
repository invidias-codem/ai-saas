-- Learning Loop Tables for Genie Reinforcement
-- Run this migration in your Supabase SQL Editor

-- Enable the vector extension if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- Learning Patterns Table
-- Stores successful query-approach mappings
-- =============================================

CREATE TABLE IF NOT EXISTS learning_patterns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    query_type TEXT NOT NULL CHECK (query_type IN ('crypto', 'weather', 'news', 'stock', 'general')),
    query_pattern TEXT NOT NULL,
    query_embedding vector(768),
    successful_approach TEXT NOT NULL CHECK (successful_approach IN ('api', 'search', 'memory')),
    result_summary TEXT,
    confidence FLOAT DEFAULT 0.8,
    usage_count INTEGER DEFAULT 1,
    last_used TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_learning_patterns_user ON learning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_patterns_type ON learning_patterns(query_type);

-- Vector similarity index using HNSW
CREATE INDEX IF NOT EXISTS idx_learning_patterns_embedding ON learning_patterns 
    USING hnsw (query_embedding vector_cosine_ops);

-- =============================================
-- Learned Knowledge Table
-- Stores facts extracted from searches/conversations
-- =============================================

CREATE TABLE IF NOT EXISTS learned_knowledge (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT, -- NULL = global knowledge available to all
    topic TEXT NOT NULL,
    fact TEXT NOT NULL,
    fact_embedding vector(768),
    source_type TEXT NOT NULL CHECK (source_type IN ('search', 'api', 'conversation')),
    source_url TEXT,
    confidence FLOAT DEFAULT 0.8,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- NULL = never expires
    usage_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_user ON learned_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_topic ON learned_knowledge(topic);
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_expires ON learned_knowledge(expires_at);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS idx_learned_knowledge_embedding ON learned_knowledge 
    USING hnsw (fact_embedding vector_cosine_ops);

-- =============================================
-- RPC Functions for Vector Search
-- =============================================

-- Match learning patterns by similarity
CREATE OR REPLACE FUNCTION match_learning_patterns(
    query_embedding vector(768),
    filter_user_id TEXT,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    query_type TEXT,
    query_pattern TEXT,
    successful_approach TEXT,
    result_summary TEXT,
    confidence FLOAT,
    usage_count INTEGER,
    last_used TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lp.id,
        lp.user_id,
        lp.query_type,
        lp.query_pattern,
        lp.successful_approach,
        lp.result_summary,
        lp.confidence,
        lp.usage_count,
        lp.last_used,
        1 - (lp.query_embedding <=> query_embedding) AS similarity
    FROM learning_patterns lp
    WHERE lp.user_id = filter_user_id
      AND lp.query_embedding IS NOT NULL
      AND 1 - (lp.query_embedding <=> query_embedding) > match_threshold
    ORDER BY lp.query_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Match learned knowledge by similarity
CREATE OR REPLACE FUNCTION match_learned_knowledge(
    query_embedding vector(768),
    filter_user_id TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    topic TEXT,
    fact TEXT,
    source_type TEXT,
    source_url TEXT,
    confidence FLOAT,
    extracted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    usage_count INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lk.id,
        lk.user_id,
        lk.topic,
        lk.fact,
        lk.source_type,
        lk.source_url,
        lk.confidence,
        lk.extracted_at,
        lk.expires_at,
        lk.usage_count,
        1 - (lk.fact_embedding <=> query_embedding) AS similarity
    FROM learned_knowledge lk
    WHERE (filter_user_id IS NULL OR lk.user_id = filter_user_id OR lk.user_id IS NULL)
      AND lk.fact_embedding IS NOT NULL
      AND (lk.expires_at IS NULL OR lk.expires_at > NOW())
      AND 1 - (lk.fact_embedding <=> query_embedding) > match_threshold
    ORDER BY lk.fact_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_knowledge ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (make migration idempotent)
DROP POLICY IF EXISTS "Users can access own patterns" ON learning_patterns;
DROP POLICY IF EXISTS "Users can access own and global knowledge" ON learned_knowledge;

-- Users can access their own patterns
CREATE POLICY "Users can access own patterns" ON learning_patterns
    FOR ALL USING (true) WITH CHECK (true);

-- Users can access own knowledge + global knowledge
CREATE POLICY "Users can access own and global knowledge" ON learned_knowledge
    FOR ALL USING (true) WITH CHECK (true);

-- Grant access to service role
GRANT ALL ON learning_patterns TO service_role;
GRANT ALL ON learned_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION match_learning_patterns TO service_role;
GRANT EXECUTE ON FUNCTION match_learned_knowledge TO service_role;
