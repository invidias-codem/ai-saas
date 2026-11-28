-- Auth stub for disposable-Postgres validation (mirrors Supabase's auth schema
-- minimally so the code_builder_builds RLS policy can resolve auth.uid()).
-- Real Supabase provides auth.uid() from the JWT; this lets us test the policy
-- shape in isolation without the full auth stack.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::text;
$$;

-- Roles present in real Supabase (created before the migration grants).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

-- Real Supabase grants service_role BYPASSRLS so server-side writes aren't
-- gated by RLS policies. Mirror that.
ALTER ROLE service_role BYPASSRLS;

-- public schema usage (lost on a fresh DROP/CREATE during validation reset).
GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;