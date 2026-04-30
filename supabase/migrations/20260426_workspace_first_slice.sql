-- Workspace-first slice
-- Establishes a default workspace model so conversations can become
-- workspace-scoped and the product can evolve from tool-grid to
-- memory-native intelligence workspace.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  slug text not null,
  description text,
  kind text not null default 'personal',
  status text not null default 'active',
  icon text,
  color text,
  is_default boolean not null default false,
  onboarding_state text not null default 'starter',
  routing_profile jsonb not null default '{}'::jsonb,
  memory_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  constraint workspaces_kind_check check (kind in ('personal', 'project', 'research', 'operations', 'social', 'custom')),
  constraint workspaces_status_check check (status in ('active', 'archived')),
  constraint workspaces_onboarding_state_check check (onboarding_state in ('starter', 'configured', 'active'))
);

create unique index if not exists workspaces_user_slug_idx on public.workspaces (user_id, slug);
create unique index if not exists workspaces_default_user_idx on public.workspaces (user_id) where is_default = true;
create index if not exists workspaces_user_id_idx on public.workspaces (user_id);

create table if not exists public.workspace_state (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_open_conversation_id uuid null,
  last_open_tab text not null default 'overview',
  pinned_memory_ids jsonb not null default '[]'::jsonb,
  pinned_artifact_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.conversations
  add column if not exists workspace_id uuid null references public.workspaces(id) on delete set null;

create index if not exists conversations_workspace_id_idx on public.conversations (workspace_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workspaces_touch_updated_at
before update on public.workspaces
for each row
execute function public.touch_updated_at();

create trigger workspace_state_touch_updated_at
before update on public.workspace_state
for each row
execute function public.touch_updated_at();
