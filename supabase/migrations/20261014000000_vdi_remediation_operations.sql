-- ============================================================================
-- VDI-4B: Durable remediation operations.
--
-- Invariants:
--   - Persist the full proposal binding + atomically CLAIM the operation
--     key at admission: exactly one dispatch owner across concurrent workers.
--   - Claimed rows can only be updated by their owner (worker_id) — stale
--     workers cannot mutate a row another worker owns.
--   - Attempt budget consumed AT DISPATCH ADMISSION (never at proposal time,
--     never on duplicate delivery).
--   - Outcomes: 'success' | 'refused' | 'exhausted' | 'reconciling' |
--     'unresolved' — each terminal write is replay-safe (idempotent update
--     keyed on operation key + status transition guards).
--   - Reconciliation contract (display recovery): a healthy display proves
--     success; an unhealthy display alone proves NOTHING about whether the
--     restart executed — if the adapter cannot resolve that, status stays
--     'unresolved', never a false success or a blind retry.
-- ============================================================================

create table if not exists vdi_remediation_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,        -- 'vdi:rem:<action>:<desktopId>:<generation>:<policyVersion>'
  tenant_id text not null,
  workspace_id text not null,
  desktop_id text not null,
  desktop_generation integer not null,
  action text not null,                      -- 'idle_suspension' | 'display_recovery'
  reason text not null,
  proposal jsonb not null,                   -- full proposal binding
  policy_version text not null,
  proposed_at timestamptz not null,
  expires_at timestamptz not null,

  status text not null default 'claimed',    -- 'claimed' | 'dispatched' | 'success' | 'refused' | 'exhausted' | 'reconciling' | 'unresolved'
  worker_id text,                            -- the single dispatch owner
  attempt_number integer,                   -- budget consumed at admission
  dispatched_at timestamptz,
  outcome_evidence jsonb,                   -- terminal evidence (replay-safe writes)
  refusal_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vdi_remediation_ops_ws
  on vdi_remediation_operations(workspace_id, status);
create index if not exists idx_vdi_remediation_ops_desktop
  on vdi_remediation_operations(desktop_id, created_at desc);

-- Atomic claim: exactly ONE winner among concurrent workers. Attempt budget
-- is consumed HERE (admission), not at proposal time. Returns the row when
-- this worker owns it; returns the existing row's status when someone else
-- already claimed (loser sees 'conflict' + existing owner).
create or replace function vdi_claim_remediation_operation(
  p_operation_key text,
  p_tenant_id text,
  p_workspace_id text,
  p_desktop_id text,
  p_desktop_generation integer,
  p_action text,
  p_reason text,
  p_proposal jsonb,
  p_policy_version text,
  p_proposed_at timestamptz,
  p_expires_at timestamptz,
  p_worker_id text,
  p_attempt_limit integer,
  p_attempt_rule text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  ex_status text;
  ex_owner text;
  ex_attempt integer;
  attempt_no integer;
  inserted boolean := false;
begin
  -- THE lock is the unique index: a plain INSERT claims the operation key.
  -- Concurrent workers' inserts conflict; exactly one succeeds.
  begin
    insert into vdi_remediation_operations (operation_key, tenant_id, workspace_id,
      desktop_id, desktop_generation, action, reason, proposal, policy_version,
      proposed_at, expires_at, status, worker_id)
    values (p_operation_key, p_tenant_id, p_workspace_id,
      p_desktop_id, p_desktop_generation, p_action, p_reason, p_proposal, p_policy_version,
      p_proposed_at, p_expires_at, 'claiming', p_worker_id);
    inserted := true;
  exception when unique_violation then
    inserted := false;
  end;

  if not inserted then
    -- Another worker owns it. Duplicate delivery consumes NOTHING.
    select status, worker_id, attempt_number into ex_status, ex_owner, ex_attempt
      from vdi_remediation_operations where operation_key = p_operation_key;
    return json_build_object('claimed', false, 'status', ex_status,
      'owner', ex_owner, 'attempt_number', ex_attempt);
  end if;

  -- We own the row. Consume the attempt budget AT ADMISSION.
  attempt_no := vdi_record_remediation_attempt(
    (select id from vdi_desktops where desktop_id = p_desktop_id),
    p_tenant_id, p_workspace_id, p_attempt_rule, p_policy_version, p_attempt_limit, now());

  if attempt_no = -1 then
    -- Budget exhausted at admission: terminal 'exhausted', no dispatch.
    update vdi_remediation_operations
       set status = 'exhausted',
           outcome_evidence = json_build_object('outcome', 'exhausted', 'attempt_limit', p_attempt_limit)
     where operation_key = p_operation_key and status = 'claiming';
    return json_build_object('claimed', false, 'status', 'exhausted', 'attempt_number', -1);
  end if;

  update vdi_remediation_operations
     set status = 'claimed', attempt_number = attempt_no
   where operation_key = p_operation_key and status = 'claiming';

  return json_build_object('claimed', true, 'status', 'claimed',
    'attempt_number', attempt_no, 'owner', p_worker_id);
end $$;

-- Owner-guarded transition: only the claim's owner may dispatch or write a
-- terminal outcome. Stale workers (different worker_id) get false back.
-- Terminal states are final: replayed terminal writes are no-ops.
create or replace function vdi_update_remediation_operation(
  p_operation_key text,
  p_worker_id text,
  p_new_status text,
  p_outcome_evidence jsonb,
  p_refusal_reason text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  existing record;
begin
  select * into existing from vdi_remediation_operations
   where operation_key = p_operation_key for update;

  if existing.id is null then return false; end if;

  -- Terminal states are immutable.
  if existing.status in ('success', 'refused', 'exhausted') then
    return existing.status = p_new_status; -- replay of the SAME outcome: ok
  end if;

  -- Only the dispatch owner may advance the operation.
  if existing.worker_id is distinct from p_worker_id then
    return false;
  end if;

  update vdi_remediation_operations
     set status = p_new_status,
         outcome_evidence = coalesce(p_outcome_evidence, outcome_evidence),
         refusal_reason = coalesce(p_refusal_reason, refusal_reason),
         dispatched_at = case when p_new_status = 'dispatched' then now() else dispatched_at end,
         updated_at = now()
   where id = existing.id;
  return true;
end $$;

alter table vdi_remediation_operations enable row level security;

create policy "service_role manages vdi_remediation_operations"
  on vdi_remediation_operations for all
  using (auth.role() = 'service_role');
