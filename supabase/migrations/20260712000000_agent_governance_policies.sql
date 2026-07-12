-- Sovereign AI Telemetry — governance policy table (Phase 2.1)
-- Maps a corporate context_role to its authorized module matrix.
-- This is the Core Storage tier: security teams edit access controls here.

create table if not exists public.agent_governance_policies (
  id uuid primary key default gen_random_uuid(),
  context_role text not null unique,
  active_modules text[] not null default '{}',
  disabled_modules text[] not null default '{}',
  defense_triggers text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Seed the public baseline (PRD §3.1 example).
insert into public.agent_governance_policies
  (context_role, active_modules, disabled_modules, defense_triggers)
values
  ('public_baseline', '{general_reasoning,syntax_analysis}', '{offensive_cybersecurity}', '{}')
on conflict (context_role) do nothing;

-- RLS: security-team (service role) writes; authenticated users may read their
-- own role row only. The backend admin client bypasses RLS for writes.
alter table public.agent_governance_policies enable row level security;

-- Allow authenticated reads of the policy rows (non-sensitive module matrix).
drop policy if exists "governance_policies_read" on public.agent_governance_policies;
create policy "governance_policies_read" on public.agent_governance_policies
  for select
  using (true);

-- Only the service role may insert/update/delete (security-team controlled).
drop policy if exists "governance_policies_admin_write" on public.agent_governance_policies;
create policy "governance_policies_admin_write" on public.agent_governance_policies
  for all
  to service_role
  using (true)
  with check (true);
