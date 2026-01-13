-- Memory System Schema for Genie
-- Run this in Supabase SQL Editor to create all required tables

-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- Memory Bank Table (Main memory storage)
-- =============================================

CREATE TABLE IF NOT EXISTS memory_bank (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    type TEXT DEFAULT 'general', -- 'preference', 'personal_info', 'question', 'general'
    confidence FLOAT DEFAULT 0.8,
    scope TEXT DEFAULT 'conversation' CHECK (scope IN ('conversation', 'user')), -- Tiered memory
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    promoted_at TIMESTAMPTZ -- When promoted from conversation to user scope
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_bank_user ON memory_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_bank_scope ON memory_bank(scope);
CREATE INDEX IF NOT EXISTS idx_memory_bank_type ON memory_bank(type);
CREATE INDEX IF NOT EXISTS idx_memory_bank_conversation ON memory_bank(source_conversation_id);

-- Vector similarity index
CREATE INDEX IF NOT EXISTS idx_memory_bank_embedding ON memory_bank 
    USING hnsw (embedding vector_cosine_ops);

-- =============================================
-- Match Memories RPC Function (Vector Similarity Search)
-- =============================================

DROP FUNCTION IF EXISTS match_memories;

CREATE OR REPLACE FUNCTION match_memories(
    p_user_id TEXT,
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    content TEXT,
    type TEXT,
    confidence FLOAT,
    scope TEXT,
    source_conversation_id UUID,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mb.id,
        mb.user_id,
        mb.content,
        mb.type,
        mb.confidence,
        mb.scope,
        mb.source_conversation_id,
        1 - (mb.embedding <=> query_embedding) AS similarity
    FROM memory_bank mb
    WHERE mb.user_id = p_user_id
      AND mb.embedding IS NOT NULL
      AND 1 - (mb.embedding <=> query_embedding) > match_threshold
    ORDER BY mb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE memory_bank ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on memory_bank" ON memory_bank
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to access their own memories
CREATE POLICY "Users can access own memories" ON memory_bank
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- =============================================
-- Grants
-- =============================================

GRANT ALL ON memory_bank TO service_role;
GRANT EXECUTE ON FUNCTION match_memories TO service_role;

-- =============================================
-- Update trigger for updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_memory_bank_updated_at ON memory_bank;

CREATE TRIGGER update_memory_bank_updated_at
    BEFORE UPDATE ON memory_bank
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
