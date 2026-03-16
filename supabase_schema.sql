-- Supabase Database Schema for AI SaaS Application
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_deleted ON public.conversations(user_id, is_deleted);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- ============================================
-- MEMORIES TABLE (for RAG/Memory Bank)
-- ============================================
-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768), -- Adjust dimension based on your embedding model
    type TEXT NOT NULL DEFAULT 'general',
    confidence DECIMAL(3,2) DEFAULT 0.8,
    scope TEXT NOT NULL DEFAULT 'session',
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for vector similarity search
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON public.memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON public.memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON public.memories(expires_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- Conversations RLS Policies
CREATE POLICY "Users can view their own conversations"
    ON public.conversations FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can insert their own conversations"
    ON public.conversations FOR INSERT
    WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update their own conversations"
    ON public.conversations FOR UPDATE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can delete their own conversations"
    ON public.conversations FOR DELETE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Messages RLS Policies
CREATE POLICY "Users can view messages from their conversations"
    ON public.messages FOR SELECT
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

CREATE POLICY "Users can insert messages to their conversations"
    ON public.messages FOR INSERT
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

CREATE POLICY "Users can update messages in their conversations"
    ON public.messages FOR UPDATE
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

CREATE POLICY "Users can delete messages from their conversations"
    ON public.messages FOR DELETE
    USING (
        conversation_id IN (
            SELECT id FROM public.conversations 
            WHERE user_id = current_setting('request.jwt.claims', true)::json->>'sub'
        )
    );

-- Memories RLS Policies
CREATE POLICY "Users can view their own memories"
    ON public.memories FOR SELECT
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can insert their own memories"
    ON public.memories FOR INSERT
    WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update their own memories"
    ON public.memories FOR UPDATE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can delete their own memories"
    ON public.memories FOR DELETE
    USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on conversations
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    filter_user_id text
)
RETURNS TABLE (
    id uuid,
    content text,
    type text,
    confidence decimal,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        content,
        type,
        confidence,
        1 - (embedding <=> query_embedding) as similarity
    FROM public.memories
    WHERE user_id = filter_user_id
        AND (expires_at IS NULL OR expires_at > NOW())
        AND 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ============================================
-- GRANTS (if using service role key, these may not be necessary)
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table permissions
GRANT ALL ON public.conversations TO anon, authenticated;
GRANT ALL ON public.messages TO anon, authenticated;
GRANT ALL ON public.memories TO anon, authenticated;

-- Grant sequence permissions (for auto-increment if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
