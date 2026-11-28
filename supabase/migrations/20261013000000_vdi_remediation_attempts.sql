-- ============================================================================
-- VDI-4A: Durable remediation attempt counter + escalation records.
--
-- Invariants:
--   - Display-recovery attempt counts survive worker restarts (durable rows).
--   - An attempt is keyed by (desktop, rule) within a policy version: bumping
--     the policy version resets the budget honestly.
--   - Exhausting the limit produces exactly ONE escalation record.
--   - The quarantine rule is preserved in policy: NO retirement action can be
--     proposed without ownership reconciliation + retention checks — enforced
--     by NOT having a retirement action here at all; quarantine evidence flows
--     to the ownership/retention reconciliation path instead.
-- ============================================================================

create table if not exists vdi_remediation_attempts (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  tenant_id text not null,
  workspace_id text not null,
  rule text not null,                     -- 'display_recovery' | 'idle_suspension'
  policy_version text not null,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  escalated boolean not null default false,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One attempt-counter row per (desktop, rule, policy version).
create unique index if not exists uq_vdi_remediation_attempts
  on vdi_remediation_attempts(desktop_id, rule, policy_version);

create index if not exists idx_vdi_remediation_attempts_ws
  on vdi_remediation_attempts(workspace_id);

-- Atomic attempt increment with bounded limit + single escalation.
-- Returns the attempt number AFTER the increment; returns -1 when the limit
-- was already exhausted (no increment, no second escalation).
create or replace function vdi_record_remediation_attempt(
  p_desktop_id uuid,
  p_tenant_id text,
  p_workspace_id text,
  p_rule text,
  p_policy_version text,
  p_limit integer,
  p_now timestamptz
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  existing record;
  new_count integer;
begin
  select * into existing from vdi_remediation_attempts
   where desktop_id = p_desktop_id and rule = p_rule and policy_version = p_policy_version
   for update;

  if existing is null then
    insert into vdi_remediation_attempts (desktop_id, tenant_id, workspace_id, rule,
        policy_version, attempt_count, last_attempt_at)
    values (p_desktop_id, p_tenant_id, p_workspace_id, p_rule,
        p_policy_version, 1, p_now);
    return 1;
  end if;

  if existing.escalated then
    return -1; -- budget exhausted; never a second escalation
  end if;

  new_count := existing.attempt_count + 1;
  if new_count > p_limit then
    -- Exhausted: record escalation ONCE, do not increment.
    update vdi_remediation_attempts
       set escalated = true, escalated_at = p_now, updated_at = p_now
     where id = existing.id;
    return -1;
  end if;

  update vdi_remediation_attempts
     set attempt_count = new_count, last_attempt_at = p_now, updated_at = p_now
   where id = existing.id;
  return new_count;
end $$;

alter table vdi_remediation_attempts enable row level security;

create policy "service_role manages vdi_remediation_attempts"
  on vdi_remediation_attempts for all
  using (auth.role() = 'service_role');
