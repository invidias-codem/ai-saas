-- ============================================================================
-- VDI-3C: Alerts and usage accounting.
--
-- Invariants:
--   - One OPEN alert per (desktop, rule, generation): repeated/concurrent
--     evaluation UPDATES the existing alert (first_wins on open, last_write
--     on evidence refresh) instead of opening duplicates.
--   - Alerts resolve only on FRESH evidence; missing/stale observations
--     never imply recovery.
--   - Usage accounting is idempotent per (resource, interval): replayed
--     intervals cannot double-count. Intervals split at lifecycle transitions
--     and gaps are marked explicitly — a current observation alone cannot
--     establish historical runtime.
--   - Estimates keep their rate + version and stay distinguishable from
--     measured usage and provider-reported charges. Unavailable pricing
--     remains unknown (NULL), never zero.
-- ============================================================================

create table if not exists vdi_alerts (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  tenant_id text not null,
  workspace_id text not null,
  rule text not null,                     -- 'provider_unreachable' | 'display_failed' | 'lifecycle_divergence' | 'resource_quarantined' | 'idle_allocation' (advisory)
  severity text not null,                 -- 'critical' | 'warning' | 'advisory'
  generation integer not null,            -- relevant desktop generation
  status text not null default 'open',   -- 'open' | 'resolved'
  first_observed_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_evidence_at timestamptz,     -- the observation timestamp that justified resolution
  detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- THE deduplication guarantee: one OPEN alert per desktop+rule+generation.
-- Resolution is keyed on a separate partial index so a resolved alert can
-- coexist with a new open alert for a later generation.
create unique index if not exists uq_vdi_alerts_open
  on vdi_alerts(desktop_id, rule, generation)
  where status = 'open';

create index if not exists idx_vdi_alerts_workspace
  on vdi_alerts(workspace_id, status);
create index if not exists idx_vdi_alerts_tenant
  on vdi_alerts(tenant_id, status);

-- Race-safe open/update/resolve: re-evaluating an existing open alert updates
-- last_evaluated_at instead of duplicating; resolution requires the
-- observation to be NEWER than the alert's last evaluation.
create or replace function vdi_upsert_alert(
  p_desktop_id uuid,
  p_tenant_id text,
  p_workspace_id text,
  p_rule text,
  p_severity text,
  p_generation integer,
  p_detail jsonb,
  p_resolve boolean,
  p_evidence_at timestamptz,
  p_now timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid;
  existing_last_eval timestamptz;
begin
  select id, last_evaluated_at into existing_id, existing_last_eval
    from vdi_alerts
   where desktop_id = p_desktop_id and rule = p_rule and generation = p_generation
     and status = 'open'
   for update;

  if p_resolve then
    if existing_id is null then
      return null; -- nothing open to resolve
    end if;
    -- STALE evidence cannot resolve: the justifying observation must be newer
    -- than the alert's last evaluation (missing observations never imply
    -- recovery either — caller only passes evidence from a real observation).
    if p_evidence_at is null or p_evidence_at <= existing_last_eval then
      return existing_id; -- keep it open
    end if;
    update vdi_alerts set status = 'resolved', resolved_at = p_now,
        resolution_evidence_at = p_evidence_at, updated_at = p_now
      where id = existing_id;
    return existing_id;
  end if;

  if existing_id is not null then
    -- Dedup: repeated/concurrent evaluation updates the open alert.
    update vdi_alerts set last_evaluated_at = p_now, detail = p_detail,
        severity = p_severity, updated_at = p_now
      where id = existing_id;
    return existing_id;
  end if;

  insert into vdi_alerts (desktop_id, tenant_id, workspace_id, rule, severity,
      generation, detail, first_observed_at, last_evaluated_at)
  values (p_desktop_id, p_tenant_id, p_workspace_id, p_rule, p_severity,
      p_generation, p_detail, p_now, p_now)
  returning id into existing_id;
  return existing_id;
end $$;

-- ============================================================================
-- Usage accounting: idempotent per (resource, interval).
-- ============================================================================

create table if not exists vdi_usage_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  workspace_id text not null,
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  provider_id text not null,
  -- The covered interval. Idempotency: replaying the same resource+interval
  -- can never double-count.
  interval_start timestamptz not null,
  interval_end timestamptz not null,
  -- Lifecycle context the interval belongs to (intervals split at transitions).
  phase_at_start text not null,
  phase_at_end text,
  -- Completeness: a current observation alone cannot establish historical
  -- runtime — gaps between observations are explicit.
  completeness text not null,             -- 'complete' | 'partial' | 'gap'
  gap_reason text,                        -- e.g. 'provider_outage', 'no_observation'
  source text not null,                   -- 'observation' | 'provider_api'
  -- Measured usage
  runtime_seconds numeric,                -- measured running time in the interval
  -- Cost presentation: measured usage vs estimated cost vs provider charges
  -- are SEPARATE. Unavailable pricing stays NULL (unknown), never zero.
  estimated_cost_usd numeric,
  estimate_rate_version text,             -- e.g. 'daytona-2026-10' — estimates keep their rate
  provider_reported_cost_usd numeric,     -- actual charges when the provider reports them
  created_at timestamptz not null default now()
);

-- Idempotency guarantee: one record per resource + interval window.
create unique index if not exists uq_vdi_usage_resource_interval
  on vdi_usage_records(provider_id, interval_start, interval_end);

create index if not exists idx_vdi_usage_workspace
  on vdi_usage_records(workspace_id, interval_start desc);
create index if not exists idx_vdi_usage_gaps
  on vdi_usage_records(interval_start) where completeness <> 'complete';

alter table vdi_alerts enable row level security;
alter table vdi_usage_records enable row level security;

create policy "service_role manages vdi_alerts"
  on vdi_alerts for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_usage_records"
  on vdi_usage_records for all
  using (auth.role() = 'service_role');
