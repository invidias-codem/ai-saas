-- ============================================================
-- Migration: 20260904000000_canonical_state_and_genotypes.sql
-- Purpose: Canonical State (provider-agnostic roles) + EMSH Genotype storage
--          + durable human-in-the-loop approvals (replaces in-memory store).
--
-- Design invariants (per vision.md):
--   * 768-dim embedding lane (matches workspace_memories + memories).
--   * Append-only fitness lineage (mirrors the knowledge-graph invariant).
--   * RLS enabled on every table (service-role writes bypass RLS, but
--     the gate must be present for the security/lint surface).
-- ============================================================

-- Ensure vector type is available (safe no-op if already present).
create extension if not exists vector;

-- ------------------------------------------------------------------
-- 1. Canonical State: extend messages with provider-agnostic columns.
--    We do NOT relax the existing `role` CHECK constraint (which locks
--    `messages` to user/bot/assistant/system) — we add a parallel
--    `canonical_role` column so the canonical abstract roles can live
--    alongside the wire roles without breaking existing writes.
-- ------------------------------------------------------------------
alter table public.messages
  add column if not exists canonical_role text
    check (canonical_role in ('SYSTEM', 'USER', 'AGENT', 'TOOL_INVOCATION', 'TOOL_RESULT')),
  add column if not exists provider text,
  add column if not exists model_id text,
  add column if not exists tool_call_id text;

-- ------------------------------------------------------------------
-- 2. EMSH Genotype: abstracted execution DAGs (not raw transcripts).
--    `intent_signature` is a stable semantic cluster id; `intent_embedding`
--    stores the 768-dim intent vector for similarity recall.
-- ------------------------------------------------------------------
create table if not exists public.genotypes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  intent_signature text not null,
  intent_embedding vector(768),
  abstract_dag jsonb not null,
  fitness_score double precision not null default 1.0,
  execution_count integer not null default 1,
  success_rate double precision not null default 1.0,
  parent_genotype_ids uuid[] not null default '{}'::uuid[],
  generation integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists genotypes_intent_signature_idx
  on public.genotypes (intent_signature);

create index if not exists genotypes_fitness_idx
  on public.genotypes (fitness_score desc);

create index if not exists genotypes_workspace_idx
  on public.genotypes (workspace_id);

create index if not exists genotypes_embedding_idx
  on public.genotypes using ivfflat (intent_embedding vector_cosine_ops)
  with (lists = 100);

-- Append-only fitness lineage (never update-in-place; only insert).
create table if not exists public.genotype_fitness_events (
  id uuid primary key default gen_random_uuid(),
  genotype_id uuid not null references public.genotypes(id) on delete cascade,
  score double precision not null,
  signal text not null check (signal in ('explicit', 'semantic', 'delta', 'critic')),
  source_session_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists genotype_fitness_events_genotype_idx
  on public.genotype_fitness_events (genotype_id, created_at desc);

-- ------------------------------------------------------------------
-- 3. Durable HITL approvals — replaces the volatile in-memory
--    approvalStore Map (lost on serverless cold starts).
-- ------------------------------------------------------------------
create table if not exists public.durable_approvals (
  id uuid primary key default gen_random_uuid(),
  approval_id text unique not null,
  user_id text not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  tool_name text not null,
  payload jsonb not null,
  status text not null
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'))
    default 'PENDING',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists durable_approvals_approval_id_idx
  on public.durable_approvals (approval_id);

create index if not exists durable_approvals_status_expires_idx
  on public.durable_approvals (status, expires_at);

-- ------------------------------------------------------------------
-- 4. Row Level Security — enable gates on all new tables.
--    Policies mirror the user/workspace scoping used across the repo.
-- ------------------------------------------------------------------
alter table public.genotypes enable row level security;
alter table public.genotype_fitness_events enable row level security;
alter table public.durable_approvals enable row level security;

-- Genotypes: workspace members may read their workspace's genotypes.
create policy "Workspace members can view genotypes"
  on public.genotypes for select
  using (
    workspace_id is null
    or workspace_id in (
      select workspace_id from public.workspace_members
      where user_id = auth.uid()::text
    )
  );

-- Durable approvals: only the owning user may select their own.
create policy "Users can view own durable approvals"
  on public.durable_approvals for select
  using (user_id = auth.uid()::text);

create policy "Users can insert own durable approvals"
  on public.durable_approvals for insert
  with check (user_id = auth.uid()::text);

create policy "Users can update own durable approvals"
  on public.durable_approvals for update
  using (user_id = auth.uid()::text);

create policy "Users can delete own durable approvals"
  on public.durable_approvals for delete
  using (user_id = auth.uid()::text);