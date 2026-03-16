-- Enhanced Supabase Schema for Genie (Clerk-Compatible)
-- This is an improved version that works with Clerk authentication

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- CONVERSATIONS TABLE (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Clerk user ID (text, not UUID)
    title TEXT DEFAULT 'New Conversation',
    is_archived BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false, -- Soft delete
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_user_deleted ON public.conversations(user_id, is_deleted);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('user', 'assistant', 'bot', 'system')) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- ============================================
-- MEMORY BANK (Vector Storage for RAG)
-- ============================================
CREATE TABLE IF NOT EXISTS public.memory_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Clerk user ID
    source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- Adjust based on your embedding model (768 for some, 1536 for OpenAI)
    type TEXT DEFAULT 'general',
    confidence DECIMAL(3,2) DEFAULT 0.8,
    scope TEXT DEFAULT 'session',
    extracted_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_memory_bank_user_id ON public.memory_bank(user_id);
CREATE INDEX idx_memory_bank_embedding ON public.memory_bank USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memory_bank_expires_at ON public.memory_bank(expires_at);

-- ============================================
-- USER INTEGRATIONS (Secure Storage)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Clerk user ID
    service_name TEXT CHECK (service_name IN ('github', 'trello', 'slack')) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    scopes TEXT[],
    is_connected BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, service_name)
);

CREATE INDEX idx_user_integrations_user_id ON public.user_integrations(user_id);

-- ============================================
-- USER PROFILES (Optional - for memory counter)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id TEXT PRIMARY KEY, -- Clerk user ID
    memory_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Memory counter function
CREATE OR REPLACE FUNCTION update_memory_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.user_profiles (user_id, memory_count)
        VALUES (NEW.user_id, 1)
        ON CONFLICT (user_id) 
        DO UPDATE SET memory_count = user_profiles.memory_count + 1;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.user_profiles 
        SET memory_count = GREATEST(0, memory_count - 1)
        WHERE user_id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_memory_count
AFTER INSERT OR DELETE ON public.memory_bank
FOR EACH ROW EXECUTE FUNCTION update_memory_count();

-- ============================================
-- VECTOR SEARCH FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(768),
    match_threshold FLOAT,
    match_count INT,
    filter_user_id TEXT
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    type TEXT,
    confidence DECIMAL,
    similarity FLOAT
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
        1 - (memory_bank.embedding <=> query_embedding) AS similarity
    FROM public.memory_bank
    WHERE memory_bank.user_id = filter_user_id
        AND (memory_bank.expires_at IS NULL OR memory_bank.expires_at > now())
        AND 1 - (memory_bank.embedding <=> query_embedding) > match_threshold
    ORDER BY memory_bank.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Permissive policies for service role (backend operations)
CREATE POLICY "Enable all for service role" ON public.conversations
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.messages
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.memory_bank
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.user_integrations
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.user_profiles
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

-- ============================================
-- GRANTS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
