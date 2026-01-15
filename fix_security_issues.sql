-- ==============================================================================
-- 1. Fix Mutable Function Search Paths
--    Security best practice: Explicitly set search_path to prevent hijacking.
--    NOTE: Signatures must match EXACTLY what is defined in the database.
-- ==============================================================================

-- 1.1 Trigger Functions (No arguments)
ALTER FUNCTION public.update_memory_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_expired_deleted_conversations() SET search_path = public, pg_temp;

-- 1.2 RPC Functions
-- match_memories_scoped(query_embedding VECTOR(768), match_threshold FLOAT, match_count INT, filter_user_id TEXT, filter_conversation_id UUID, include_global BOOLEAN)
ALTER FUNCTION public.match_memories_scoped(vector, float, int, text, uuid, boolean) SET search_path = public, pg_temp;

-- upsert_slack_integration(p_slack_team_id text, p_slack_team_name text, p_access_token text, p_bot_user_id text, p_user_id uuid, p_encryption_key text)
ALTER FUNCTION public.upsert_slack_integration(text, text, text, text, uuid, text) SET search_path = public, pg_temp;

-- match_memories(p_user_id TEXT, query_embedding vector(768), match_threshold FLOAT, match_count INT)
ALTER FUNCTION public.match_memories(text, vector, float, int) SET search_path = public, pg_temp;

-- match_learning_patterns(query_embedding vector(768), filter_user_id TEXT, match_threshold FLOAT, match_count INT)
ALTER FUNCTION public.match_learning_patterns(vector, text, float, int) SET search_path = public, pg_temp;

-- match_nodes(query_embedding vector(1536), match_threshold float, match_count int, p_user_id uuid)
ALTER FUNCTION public.match_nodes(vector, float, int, text) SET search_path = public, pg_temp;

-- get_days_until_purge(p_deleted_at TIMESTAMPTZ)
ALTER FUNCTION public.get_days_until_purge(timestamptz) SET search_path = public, pg_temp;

-- match_learned_knowledge(query_embedding vector(768), filter_user_id TEXT, match_threshold FLOAT, match_count INT)
ALTER FUNCTION public.match_learned_knowledge(vector, text, float, int) SET search_path = public, pg_temp;


-- ==============================================================================
-- 2. Fix Permissive RLS Policies
-- ==============================================================================

-- Table: public.conversations
DROP POLICY IF EXISTS "Enable all for service role" ON public.conversations;
CREATE POLICY "Enable all for service role" ON public.conversations TO service_role USING (true) WITH CHECK (true);

-- Table: public.graph_edges
DROP POLICY IF EXISTS "Service role can do anything on edges" ON public.graph_edges;
CREATE POLICY "Service role can do anything on edges" ON public.graph_edges TO service_role USING (true) WITH CHECK (true);

-- Table: public.graph_nodes
DROP POLICY IF EXISTS "Service role can do anything on nodes" ON public.graph_nodes;
CREATE POLICY "Service role can do anything on nodes" ON public.graph_nodes TO service_role USING (true) WITH CHECK (true);

-- Table: public.memory_bank
DROP POLICY IF EXISTS "Enable all for service role" ON public.memory_bank;
CREATE POLICY "Enable all for service role" ON public.memory_bank TO service_role USING (true) WITH CHECK (true);

-- Table: public.memory_bank_old
DROP POLICY IF EXISTS "Enable all for service role" ON public.memory_bank_old;
-- Likely doesn't exist if you migrated fully, but safe to run if exists, else ignore error or wrap in DO block.
-- Assuming table exists since linter reported it.
CREATE POLICY "Enable all for service role" ON public.memory_bank_old TO service_role USING (true) WITH CHECK (true);

-- Table: public.messages
DROP POLICY IF EXISTS "Enable all for service role" ON public.messages;
CREATE POLICY "Enable all for service role" ON public.messages TO service_role USING (true) WITH CHECK (true);

-- Table: public.user_integrations
DROP POLICY IF EXISTS "Enable all for service role" ON public.user_integrations;
CREATE POLICY "Enable all for service role" ON public.user_integrations TO service_role USING (true) WITH CHECK (true);

-- Table: public.user_profiles
DROP POLICY IF EXISTS "Enable all for service role" ON public.user_profiles;
CREATE POLICY "Enable all for service role" ON public.user_profiles TO service_role USING (true) WITH CHECK (true);


-- ==============================================================================
-- 3. Fix "Users can..." Policies (Restrict to Owner)
-- ==============================================================================

-- 3.1 Table: public.learned_knowledge
-- 3.1 Table: public.learned_knowledge
DROP POLICY IF EXISTS "Users can access own and global knowledge" ON public.learned_knowledge;
DROP POLICY IF EXISTS "Users can view own and global knowledge" ON public.learned_knowledge;
DROP POLICY IF EXISTS "Users can modify own knowledge" ON public.learned_knowledge;

CREATE POLICY "Users can view own and global knowledge" ON public.learned_knowledge
    FOR SELECT
    USING ((auth.uid()::text = user_id) OR (user_id IS NULL));

CREATE POLICY "Users can modify own knowledge" ON public.learned_knowledge
    FOR ALL
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- 3.2 Table: public.learning_patterns
DROP POLICY IF EXISTS "Users can access own patterns" ON public.learning_patterns;

CREATE POLICY "Users can access own patterns" ON public.learning_patterns
    FOR ALL
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- 3.3 Table: public.memory_bank
DROP POLICY IF EXISTS "Users can access own memories" ON public.memory_bank;

CREATE POLICY "Users can access own memories" ON public.memory_bank
    FOR ALL
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);
