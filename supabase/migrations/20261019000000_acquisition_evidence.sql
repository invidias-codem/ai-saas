-- A4 (issue #417): canonical evidence storage. A3 stages raw evidence
-- durably ("NOT normalized — A4 owns it"); this is the A4 side of that seam.
-- The table is backend-only: the Trigger worker normalizes via
-- acquisitionStore -> supabaseAdmin. Clients must not read evidence or
-- mutation state directly.
-- Apply this file alone; do not bundle unrelated pending migrations.
begin;
set local lock_timeout = '5s';

create table if not exists acquisition_evidence (
  id text primary key,
  acquisition_request_id uuid not null references acquisition_requests(id),
  provider_run_id text not null,
  platform text not null,
  resource_type text not null,
  access_state text not null,
  raw_content_hash text not null,
  evidence_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_acq_evidence_run
  on acquisition_evidence(provider_run_id);
create index if not exists idx_acq_evidence_request
  on acquisition_evidence(acquisition_request_id);
create index if not exists idx_acq_evidence_access
  on acquisition_evidence(access_state);

-- A4 normalization bookkeeping on the provider run itself: normalized count
-- plus the explicit typed failure rows (rowIndex + error), never hidden.
alter table acquisition_provider_runs
  add column if not exists normalized_count integer;
alter table acquisition_provider_runs
  add column if not exists normalization_failures jsonb;

alter table public.acquisition_evidence enable row level security;

revoke all on table public.acquisition_evidence
from public, anon, authenticated;

-- Table-level REVOKE does not remove independently granted column privileges.
-- Clear those too, confined to this backend-only table.
do $revoke_columns$
declare
  target record;
begin
  for target in
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) as columns
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relname = 'acquisition_evidence'
    group by c.relname
  loop
    execute format('revoke all (%s) on table public.acquisition_evidence from public, anon, authenticated',
      target.columns);
  end loop;
end
$revoke_columns$;

grant select, insert, update, delete on table
  public.acquisition_evidence
to service_role;

-- Explicit backend-only policy documents the intended access boundary.
-- Supabase's service_role already bypasses RLS; this also allows the same
-- backend role in environments without BYPASSRLS. No client policy exists.
drop policy if exists acquisition_evidence_service_role on public.acquisition_evidence;
create policy acquisition_evidence_service_role on public.acquisition_evidence
  for all to service_role using (true) with check (true);

commit;
