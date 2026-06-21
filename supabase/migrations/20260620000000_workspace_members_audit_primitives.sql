-- Enterprise workspace membership + audit primitives
-- Adds project/workspace RBAC without changing the product-level rule that
-- workspace == project. The customer organization remains represented by the
-- appliance license until org-level SSO/SCIM needs its own table.

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null,
  role text not null default 'member',
  invited_by text,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  constraint workspace_members_role_check check (role in ('owner', 'admin', 'member', 'viewer'))
);

create index if not exists workspace_members_workspace_idx
  on public.workspace_members (workspace_id, role);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, role);

-- Backfill every existing workspace owner as an explicit owner member.
insert into public.workspace_members (workspace_id, user_id, role, accepted_at)
select id, user_id, 'owner', now()
from public.workspaces
on conflict (workspace_id, user_id) do update
set role = case
    when public.workspace_members.role = 'owner' then public.workspace_members.role
    else excluded.role
  end,
  accepted_at = coalesce(public.workspace_members.accepted_at, excluded.accepted_at),
  updated_at = now();

alter table public.workspace_members enable row level security;

-- Service role performs all dashboard/admin writes. Authenticated users can
-- inspect only their own memberships for transparency; API routes enforce RBAC.
drop policy if exists "Users can view own workspace memberships" on public.workspace_members;
create policy "Users can view own workspace memberships"
  on public.workspace_members
  for select
  using (auth.uid()::text = user_id);

drop trigger if exists workspace_members_touch_updated_at on public.workspace_members;
create trigger workspace_members_touch_updated_at
before update on public.workspace_members
for each row
execute function public.touch_updated_at();

-- Audit log is already append-only. Add indexes that make enterprise/admin
-- reviews efficient without storing secrets or broad PII in metadata.
create index if not exists idx_audit_log_workspace_id
  on public.audit_log ((metadata->>'workspaceId'), created_at desc)
  where metadata ? 'workspaceId';

create index if not exists idx_audit_log_license_instance
  on public.audit_log ((metadata->>'instanceId'), created_at desc)
  where metadata ? 'instanceId';
