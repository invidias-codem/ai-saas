-- ============================================================================
-- VDI-2A: Durable Desktop Broker State
--
-- Invariants:
--   - Every desktop has a single authoritative owner (tenant + workspace)
--   - Generation increments on every ownership-affecting change; stale workers
--     cannot mutate the current generation (optimistic locking)
--   - Operation keys prevent duplicate provisioning across broker restarts
--   - Session leases and execution leases gate suspension (no suspend while active)
--   - Connection grants are short-lived tokens for secure viewer access
--   - Human takeover revokes agent input authority (exclusive input lease)
-- ============================================================================

create table if not exists vdi_desktops (
  id uuid primary key default gen_random_uuid(),
  desktop_id text not null,                 -- stable logical id (e.g., "dt-abc123")
  tenant_id text not null,
  workspace_id text not null,
  generation integer not null default 1,    -- optimistic lock; increments on ownership-affecting writes

  -- Provider identity
  provider text not null,                   -- 'daytona' | 'kasm' | 'kubevirt'
  provider_id text not null,                -- provider-assigned resource id
  provider_region text,                     -- provider region/zone

  -- Spec snapshot (denormalized for fast reads without joining)
  runtime_type text not null,               -- 'linux_vm' | 'windows_vm' | 'macos'
  persistence text not null,                -- 'task' | 'workspace' | 'personal'
  image_version text not null,
  memory_mb integer,
  cpu_shares integer,
  storage_gb integer,
  spec_hash text not null,                  -- hashDesktopSpec(spec) for reconciliation

  -- Lifecycle
  phase text not null default 'provisioning', -- 'provisioning' | 'ready' | 'degraded' | 'suspending' | 'suspended' | 'destroying' | 'destroyed' | 'failed' | 'quarantined'

  -- Resume key for persistent desktops (provider-specific)
  resume_key text,

  -- Lease state (denormalized for atomic suspend checks)
  session_lease_id text,
  session_lease_user_id text,
  session_lease_expires_at timestamptz,
  execution_lease_id text,
  execution_lease_agent_id text,
  execution_lease_expires_at timestamptz,

  -- Human takeover: exclusive input control
  input_control_lease_id text,              -- who currently owns keyboard/mouse
  input_control_lease_type text,            -- 'human' | 'agent'
  input_control_lease_expires_at timestamptz,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  suspended_at timestamptz,
  destroyed_at timestamptz,

  -- Reconciliation: operation key for idempotent create
  operation_key text,                       -- 'vdi:create:tenant:workspace:specHash:v1'

  -- Unique constraints
  constraint uq_vdi_desktops_desktop_id unique (desktop_id),
  constraint uq_vdi_desktops_provider unique (provider, provider_id)
  -- NOTE: operation_key uniqueness is a PARTIAL unique index below
  -- (constraint ... unique ... where is invalid PostgreSQL syntax).
);

-- Indexes for common queries
create index if not exists idx_vdi_desktops_tenant_workspace
  on vdi_desktops(tenant_id, workspace_id, generation desc);
create index if not exists idx_vdi_desktops_phase
  on vdi_desktops(phase) where phase in ('provisioning', 'ready', 'degraded');
create index if not exists idx_vdi_desktops_operation_key
  on vdi_desktops(operation_key) where operation_key is not null;
-- One operation key = one desktop ever (partial: NULLs from legacy rows allowed).
create unique index if not exists uq_vdi_desktops_operation_key
  on vdi_desktops(operation_key) where operation_key is not null;

-- ============================================================================
-- Session Leases (human viewer grants) - short-lived connection tokens
-- ============================================================================
create table if not exists vdi_session_leases (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  session_id text not null,                 -- 'sess-<ts>-<random>'
  user_id text not null,
  connection_grant text not null,           -- short-lived signed token for viewer
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,                          -- 'human' | 'system' | 'membership_revoked'
  revoked_reason text

  -- Unique constraint: one active session lease per desktop per user.
  -- Partial uniqueness via index below (inline WHERE is invalid syntax,
  -- and expires_at > now() is not IMMUTABLE so it can't be in a predicate).
  -- Expiry is enforced at read time; the index keys on revocation only.
);

create index if not exists idx_vdi_session_leases_desktop
  on vdi_session_leases(desktop_id, expires_at desc);
create unique index if not exists uq_vdi_session_leases_active
  on vdi_session_leases(desktop_id, user_id)
  where revoked_at is null;

-- ============================================================================
-- Execution Leases (agent execution grants)
-- ============================================================================
create table if not exists vdi_execution_leases (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  execution_id text not null,               -- 'exec-<ts>-<random>'
  agent_id text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,                          -- 'agent_done' | 'system' | 'human_takeover'
  revoked_reason text
  -- (partial uniqueness enforced by index below — inline WHERE is invalid)
);

create index if not exists idx_vdi_execution_leases_desktop
  on vdi_execution_leases(desktop_id, expires_at desc);
create unique index if not exists uq_vdi_execution_leases_active
  on vdi_execution_leases(desktop_id, agent_id)
  where revoked_at is null;

-- ============================================================================
-- Connection Grants (secure viewer access tokens)
-- Short-lived tokens that authorize a viewer connection.
-- Separate from session leases: a session lease *holds* the desktop;
-- a connection grant *authorizes* a specific viewer connection.
-- ============================================================================
create table if not exists vdi_connection_grants (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  session_lease_id uuid not null references vdi_session_leases(id) on delete cascade,
  grant_token text not null,                -- opaque token, validated by viewer gateway
  protocol text not null,                   -- 'vnc' | 'webvnc' | 'rdp' | 'kasm'
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- short TTL (e.g., 5 min), renewable
  revoked_at timestamptz,
  revoked_reason text,                      -- 'session_revoked' | 'membership_revoked' | 'takeover' | 'expired'

  constraint uq_vdi_connection_grants_token unique (grant_token)
);

create index if not exists idx_vdi_connection_grants_desktop
  on vdi_connection_grants(desktop_id, expires_at desc);

-- ============================================================================
-- Input Control Leases (exclusive keyboard/mouse authority)
-- At most ONE holder at a time: human observer, human controller, or agent.
-- Human takeover = new input_control_lease with type='human', revokes agent.
-- ============================================================================
create table if not exists vdi_input_control_leases (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  lease_id text not null,                   -- 'input-<ts>-<random>'
  holder_type text not null,                -- 'human' | 'agent'
  holder_id text not null,                  -- user_id or agent_id
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text                       -- 'takeover' | 'session_end' | 'execution_end' | 'expired'

  -- Only one active input control lease per desktop at a time.
  -- Partial uniqueness via index below (inline WHERE invalid; expires_at
  -- is not IMMUTABLE so the predicate keys on revocation only — expiry is
  -- enforced at read time).
);

create index if not exists idx_vdi_input_control_desktop
  on vdi_input_control_leases(desktop_id, expires_at desc);
-- THE exclusivity guarantee: at most one live input owner per desktop.
create unique index if not exists uq_vdi_input_control_active
  on vdi_input_control_leases(desktop_id)
  where revoked_at is null;

-- ============================================================================
-- Operation Keys (idempotent provisioning reconciliation)
-- Mirrors Acquisition Plane pattern: one operation key, one outcome.
-- ============================================================================
create table if not exists vdi_operation_keys (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,       -- 'vdi:create:tenant:workspace:specHash:v1'
  tenant_id text not null,
  workspace_id text not null,
  spec_hash text not null,
  status text not null default 'in_progress', -- 'in_progress' | 'completed' | 'failed'
  desktop_id uuid,                          -- set on completion
  provider_id text,                         -- set on completion
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint uq_vdi_operation_keys_key unique (operation_key)
);

create index if not exists idx_vdi_operation_keys_tenant_workspace
  on vdi_operation_keys(tenant_id, workspace_id, requested_at desc);

-- ============================================================================
-- Evidence / Audit Trail (for debugging and compliance)
-- Records every broker operation for post-mortem analysis.
-- ============================================================================
create table if not exists vdi_evidence (
  id uuid primary key default gen_random_uuid(),
  desktop_id uuid not null references vdi_desktops(id) on delete cascade,
  operation_key text,
  operation_type text not null,             -- 'create' | 'resume' | 'execute' | 'snapshot' | 'suspend' | 'destroy' | 'grant_session' | 'revoke_session' | 'grant_execution' | 'revoke_execution' | 'takeover' | 'reconnect'
  desired_state text,
  observed_state text,
  timing_ms integer,
  failure_class text,
  metadata jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_vdi_evidence_desktop
  on vdi_evidence(desktop_id, recorded_at desc);
create index if not exists idx_vdi_evidence_operation_key
  on vdi_evidence(operation_key) where operation_key is not null;

-- ============================================================================
-- RLS Policies (service role only; callers go through broker service)
-- ============================================================================
alter table vdi_desktops enable row level security;
alter table vdi_session_leases enable row level security;
alter table vdi_execution_leases enable row level security;
alter table vdi_connection_grants enable row level security;
alter table vdi_input_control_leases enable row level security;
alter table vdi_operation_keys enable row level security;
alter table vdi_evidence enable row level security;

create policy "service_role manages vdi_desktops"
  on vdi_desktops for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_session_leases"
  on vdi_session_leases for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_execution_leases"
  on vdi_execution_leases for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_connection_grants"
  on vdi_connection_grants for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_input_control_leases"
  on vdi_input_control_leases for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_operation_keys"
  on vdi_operation_keys for all
  using (auth.role() = 'service_role');

create policy "service_role manages vdi_evidence"
  on vdi_evidence for all
  using (auth.role() = 'service_role');

-- ============================================================================
-- Updated-at trigger (reuses existing pattern)
-- ============================================================================
create or replace function update_vdi_desktops_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trigger_vdi_desktops_updated_at on vdi_desktops;
create trigger trigger_vdi_desktops_updated_at
  before update on vdi_desktops
  for each row execute function update_vdi_desktops_updated_at();

-- ============================================================================
-- Transactional lease acquisition RPCs (VDI-2 closure).
-- supabase-js has no interactive transactions, so the check-and-insert that
-- the Postgres race proofs require lives here: lock the desktop row, verify
-- phase, transactionally revoke EXPIRED leases (they must not occupy the
-- exclusive slot), insert the new lease, and update the denormalized columns
-- — all on one transactional authority.
-- ============================================================================

-- Grant an execution lease atomically. Fails (raises) when the desktop is in
-- a non-running phase or an unexpired execution lease exists for the agent.
create or replace function vdi_grant_execution_lease(
  p_desktop_id text,
  p_execution_id text,
  p_agent_id text,
  p_ttl_ms integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d vdi_desktops%rowtype;
begin
  -- Single transactional authority: lock the desktop row first.
  select * into d from vdi_desktops where desktop_id = p_desktop_id for update;
  if not found then
    raise exception 'vdi_grant_execution_lease: desktop % not found', p_desktop_id;
  end if;

  -- Phase check INSIDE the transaction that inserts the lease.
  if d.phase in ('suspended', 'suspending', 'destroyed', 'destroying', 'quarantined') then
    raise exception 'vdi_grant_execution_lease: desktop phase is %', d.phase;
  end if;

  -- Expired leases must not occupy the exclusive slot: revoke them
  -- transactionally before acquisition.
  update vdi_execution_leases
    set revoked_at = now(), revoked_by = 'system', revoked_reason = 'expired'
   where desktop_id = d.id and revoked_at is null and expires_at <= now();

  insert into vdi_execution_leases (desktop_id, execution_id, agent_id, expires_at)
  values (d.id, p_execution_id, p_agent_id, now() + make_interval(secs => p_ttl_ms / 1000.0));

  update vdi_desktops
     set execution_lease_id = p_execution_id,
         execution_lease_agent_id = p_agent_id,
         execution_lease_expires_at = now() + make_interval(secs => p_ttl_ms / 1000.0),
         generation = d.generation + 1
   where id = d.id and generation = d.generation;
end $$;

-- Grant an input-control lease atomically (takeover). Revokes any live lease
-- (expired-or-not) in the same transaction, then inserts the new holder.
create or replace function vdi_grant_input_control_lease(
  p_desktop_id text,
  p_lease_id text,
  p_holder_type text,
  p_holder_id text,
  p_ttl_ms integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d vdi_desktops%rowtype;
begin
  select * into d from vdi_desktops where desktop_id = p_desktop_id for update;
  if not found then
    raise exception 'vdi_grant_input_control_lease: desktop % not found', p_desktop_id;
  end if;
  if d.phase in ('destroyed', 'destroying') then
    raise exception 'vdi_grant_input_control_lease: desktop phase is %', d.phase;
  end if;

  -- Takeover revokes the current holder, expired or not, transactionally.
  update vdi_input_control_leases
    set revoked_at = now(), revoked_reason = 'takeover'
   where desktop_id = d.id and revoked_at is null;

  insert into vdi_input_control_leases (desktop_id, lease_id, holder_type, holder_id, expires_at)
  values (d.id, p_lease_id, p_holder_type, p_holder_id, now() + make_interval(secs => p_ttl_ms / 1000.0));

  update vdi_desktops
     set input_control_lease_id = p_lease_id,
         input_control_lease_type = p_holder_type,
         input_control_lease_expires_at = now() + make_interval(secs => p_ttl_ms / 1000.0),
         generation = d.generation + 1
   where id = d.id and generation = d.generation;
end $$;

-- Grant a session lease atomically, revoking any expired one first.
create or replace function vdi_grant_session_lease(
  p_desktop_id text,
  p_session_id text,
  p_user_id text,
  p_connection_grant text,
  p_ttl_ms integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  d vdi_desktops%rowtype;
begin
  select * into d from vdi_desktops where desktop_id = p_desktop_id for update;
  if not found then
    raise exception 'vdi_grant_session_lease: desktop % not found', p_desktop_id;
  end if;
  if d.phase in ('destroyed', 'destroying') then
    raise exception 'vdi_grant_session_lease: desktop phase is %', d.phase;
  end if;

  update vdi_session_leases
    set revoked_at = now(), revoked_by = 'system', revoked_reason = 'expired'
   where desktop_id = d.id and revoked_at is null and expires_at <= now();

  insert into vdi_session_leases (desktop_id, session_id, user_id, connection_grant, expires_at)
  values (d.id, p_session_id, p_user_id, p_connection_grant, now() + make_interval(secs => p_ttl_ms / 1000.0));

  update vdi_desktops
     set session_lease_id = p_session_id,
         session_lease_user_id = p_user_id,
         session_lease_expires_at = now() + make_interval(secs => p_ttl_ms / 1000.0),
         generation = d.generation + 1
   where id = d.id and generation = d.generation;
end $$;