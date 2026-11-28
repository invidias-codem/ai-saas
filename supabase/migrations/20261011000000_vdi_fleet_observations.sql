-- ============================================================================
-- VDI-3A: Fleet observations.
--
-- Invariants:
--   - Observation is SEPARATE from lifecycle: vdi_desktops.phase stays the
--     broker's desired/authoritative state; observations record what the
--     provider/guest LAST REPORTED, with their own timestamps.
--   - Provider outages produce stale/unknown observations — never mutations
--     of ownership, phase, or lease state.
--   - Three distinct facts, never conflated:
--       provider_report  — what the provider API last returned (or 'unknown'
--                          with an error when the API is unreachable)
--       guest_report     — display/guest health inside the desktop
--                          (a running provider resource can have a failed display)
--       observed_at      — when each was last successfully collected
--   - Quarantine rule preserved: discovering an orphan records evidence and
--     triggers reconciliation; observation never deletes provider resources.
-- ============================================================================

create table if not exists vdi_observations (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,

  -- Provider observation (last successful read)
  provider_phase text,                        -- phase the provider reported
  provider_class text,                       -- observed sandboxClass ('container', 'linux-vm', ...)
  provider_observed_at timestamptz,

  -- Provider reachability (separate from the last good read: an outage is a
  -- NEW fact, not an overwrite of the last known state)
  provider_reachable boolean not null default true,
  provider_error text,
  provider_checked_at timestamptz not null default now(),

  -- Guest / display observation (health INSIDE the desktop; independent of
  -- provider lifecycle)
  guest_display_healthy boolean,
  guest_error text,
  guest_observed_at timestamptz,

  -- Broker state at observation time (read-only snapshot for the console;
  -- authoritative values still live in vdi_desktops)
  broker_phase text not null,
  generation integer not null,
  session_lease_active boolean not null default false,
  execution_lease_active boolean not null default false,
  input_control_holder text,

  -- The operation key explaining the latest transition (connects console to
  -- the evidence ledger without duplicating it)
  last_operation_key text,

  created_at timestamptz not null default now()
);

-- One current observation per desktop (history lives in vdi_evidence).
create unique index if not exists uq_vdi_observations_desktop
  on vdi_observations(desktop_id);

create index if not exists idx_vdi_observations_stale
  on vdi_observations(provider_observed_at)
  where provider_reachable = false or guest_display_healthy = false;

alter table vdi_observations enable row level security;

create policy "service_role manages vdi_observations"
  on vdi_observations for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- Race-safe observation write (VDI-3B): an older collection can never
-- overwrite a newer one. checked_at = collection START time.
-- ============================================================================
create or replace function vdi_record_observation(
  p_desktop_id uuid,
  p_provider_reachable boolean,
  p_provider_phase text,
  p_provider_class text,
  p_provider_observed_at timestamptz,
  p_provider_error text,
  p_guest_display_healthy boolean,
  p_guest_error text,
  p_guest_observed_at timestamptz,
  p_broker_phase text,
  p_generation integer,
  p_session_lease_active boolean,
  p_execution_lease_active boolean,
  p_input_control_holder text,
  p_last_operation_key text,
  p_checked_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
declare
  existing_checked_at timestamptz;
begin
  select checked_at into existing_checked_at
    from vdi_observations where desktop_id = p_desktop_id for update;

  -- Concurrent-collection guard: stale writes are dropped, not merged.
  if existing_checked_at is not null and existing_checked_at > p_checked_at then
    return;
  end if;

  insert into vdi_observations (
    desktop_id, provider_reachable, provider_phase, provider_class,
    provider_observed_at, provider_error,
    guest_display_healthy, guest_error, guest_observed_at,
    broker_phase, generation, session_lease_active, execution_lease_active,
    input_control_holder, last_operation_key, checked_at
  ) values (
    p_desktop_id, p_provider_reachable, p_provider_phase, p_provider_class,
    p_provider_observed_at, p_provider_error,
    p_guest_display_healthy, p_guest_error, p_guest_observed_at,
    p_broker_phase, p_generation, p_session_lease_active, p_execution_lease_active,
    p_input_control_holder, p_last_operation_key, p_checked_at
  )
  on conflict (desktop_id) do update set
    provider_reachable = excluded.provider_reachable,
    provider_phase = coalesce(excluded.provider_phase, vdi_observations.provider_phase),
    provider_class = coalesce(excluded.provider_class, vdi_observations.provider_class),
    provider_observed_at = coalesce(excluded.provider_observed_at, vdi_observations.provider_observed_at),
    provider_error = excluded.provider_error,
    guest_display_healthy = excluded.guest_display_healthy,
    guest_error = excluded.guest_error,
    guest_observed_at = excluded.guest_observed_at,
    broker_phase = excluded.broker_phase,
    generation = excluded.generation,
    session_lease_active = excluded.session_lease_active,
    execution_lease_active = excluded.execution_lease_active,
    input_control_holder = excluded.input_control_holder,
    last_operation_key = excluded.last_operation_key,
    checked_at = excluded.checked_at;
end $$;
