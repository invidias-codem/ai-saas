-- SAFE MIGRATION: Enhanced Memory Bank Schema
-- This script works with existing functions and only adds new features
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Drop only conflicting functions
-- ============================================

-- Drop match_memories if it exists (this is the one causing conflicts)
DROP FUNCTION IF EXISTS match_memories(vector, double precision, integer, text);
DROP FUNCTION IF EXISTS match_memories(vector, float, integer, text);

-- Drop memory counter function if it exists (we'll recreate it)
DROP FUNCTION IF EXISTS update_memory_count() CASCADE;

-- ============================================
-- STEP 2: Add new tables
-- ============================================

-- User Profiles (for memory counter and metadata)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id TEXT PRIMARY KEY, -- Clerk user ID
    memory_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enhanced Memory Bank (rename old table if exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'memories') THEN
        ALTER TABLE public.memories RENAME TO memory_bank_old;
    END IF;
END $$;

-- Create new memory_bank table
CREATE TABLE IF NOT EXISTS public.memory_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    embedding VECTOR(768), -- Adjust dimension if needed
    type TEXT DEFAULT 'general',
    confidence DECIMAL(3,2) DEFAULT 0.8,
    scope TEXT DEFAULT 'session',
    extracted_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- User Integrations (consolidated from Firebase)
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    service_name TEXT CHECK (service_name IN ('github', 'trello', 'slack')) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT,
    scopes TEXT[],
    is_connected BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, service_name)
);

-- ============================================
-- STEP 3: Create indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_bank_user_id ON public.memory_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_bank_embedding ON public.memory_bank USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_memory_bank_expires_at ON public.memory_bank(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_bank_conversation ON public.memory_bank(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON public.user_integrations(user_id);

-- ============================================
-- STEP 4: Create NEW functions only
-- ============================================

-- Memory counter function (new)
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

-- Vector similarity search function (new)
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
    similarity FLOAT,
    source_conversation_id UUID
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
        memory_bank.source_conversation_id
    FROM public.memory_bank
    WHERE memory_bank.user_id = filter_user_id
        AND (memory_bank.expires_at IS NULL OR memory_bank.expires_at > now())
        AND 1 - (memory_bank.embedding <=> query_embedding) > match_threshold
    ORDER BY memory_bank.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================
-- STEP 5: Create triggers
-- ============================================

-- Drop existing triggers on NEW tables only
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
DROP TRIGGER IF EXISTS tr_update_memory_count ON public.memory_bank;

-- Trigger for user_profiles updated_at (reuse existing function)
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for memory counter
CREATE TRIGGER tr_update_memory_count
    AFTER INSERT OR DELETE ON public.memory_bank
    FOR EACH ROW
    EXECUTE FUNCTION update_memory_count();

-- ============================================
-- STEP 6: Enable RLS on new tables
-- ============================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable all for service role" ON public.user_profiles;
DROP POLICY IF EXISTS "Enable all for service role" ON public.memory_bank;
DROP POLICY IF EXISTS "Enable all for service role" ON public.user_integrations;

-- Create permissive policies for service role
CREATE POLICY "Enable all for service role" ON public.user_profiles
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.memory_bank
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service role" ON public.user_integrations
    FOR ALL TO authenticated, anon
    USING (true) WITH CHECK (true);

-- ============================================
-- STEP 7: Grant permissions
-- ============================================

GRANT ALL ON public.user_profiles TO authenticated, anon;
GRANT ALL ON public.memory_bank TO authenticated, anon;
GRANT ALL ON public.user_integrations TO authenticated, anon;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check new tables exist
SELECT 
    table_name, 
    (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN ('user_profiles', 'memory_bank', 'user_integrations')
ORDER BY table_name;

-- Check triggers on new tables
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND event_object_table IN ('user_profiles', 'memory_bank')
ORDER BY event_object_table, trigger_name;

-- Check new functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('update_memory_count', 'match_memories')
ORDER BY routine_name;

-- Test memory counter trigger
DO $$
DECLARE
    test_user_id TEXT := 'test_migration_user';
    initial_count INT;
    after_insert_count INT;
BEGIN
    -- Clean up test data if exists
    DELETE FROM public.memory_bank WHERE user_id = test_user_id;
    DELETE FROM public.user_profiles WHERE user_id = test_user_id;
    
    -- Insert a test memory
    INSERT INTO public.memory_bank (user_id, content, embedding)
    VALUES (test_user_id, 'test memory', array_fill(0, ARRAY[768])::vector);
    
    -- Check counter
    SELECT memory_count INTO after_insert_count 
    FROM public.user_profiles 
    WHERE user_id = test_user_id;
    
    IF after_insert_count = 1 THEN
        RAISE NOTICE '✅ Memory counter trigger working! Count: %', after_insert_count;
    ELSE
        RAISE WARNING '⚠️  Memory counter might not be working. Count: %', after_insert_count;
    END IF;
    
    -- Clean up
    DELETE FROM public.memory_bank WHERE user_id = test_user_id;
    DELETE FROM public.user_profiles WHERE user_id = test_user_id;
END $$;

-- Success message
SELECT '✅ Migration completed successfully! New tables: user_profiles, memory_bank, user_integrations' as status;
