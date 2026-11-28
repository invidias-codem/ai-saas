-- ============================================================================
-- VDI function hardening (Activation A correction).
--
-- Postgres grants EXECUTE on functions to PUBLIC by default. Every VDI RPC
-- is SECURITY DEFINER (runs as the table owner, ignoring RLS), so without
-- explicit revokes ANY role — including Supabase's `anon` and
-- `authenticated` — could invoke privileged RPCs through PostgREST even
-- though table RLS would block direct reads.
--
-- Hardening: EXECUTE → service_role (and postgres/supabase_admin by
-- membership). All security-definer functions already carry
-- `set search_path = public` in their definitions; this migration verifies
-- that contract and fails loudly if any function is missing it.
-- ============================================================================

-- Revoke EXECUTE from PUBLIC and all authenticated-style roles on every
-- vdi_* function; grant explicitly to service_role only.
do $$
declare
  fn record;
  missing_searchpath text[];
  role_exists boolean;
begin
  for fn in select p.oid::regprocedure as sig, p.proname as name
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'vdi_%'
  loop
    -- PUBLIC always exists: the grant that matters to remove.
    execute format('revoke execute on function %s from public', fn.sig);
    -- anon/authenticated exist on Supabase; on vanilla installs they may
    -- not — revoke only from roles that exist so the migration is robust.
    if exists(select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', fn.sig);
    end if;
    if exists(select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke execute on function %s from authenticated', fn.sig);
    end if;
    if exists(select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;

  -- Contract check: every security-definer vdi_* function must pin
  -- search_path = public (proconfig). Fail the migration otherwise.
  select array_agg(p.proname) into missing_searchpath
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'vdi_%'
     and p.prosecdef
     and (p.proconfig is null or not ('search_path=public' = any (p.proconfig)));
  if missing_searchpath is not null then
    raise exception 'security-definer vdi_* functions missing search_path=public: %', missing_searchpath;
  end if;
end $$;

-- Table privileges: belt-and-braces (RLS is the primary control, but the
-- grants must not leak either). Enumerate tables explicitly — `all` cannot
-- be combined with a name pattern. anon/authenticated may not exist on
-- vanilla installs; guard the revokes.
do $$
declare
  tbl record;
  has_anon boolean;
  has_auth boolean;
begin
  select exists(select 1 from pg_roles where rolname = 'anon') into has_anon;
  select exists(select 1 from pg_roles where rolname = 'authenticated') into has_auth;
  for tbl in select tablename from pg_tables where schemaname = 'public' and tablename like 'vdi_%'
  loop
    if has_anon then
      execute format('revoke all on public.%I from anon', tbl.tablename);
    end if;
    if has_auth then
      execute format('revoke all on public.%I from authenticated', tbl.tablename);
    end if;
    if exists(select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant select, insert, update, delete on public.%I to service_role', tbl.tablename);
    end if;
  end loop;
end $$;
