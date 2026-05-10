-- Dataset registry table (Phase 2.5 / optional but recommended)
-- Tracks curated dataset versions and their generation parameters.

-- Enable UUID extension if not present
create extension if not exists "uuid-ossp";

create table if not exists public.dataset_registry (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),

  -- Deterministic hash from the curator (first 12 chars of sha256)
  version_hash text not null,

  -- Copy of curator filters and generation context
  filters jsonb not null default '{}'::jsonb,

  -- Row counts and other metrics
  counts jsonb not null default '{}'::jsonb,

  -- Where the artifacts were written (e.g., datasets/feedback_dataset_<hash>)
  artifact_path text null,

  -- Optional provenance
  git_sha text null,
  workflow_run_id text null
);

-- Prevent duplicates
create unique index if not exists uq_dataset_registry_version_hash
  on public.dataset_registry (version_hash);

-- Enable RLS
alter table public.dataset_registry enable row level security;

-- Default: no public access. Service role will write.
