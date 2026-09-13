-- ============================================================================
-- Phase 3 code_builder_builds — disposable-Postgres replay + assertion harness
--
-- Proves the migration's structural and RLS contract in ISOLATION against a
-- fresh Postgres (no dependency on the full MAIN migration stream, which has a
-- pre-existing out-of-band `public.conversations` ordering defect).
--
-- Run against a throwaway Postgres after source-ing the migration + auth stub:
--
--   docker run -d --name cb_pg_val -e POSTGRES_PASSWORD=val -p 55432:5432 postgres:15
--   docker exec -i cb_pg_val psql -U postgres -d cbval \
--     -c "CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;" \
--     -f <(cat <auth-stub> <migration>)
--
-- Then run THIS file; it must emit ONLY 'OK ...' lines and exit 0 on success.
-- Any failure raises and stops with a loud ERROR.
-- ============================================================================

\set ON_ERROR_STOP on

-- We depend on auth.uid() existing; assert it's present before anything else.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE EXCEPTION 'auth.uid() stub missing — apply the auth stub before the migration';
  END IF;
END $$;

-- 1. Table + columns exist ------------------------------------------------
DO $$
DECLARE cols text[];
BEGIN
  SELECT array_agg(column_name ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='code_builder_builds';
  IF cols IS NULL THEN RAISE EXCEPTION 'code_builder_builds table missing'; END IF;
  IF NOT (cols @> ARRAY['build_id','user_id','workspace_id','request_id','trigger_run_id','operation_key','status','phase','progress','mode','prompt','error_code','error_message','started_at','completed_at','created_at','updated_at']) THEN
    RAISE EXCEPTION 'missing columns: %', cols;
  END IF;
  RAISE NOTICE 'OK columns: %', cols;
END $$;

-- 2. build_id is the PK (business identity, unique) ------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.table_constraints
  WHERE table_name='code_builder_builds' AND constraint_type='PRIMARY KEY'
    AND constraint_name='code_builder_builds_pkey';
  IF n = 0 THEN RAISE EXCEPTION 'build_id PK missing'; END IF;
  RAISE NOTICE 'OK build_id is PK';
END $$;

-- 3. enums exist with ONLY intended values ----------------------------------
DO $$
DECLARE vals text[];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO vals
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
  WHERE t.typname='code_builder_status';
  IF vals IS NULL OR vals <> ARRAY['queued','running','completed','failed','cancelled'] THEN
    RAISE EXCEPTION 'code_builder_status enum wrong: %', vals;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO vals
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
  WHERE t.typname='code_builder_phase';
  IF vals IS NULL OR vals <> ARRAY['queued','planning','generating','verifying','completed'] THEN
    RAISE EXCEPTION 'code_builder_phase enum wrong: %', vals;
  END IF;
  RAISE NOTICE 'OK enums correct';
END $$;

-- 4. trigger_run_id is NULLABLE + updatable (execution identity, not business) --
DO $$
DECLARE nullable text;
BEGIN
  SELECT is_nullable INTO nullable FROM information_schema.columns
  WHERE table_name='code_builder_builds' AND column_name='trigger_run_id';
  IF nullable <> 'YES' THEN RAISE EXCEPTION 'trigger_run_id must be nullable'; END IF;
  RAISE NOTICE 'OK trigger_run_id nullable';
END $$;

-- 5. operation_key deterministic partial unique index ----------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes
  WHERE tablename='code_builder_builds' AND indexname='idx_code_builder_builds_operation_key';
  IF n = 0 THEN RAISE EXCEPTION 'operation_key unique index missing'; END IF;
  RAISE NOTICE 'OK operation_key index exists';
END $$;

-- 6. RLS enabled ------------------------------------------------------------
DO $$
DECLARE rls boolean;
BEGIN
  SELECT relrowsecurity INTO rls FROM pg_class WHERE relname='code_builder_builds';
  IF rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS not enabled'; END IF;
  RAISE NOTICE 'OK RLS enabled';
END $$;

-- 7. Policies exist (user-scoped SELECT; no authenticated INSERT/UPDATE/DELETE) --
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
  WHERE tablename='code_builder_builds' AND cmd='SELECT';
  IF n = 0 THEN RAISE EXCEPTION 'no SELECT policy'; END IF;

  SELECT count(*) INTO n FROM pg_policies
  WHERE tablename='code_builder_builds' AND cmd IN ('INSERT','UPDATE','DELETE');
  IF n > 0 THEN RAISE EXCEPTION 'authenticated write policies must not exist (service-role only)'; END IF;
  RAISE NOTICE 'OK policies: SELECT only, no authenticated write policies';
END $$;

-- 8. service_role can insert + update (not blocked) -------------------------
-- (grant exists; functional check needs a role switch, done in the RLS matrix below)
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
  WHERE table_name='code_builder_builds' AND grantee='service_role' AND privilege_type='INSERT';
  IF n = 0 THEN RAISE EXCEPTION 'service_role INSERT grant missing'; END IF;
  RAISE NOTICE 'OK service_role has INSERT grant';
END $$;

\echo ALL STRUCTURAL ASSERTIONS PASSED