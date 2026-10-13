-- Acquisition Plane: A3's durable-state migration omitted RLS.
-- These are backend-only tables: the webhook and Trigger worker both use
-- acquisitionStore -> supabaseAdmin. Clients must not read raw evidence or
-- change provider identities, ingestion state, or spending authority directly.
-- Apply this file alone; do not bundle unrelated pending migrations.
begin;
set local lock_timeout = '5s';

alter table public.acquisition_requests enable row level security;
alter table public.acquisition_provider_runs enable row level security;
alter table public.acquisition_raw_evidence enable row level security;

revoke all on table
  public.acquisition_requests,
  public.acquisition_provider_runs,
  public.acquisition_raw_evidence
from public, anon, authenticated;

-- Table-level REVOKE does not remove independently granted column privileges.
-- Clear those too, confined to the same three backend-only tables.
do $revoke_columns$
declare
  target record;
begin
  for target in
    select c.relname, string_agg(quote_ident(a.attname), ', ' order by a.attnum) as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relname in (
      'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
    )
    group by c.relname
  loop
    execute format('revoke all (%s) on table public.%I from public, anon, authenticated',
      target.columns, target.relname);
  end loop;
end
$revoke_columns$;

grant select, insert, update, delete on table
  public.acquisition_requests,
  public.acquisition_provider_runs,
  public.acquisition_raw_evidence
to service_role;

-- Explicit backend-only policies document the intended access boundary.
-- Supabase's service_role already bypasses RLS. These policies also allow the
-- same backend role in environments without BYPASSRLS; no client policy exists.
drop policy if exists acquisition_requests_service_role on public.acquisition_requests;
create policy acquisition_requests_service_role on public.acquisition_requests
  for all to service_role using (true) with check (true);

drop policy if exists acquisition_provider_runs_service_role on public.acquisition_provider_runs;
create policy acquisition_provider_runs_service_role on public.acquisition_provider_runs
  for all to service_role using (true) with check (true);

drop policy if exists acquisition_raw_evidence_service_role on public.acquisition_raw_evidence;
create policy acquisition_raw_evidence_service_role on public.acquisition_raw_evidence
  for all to service_role using (true) with check (true);

commit;
