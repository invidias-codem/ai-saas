-- Sovereign AI Telemetry — enterprise audit table (Phase 3.1)
-- Lives on the DEDICATED telemetry Supabase instance (SUPABASE_TELEMETRY_URL),
-- NOT the main transactional DB (DECIDED 2026-07-12, Q3).

create table if not exists public.ai_interaction_audit (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,                 -- Clerk user id (separate instance; not a FK)
  conversation_id text,
  workspace_id text,
  record jsonb not null,                 -- full UDIF 2.0 interaction-audit
  prev_record_hash text,                 -- hash-chain linkage (Phase 3.2)
  governance_signature text,             -- tamper-evident signature (Phase 3.2)
  created_at timestamptz not null default now()
);

create index if not exists ai_interaction_audit_user_id_idx
  on public.ai_interaction_audit (user_id);
create index if not exists ai_interaction_audit_created_at_idx
  on public.ai_interaction_audit (created_at desc);

-- RLS: only the service role (backend flush endpoint) may write; the owning
-- user may read their own rows by user_id. No anon access.
alter table public.ai_interaction_audit enable row level security;

drop policy if exists "ai_interaction_audit_admin_write" on public.ai_interaction_audit;
create policy "ai_interaction_audit_admin_write" on public.ai_interaction_audit
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "ai_interaction_audit_owner_read" on public.ai_interaction_audit;
create policy "ai_interaction_audit_owner_read" on public.ai_interaction_audit
  for select
  using (auth.uid()::text = user_id);
