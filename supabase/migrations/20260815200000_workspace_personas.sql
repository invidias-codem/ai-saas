-- Migration: 20260815200000_workspace_personas.sql
-- Purpose: Store synthesized chameleon persona text per workspace

create table if not exists public.workspace_personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null,
  name text not null default 'default',
  content text not null,
  model text not null default 'gemini-2.5-flash',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_personas_workspace_id_idx
  on public.workspace_personas (workspace_id);

create index if not exists workspace_personas_user_id_idx
  on public.workspace_personas (user_id);

alter table public.workspace_personas enable row level security;

create policy "Users can view own workspace personas"
  on public.workspace_personas for select
  using (auth.uid()::text = user_id or user_id is null);

create policy "Users can insert own workspace personas"
  on public.workspace_personas for insert
  with check (auth.uid()::text = user_id or user_id is null);

create policy "Users can update own workspace personas"
  on public.workspace_personas for update
  using (auth.uid()::text = user_id or user_id is null);

create policy "Users can delete own workspace personas"
  on public.workspace_personas for delete
  using (auth.uid()::text = user_id or user_id is null);

create trigger workspace_personas_touch_updated_at
  before update on public.workspace_personas
  for each row execute function public.touch_updated_at();
