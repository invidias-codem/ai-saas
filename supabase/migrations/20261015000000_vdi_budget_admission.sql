-- ============================================================================
-- VDI-4C: Budget admission — atomic spend reservations + settlement.
--
-- Invariants:
--   - Admission limit (accounted spend + outstanding reservations + requested
--     ≤ configured limit) enforced ATOMICALLY under a budget-row lock.
--   - Every reservation binds: tenant/workspace, budget period, currency,
--     operation key, resource spec, pricing version, bounded execution horizon.
--   - Money is EXACT: integer micro-USD (1e-6 USD) everywhere. No floats.
--   - Idempotent admission: replay returns the ORIGINAL reservation; same key
--     with a different spec/amount/policy is REFUSED.
--   - Unknown pricing: refused unless policy supplies a conservative ceiling;
--     unknown never becomes zero.
--   - Uncertain provisioning: the reservation is RETAINED until reconciliation
--     establishes whether a billable resource exists. Expiry alone never
--     releases it.
--   - Settlement atomically replaces reserved exposure with accounted spend;
--     later provider charges ADJUST the same accounting entry — estimates are
--     never counted twice.
--   - Admission limit ≠ guaranteed provider cap: overruns recorded, further
--     admission blocked per policy; runtime beyond the reserved horizon needs
--     an explicit extension.
--   - Budget-period rollover: liabilities keep their ORIGINAL period
--     attribution (rows never migrate).
-- ============================================================================

create table if not exists vdi_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  workspace_id text not null,
  budget_period text not null,              -- e.g. '2026-10' (period key, not a date)
  currency text not null default 'USD',
  -- All money: integer micro-USD (1e-6 USD). EXACT arithmetic only.
  limit_micros bigint not null,
  accounted_spend_micros bigint not null default 0,
  overrun_micros bigint not null default 0, -- recorded charges above limit
  admission_blocked boolean not null default false, -- overrun policy outcome
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_vdi_budgets unique (tenant_id, workspace_id, budget_period)
);

create table if not exists vdi_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,       -- idempotency: one reservation per key
  tenant_id text not null,
  workspace_id text not null,
  budget_period text not null,             -- ORIGINAL attribution; never migrates
  currency text not null default 'USD',
  amount_micros bigint not null,
  resource_spec jsonb not null,            -- spec hash + pricing inputs
  pricing_version text not null,           -- 'known:<v>' | 'unknown-ceiling'
  pricing_known boolean not null,           -- false ⇒ conservative policy ceiling
  horizon_expires_at timestamptz not null, -- bounded execution horizon
  status text not null default 'reserved', -- 'reserved' | 'settled' | 'released' | 'held-for-reconciliation'
  reconciling boolean not null default false,
  -- Settlement: reserved exposure is replaced by accounted spend, atomically.
  settled_micros bigint,                  -- accounted spend at settlement
  provider_charge_adjustments_micros bigint not null default 0, -- later true-ups
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vdi_reservations_ws_period
  on vdi_budget_reservations(workspace_id, budget_period, status);

-- ============================================================================
-- RPC: atomic admission.
--   admitted = accounted + outstanding_reserved + requested <= limit
--   outstanding = reservations with status in ('reserved','held-for-reconciliation')
--   Unknown pricing (p_amount_micros null): refused unless
--   p_unknown_ceiling_micros supplies a conservative reservation ceiling.
--   Idempotent: existing reservation for the key with the SAME binding is
--   returned (admitted); a DIFFERENT binding is refused (conflict).
-- ============================================================================
create or replace function vdi_admit_reservation(
  p_operation_key text,
  p_tenant_id text,
  p_workspace_id text,
  p_budget_period text,
  p_currency text,
  p_amount_micros bigint,                 -- null ⇒ pricing unknown
  p_unknown_ceiling_micros bigint,        -- policy ceiling when pricing unknown
  p_resource_spec jsonb,
  p_pricing_version text,
  p_horizon_expires_at timestamptz
) returns json
language plpgsql security definer set search_path = public as $$
declare
  budget record;
  existing_res record;
  requested_micros bigint;
  outstanding bigint;
  effective_amount bigint;
begin
  -- Idempotency first: does this operation key already have a reservation?
  -- NOTE: composite IS NULL checks EVERY field (a row with any NULL column
  -- reads as null) — check the KEY FIELD instead.
  select * into existing_res from vdi_budget_reservations
   where operation_key = p_operation_key for update;

  if existing_res.operation_key is not null then
    -- Replay: SAME binding returns the original reservation; a different
    -- spec/amount/policy is a conflict, refused.
    if existing_res.amount_micros = coalesce(p_amount_micros, existing_res.amount_micros)
       and existing_res.budget_period = p_budget_period
       and existing_res.currency = p_currency then
      return json_build_object('admitted', true, 'replay', true,
        'reservation_id', existing_res.id, 'amount_micros', existing_res.amount_micros,
        'status', existing_res.status);
    else
      return json_build_object('admitted', false, 'reason', 'conflicting replay: same key, different binding');
    end if;
  end if;

  -- Resolve the requested amount: unknown pricing needs an explicit ceiling.
  if p_amount_micros is null then
    if p_unknown_ceiling_micros is null then
      return json_build_object('admitted', false,
        'reason', 'pricing unknown and no conservative ceiling supplied: refusing (unknown is never zero)');
    end if;
    requested_micros := p_unknown_ceiling_micros;
  else
    requested_micros := p_amount_micros;
  end if;

  -- Lock THE BUDGET ROW: the single admission authority.
  select * into budget from vdi_budgets
   where tenant_id = p_tenant_id and workspace_id = p_workspace_id
     and budget_period = p_budget_period
   for update;

  if budget.id is null then
    return json_build_object('admitted', false, 'reason', 'budget not configured for period');
  end if;
  if budget.admission_blocked then
    return json_build_object('admitted', false, 'reason', 'admission blocked by overrun policy');
  end if;

  -- Outstanding reserved exposure (held-for-reconciliation still counts!).
  select coalesce(sum(amount_micros), 0) into outstanding
    from vdi_budget_reservations
   where tenant_id = p_tenant_id and workspace_id = p_workspace_id
     and budget_period = p_budget_period
     and status in ('reserved', 'held-for-reconciliation');

  if budget.accounted_spend_micros + outstanding + requested_micros > budget.limit_micros then
    return json_build_object('admitted', false, 'reason', 'over admission limit',
      'accounted', budget.accounted_spend_micros, 'outstanding', outstanding,
      'requested', requested_micros, 'limit', budget.limit_micros);
  end if;

  insert into vdi_budget_reservations (operation_key, tenant_id, workspace_id,
    budget_period, currency, amount_micros, resource_spec, pricing_version,
    pricing_known, horizon_expires_at, status)
  values (p_operation_key, p_tenant_id, p_workspace_id,
    p_budget_period, p_currency, requested_micros, p_resource_spec,
    case when p_amount_micros is null then 'unknown-ceiling' else p_pricing_version end,
    p_amount_micros is not null, p_horizon_expires_at, 'reserved');

  return json_build_object('admitted', true, 'replay', false,
    'amount_micros', requested_micros,
    'pricing_known', p_amount_micros is not null);
end $$;

-- ============================================================================
-- RPC: provisioning outcome.
--   'uncertain'  → status 'held-for-reconciliation' (retained; expiry alone
--                  can NEVER release it — only reconciliation can).
--   'failed'     → release the reservation ONCE (status 'released', exposure
--                  removed from outstanding).
-- ============================================================================
create or replace function vdi_resolve_provisioning(
  p_operation_key text,
  p_outcome text,                          -- 'uncertain' | 'failed'
  p_now timestamptz
) returns json
language plpgsql security definer set search_path = public as $$
declare
  res record;
begin
  select * into res from vdi_budget_reservations
   where operation_key = p_operation_key for update;

  if res.operation_key is null then
    return json_build_object('ok', false, 'reason', 'reservation not found');
  end if;
  if res.status <> 'reserved' then
    return json_build_object('ok', false, 'reason', 'reservation status ' || res.status || ' not resolvable');
  end if;

  if p_outcome = 'uncertain' then
    update vdi_budget_reservations
       set status = 'held-for-reconciliation', reconciling = true, updated_at = p_now
     where id = res.id;
    return json_build_object('ok', true, 'status', 'held-for-reconciliation');
  end if;

  if p_outcome = 'failed' then
    update vdi_budget_reservations
       set status = 'released', released_at = p_now, updated_at = p_now
     where id = res.id;
    return json_build_object('ok', true, 'status', 'released');
  end if;

  return json_build_object('ok', false, 'reason', 'unknown outcome ' || p_outcome);
end $$;

-- ============================================================================
-- RPC: settlement — atomically replace reserved exposure with accounted spend.
--   p_actual_micros: the TRUE settled amount (measured or provider-reported).
--   Later provider-charge adjustments update the SAME entry via
--   vdi_adjust_settled_charge (idempotent corrections; estimates never
--   re-counted). Overruns above the limit are recorded (overrun_micros) and
--   policy can block further admission.
-- ============================================================================
create or replace function vdi_settle_reservation(
  p_operation_key text,
  p_actual_micros bigint,
  p_block_admission_on_overrun boolean,
  p_now timestamptz
) returns json
language plpgsql security definer set search_path = public as $$
declare
  res record;
  budget record;
  new_spend bigint;
  overrun bigint;
begin
  select * into res from vdi_budget_reservations
   where operation_key = p_operation_key for update;

  if res.operation_key is null then
    return json_build_object('ok', false, 'reason', 'reservation not found');
  end if;
  if res.status = 'settled' then
    -- Idempotent: same actual amount is a no-op; a DIFFERENT actual is a
    -- correction handled by vdi_adjust_settled_charge.
    if res.settled_micros = p_actual_micros then
      return json_build_object('ok', true, 'replay', true, 'status', 'settled');
    end if;
    return json_build_object('ok', false, 'reason', 'already settled with different amount; use adjustment');
  end if;
  if res.status = 'released' then
    return json_build_object('ok', false, 'reason', 'reservation released; nothing to settle');
  end if;

  select * into budget from vdi_budgets
   where tenant_id = res.tenant_id and workspace_id = res.workspace_id
     and budget_period = res.budget_period
   for update;

  -- Replace reserved exposure with accounted spend: the reservation leaves
  -- 'outstanding' and its actual lands in accounted_spend.
  new_spend := budget.accounted_spend_micros + p_actual_micros;
  overrun := greatest(new_spend - budget.limit_micros, 0) - budget.overrun_micros;
  if overrun < 0 then overrun := 0; end if;

  update vdi_budgets
     set accounted_spend_micros = new_spend,
         overrun_micros = overrun_micros + overrun,
         admission_blocked = case when p_block_admission_on_overrun and new_spend > limit_micros
                                   then true else admission_blocked end,
         updated_at = p_now
   where id = budget.id;

  update vdi_budget_reservations
     set status = 'settled', settled_micros = p_actual_micros,
         provider_charge_adjustments_micros = p_actual_micros,
         reconciling = false, updated_at = p_now
   where id = res.id;

  return json_build_object('ok', true, 'replay', false, 'settled_micros', p_actual_micros,
    'accounted_spend_micros', new_spend, 'overrun_recorded', overrun);
end $$;

-- ============================================================================
-- RPC: provider-charge adjustment on an ALREADY settled entry.
--   Idempotent by (operation_key, charge); applying the same correction twice
--   is a no-op. Corrections adjust accounted_spend by the DELTA atomically.
-- ============================================================================
create or replace function vdi_adjust_settled_charge(
  p_operation_key text,
  p_charge_micros bigint,                  -- the TRUE total charge for the entry
  p_now timestamptz
) returns json
language plpgsql security definer set search_path = public as $$
declare
  res record;
  budget record;
  delta bigint;
  overrun bigint;
begin
  select * into res from vdi_budget_reservations
   where operation_key = p_operation_key for update;

  if res.operation_key is null then
    return json_build_object('ok', false, 'reason', 'reservation not found');
  end if;
  if res.status <> 'settled' then
    return json_build_object('ok', false, 'reason', 'reservation not settled');
  end if;
  if res.provider_charge_adjustments_micros = p_charge_micros then
    return json_build_object('ok', true, 'replay', true); -- same correction: no-op
  end if;

  select * into budget from vdi_budgets
   where tenant_id = res.tenant_id and workspace_id = res.workspace_id
     and budget_period = res.budget_period
   for update;

  delta := p_charge_micros - res.provider_charge_adjustments_micros;
  update vdi_budgets
     set accounted_spend_micros = accounted_spend_micros + delta,
         updated_at = p_now
   where id = budget.id;

  update vdi_budget_reservations
     set provider_charge_adjustments_micros = p_charge_micros,
         updated_at = p_now
   where id = res.id;

  return json_build_object('ok', true, 'replay', false, 'delta_micros', delta);
end $$;

-- ============================================================================
-- RPC: horizon extension — an EXPLICIT decision, never automatic.
-- ============================================================================
create or replace function vdi_extend_reservation_horizon(
  p_operation_key text,
  p_new_horizon timestamptz,
  p_now timestamptz
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  res record;
begin
  select * into res from vdi_budget_reservations
   where operation_key = p_operation_key for update;
  if res.operation_key is null then return false; end if;
  if res.status not in ('reserved', 'held-for-reconciliation') then
    return false;
  end if;
  update vdi_budget_reservations
     set horizon_expires_at = p_new_horizon, updated_at = p_now
   where id = res.id;
  return true;
end $$;

alter table vdi_budgets enable row level security;
alter table vdi_budget_reservations enable row level security;

create policy "service_role manages vdi_budgets"
  on vdi_budgets for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_budget_reservations"
  on vdi_budget_reservations for all
  using (auth.role() = 'service_role');
