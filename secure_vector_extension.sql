-- ==============================================================================
-- Secure Vector Extension Migration
-- Goal: Move 'vector' extension from 'public' to 'extensions' schema to fix security lint.
-- ==============================================================================

-- 1. Create permissions for extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2. Move the extension
ALTER EXTENSION vector SET SCHEMA extensions;

-- 3. Update Database Search Path (Best Effort)
-- Ideally, you should set this in the Supabase Dashboard -> Settings -> API -> Extra search path
-- OR run: ALTER ROLE authenticator SET search_path TO "$user", public, extensions;
-- OR run: ALTER DATABASE postgres SET search_path TO "$user", public, extensions;
-- We will try to set it for the database here, but it might require superuser.
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- 4. Update Function Search Paths
-- Since functions were set to 'public, pg_temp', they will verify failing to find 'vector' type
-- unless we add 'extensions' to their search_path.

-- 4.1 RPC Functions using vector
ALTER FUNCTION public.match_memories_scoped(extensions.vector, float, int, text, uuid, boolean) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.match_memories(text, extensions.vector, float, int) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.match_learning_patterns(extensions.vector, text, float, int) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.match_nodes(extensions.vector, float, int, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.match_learned_knowledge(extensions.vector, text, float, int) SET search_path = public, extensions, pg_temp;

-- 4.2 Other Security Definer/search_path fixed functions (good practice to include extensions if they ever need it)
ALTER FUNCTION public.update_memory_count() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.purge_expired_deleted_conversations() SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.upsert_slack_integration(text, text, text, text, uuid, text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_days_until_purge(timestamptz) SET search_path = public, extensions, pg_temp;
