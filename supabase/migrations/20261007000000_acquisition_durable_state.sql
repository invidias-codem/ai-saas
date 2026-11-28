-- ============================================================================
-- Acquisition Plane A3: durable acquisition state.
--
-- Two identities from the start: the logical request and each provider
-- execution. Raw evidence is staged durably — NOT normalized (A4 owns
-- EvidenceObjectV1).
--
-- Uniqueness is the replay protection:
--   UNIQUE(provider, provider_run_id)  → one Apify run can never mint two rows
--   UNIQUE(operation_key)             → one ingestion operation ever
--   UNIQUE(provider_run_id, ordinal, content_hash) → crash-retry never
--     duplicates evidence (ordinal + content-hash cover both duplicate-item
--     and retry-generated-duplicate problems)
-- ============================================================================

create table if not exists acquisition_requests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  workspace_id text,
  request_id text not null,
  mode text not null,
  objective text not null default 'research',
  status text not null default 'queued',
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_acq_requests_user
  on acquisition_requests(user_id, created_at desc);
create unique index if not exists uq_acq_requests_request_id
  on acquisition_requests(request_id);

create table if not exists acquisition_provider_runs (
  id uuid primary key default gen_random_uuid(),
  acquisition_request_id uuid not null references acquisition_requests(id),
  provider text not null,
  provider_run_id text not null,
  provider_actor_id text,
  dataset_id text,
  operation_key text,
  status text not null default 'provider_pending',
  failure_code text,
  failure_message text,
  estimated_cost_usd numeric,
  final_cost_usd numeric,
  authorized_max_cost_usd numeric,
  authorized_max_records integer,
  record_count integer,
  trigger_run_id text,
  provider_started_at timestamptz,
  provider_completed_at timestamptz,
  ingestion_started_at timestamptz,
  ingestion_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One provider run = one row, forever.
create unique index if not exists uq_acq_provider_runs_provider_run
  on acquisition_provider_runs(provider, provider_run_id);
-- One ingestion operation ever.
create unique index if not exists uq_acq_provider_runs_operation_key
  on acquisition_provider_runs(operation_key)
  where operation_key is not null;

create table if not exists acquisition_raw_evidence (
  id uuid primary key default gen_random_uuid(),
  acquisition_request_id uuid not null references acquisition_requests(id),
  provider_run_id text not null,
  ordinal integer not null,
  content_hash text not null,
  raw_json jsonb not null,
  provider text not null,
  provider_actor_id text,
  dataset_id text,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Crash-retry can never duplicate evidence rows.
create unique index if not exists uq_acq_evidence_run_ordinal_hash
  on acquisition_raw_evidence(provider_run_id, ordinal, content_hash);
create index if not exists idx_acq_evidence_content_hash
  on acquisition_raw_evidence(content_hash);
