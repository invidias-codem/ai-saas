-- ============================================================================
-- VDI-6: Artifact sharing grants — one evidence-backed artifact, two agents.
--
-- Invariants:
--   - The artifact NEVER copies: retrieval REFERENCES the original evidence
--     row; provenance (producer workspace, agent, content hash, timestamps)
--     is preserved on every retrieval.
--   - Access is grant-mediated per request: every retrieval checks the
--     CURRENT grant state — no cached access.
--   - Revocation blocks the NEXT retrieval (and every one after).
--   - Grants are explicit and scoped: artifact → grantee workspace (+agent).
--   - Third workspaces are denied — no grant row names them.
--   - Reference semantics: a retrieval log records each access for audit
--     without duplicating content.
--   - Hardening matches the VDI plane: service_role only; search_path pinned.
-- ============================================================================

create table if not exists vdi_artifact_grants (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,        -- idempotency for grant creation
  artifact_evidence_id uuid not null references vdi_evidence(id) on delete cascade,
  producer_tenant text not null,
  producer_workspace text not null,
  grantee_tenant text not null,
  grantee_workspace text not null,
  grantee_agent text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One ACTIVE grant per (artifact, grantee workspace, agent).
create unique index if not exists uq_vdi_artifact_grants_active
  on vdi_artifact_grants(artifact_evidence_id, grantee_workspace, grantee_agent)
  where revoked_at is null;

create index if not exists idx_vdi_artifact_grants_grantee
  on vdi_artifact_grants(grantee_workspace, grantee_agent);

-- Retrieval audit: reference-only access log (no content copied).
create table if not exists vdi_artifact_retrievals (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references vdi_artifact_grants(id) on delete cascade,
  artifact_evidence_id uuid not null references vdi_evidence(id) on delete cascade,
  retrieved_by_workspace text not null,
  retrieved_by_agent text not null,
  retrieved_at timestamptz not null default now()
);

create index if not exists idx_vdi_artifact_retrievals_grant
  on vdi_artifact_retrievals(grant_id, retrieved_at desc);

-- ============================================================================
-- RPC: grant creation — idempotent by operation key; conflicting binding
-- refused (same discipline as budget admission).
-- ============================================================================
create or replace function vdi_grant_artifact_access(
  p_operation_key text,
  p_artifact_evidence_id uuid,
  p_producer_tenant text,
  p_producer_workspace text,
  p_grantee_tenant text,
  p_grantee_workspace text,
  p_grantee_agent text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  ex record;
  artifact record;
begin
  -- Ownership: vdi_evidence carries no tenant columns; ownership derives
  -- through its desktop row (evidence → vdi_desktops → tenant/workspace).
  select d.tenant_id, d.workspace_id into artifact
    from vdi_evidence e join vdi_desktops d on d.id = e.desktop_id
   where e.id = p_artifact_evidence_id for update of e;
  if artifact.workspace_id is null
     or artifact.tenant_id <> p_producer_tenant
     or artifact.workspace_id <> p_producer_workspace then
    return json_build_object('granted', false, 'reason', 'artifact not owned by producer scope');
  end if;

  select * into ex from vdi_artifact_grants
   where operation_key = p_operation_key for update;
  if ex.operation_key is not null then
    if ex.artifact_evidence_id = p_artifact_evidence_id
       and ex.grantee_workspace = p_grantee_workspace
       and ex.grantee_agent = p_grantee_agent then
      return json_build_object('granted', true, 'replay', true, 'grant_id', ex.id);
    end if;
    return json_build_object('granted', false, 'reason', 'conflicting replay: same key, different binding');
  end if;

  insert into vdi_artifact_grants (operation_key, artifact_evidence_id,
    producer_tenant, producer_workspace, grantee_tenant, grantee_workspace, grantee_agent)
  values (p_operation_key, p_artifact_evidence_id,
    p_producer_tenant, p_producer_workspace, p_grantee_tenant, p_grantee_workspace, p_grantee_agent)
  returning id into ex.id;
  return json_build_object('granted', true, 'replay', false, 'grant_id', ex.id);
end $$;

-- ============================================================================
-- RPC: retrieval — checks the CURRENT grant on EVERY call. Revocation blocks
-- the next request. Returns the artifact's provenance by REFERENCE (content
-- hash + producer), never duplicating content into the grantee's store.
-- ============================================================================
create or replace function vdi_retrieve_shared_artifact(
  p_artifact_evidence_id uuid,
  p_grantee_workspace text,
  p_grantee_agent text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  g record;
  a record;
begin
  -- THE per-request check: active grant for (artifact, grantee ws, agent).
  select * into g from vdi_artifact_grants
   where artifact_evidence_id = p_artifact_evidence_id
     and grantee_workspace = p_grantee_workspace
     and grantee_agent = p_grantee_agent
     and revoked_at is null
   order by granted_at desc
   limit 1
   for update;

  if g.id is null then
    return json_build_object('allowed', false, 'reason', 'no active grant');
  end if;

  select e.operation_type, e.metadata, e.recorded_at,
         d.tenant_id, d.workspace_id into a
    from vdi_evidence e join vdi_desktops d on d.id = e.desktop_id
   where e.id = p_artifact_evidence_id;
  if a.workspace_id is null then
    return json_build_object('allowed', false, 'reason', 'artifact missing');
  end if;

  -- Reference retrieval: audit row only; provenance from the ORIGINAL row.
  insert into vdi_artifact_retrievals (grant_id, artifact_evidence_id,
    retrieved_by_workspace, retrieved_by_agent)
  values (g.id, p_artifact_evidence_id, p_grantee_workspace, p_grantee_agent);

  return json_build_object(
    'allowed', true,
    'artifact_evidence_id', p_artifact_evidence_id,
    'provenance', json_build_object(
      'producer_tenant', a.tenant_id,
      'producer_workspace', a.workspace_id,
      'operation_type', a.operation_type,
      'recorded_at', a.recorded_at,
      'metadata', a.metadata),
    'reference_only', true);
end $$;

-- ============================================================================
-- RPC: revocation — the grant row flips; the NEXT retrieval is denied.
-- Idempotent: revoking an already-revoked grant is a no-op success.
-- ============================================================================
create or replace function vdi_revoke_artifact_access(
  p_artifact_evidence_id uuid,
  p_grantee_workspace text,
  p_grantee_agent text,
  p_revoked_by text,
  p_reason text,
  p_now timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  g record;
begin
  select * into g from vdi_artifact_grants
   where artifact_evidence_id = p_artifact_evidence_id
     and grantee_workspace = p_grantee_workspace
     and grantee_agent = p_grantee_agent
     and revoked_at is null
   order by granted_at desc
   limit 1
   for update;

  if g.id is null then
    return true; -- already revoked (or never granted): idempotent
  end if;

  update vdi_artifact_grants
     set revoked_at = p_now, revoked_by = p_revoked_by, revoked_reason = p_reason
   where id = g.id;
  return true;
end $$;

alter table vdi_artifact_grants enable row level security;
alter table vdi_artifact_retrievals enable row level security;

create policy "service_role manages vdi_artifact_grants"
  on vdi_artifact_grants for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_artifact_retrievals"
  on vdi_artifact_retrievals for all
  using (auth.role() = 'service_role');

-- EXECUTE hardening (Postgres grants to PUBLIC by default; security-definer
-- functions ignore RLS).
do $$
declare
  fn record;
begin
  for fn in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'vdi_%'
  loop
    execute format('revoke execute on function %s from public', fn.sig);
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
end $$;
