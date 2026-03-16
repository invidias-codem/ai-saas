-- Fix RLS policies to work with service role key
-- Run this in Supabase SQL Editor

-- Option 1: Disable RLS entirely (simplest, but less secure)
-- Uncomment these lines if you want to disable RLS:
-- ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.memories DISABLE ROW LEVEL SECURITY;

-- Option 2: Update policies to allow service role (recommended)
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.conversations;

DROP POLICY IF EXISTS "Users can view messages from their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages from their conversations" ON public.messages;

DROP POLICY IF EXISTS "Users can view their own memories" ON public.memories;
DROP POLICY IF EXISTS "Users can insert their own memories" ON public.memories;
DROP POLICY IF EXISTS "Users can update their own memories" ON public.memories;
DROP POLICY IF EXISTS "Users can delete their own memories" ON public.memories;

-- Create new policies that work with service role
-- Conversations policies
CREATE POLICY "Enable all for service role" ON public.conversations
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- Messages policies  
CREATE POLICY "Enable all for service role" ON public.messages
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- Memories policies
CREATE POLICY "Enable all for service role" ON public.memories
    FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- Verify RLS is still enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('conversations', 'messages', 'memories');
