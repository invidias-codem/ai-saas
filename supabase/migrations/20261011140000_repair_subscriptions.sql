-- Targeted repair for 42P01 in increment_free_interaction_count.
-- Apply this file alone after inspecting the target database; do not push the backlog.
begin;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  clerk_user_id text not null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  stripe_status text not null default 'incomplete',
  tier text not null default 'free',
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists premium_until timestamptz,
  add column if not exists free_interaction_count integer not null default 0;

-- Fail transactionally if legacy duplicates exist. Never guess which paid row wins.
create unique index if not exists subscriptions_clerk_user_id_unique
  on public.subscriptions (clerk_user_id);
create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

-- Existing webhook writers supply clerk_user_id only. Keep the legacy column
-- compatible without requiring every writer to duplicate the identity.
create or replace function public.prepare_subscription_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_id := coalesce(new.user_id, new.clerk_user_id);
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists subscriptions_prepare_row on public.subscriptions;
create trigger subscriptions_prepare_row before insert or update on public.subscriptions
  for each row execute function public.prepare_subscription_row();

-- All current subscription access uses supabaseAdmin. Clients must never be
-- able to set their own tier, payment identifiers, or paid-through date.
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

create or replace function public.increment_free_interaction_count(target_user_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_count integer;
begin
  if target_user_id is null or btrim(target_user_id) = '' then
    raise exception 'target_user_id is required';
  end if;
  insert into public.subscriptions (user_id, clerk_user_id, tier, free_interaction_count)
    values (target_user_id, target_user_id, 'free', 1)
  on conflict (clerk_user_id) do update
    set free_interaction_count = public.subscriptions.free_interaction_count + 1,
        updated_at = now()
    where public.subscriptions.tier = 'free'
  returning free_interaction_count into new_count;
  return coalesce(new_count, 0);
end;
$$;
revoke all on function public.increment_free_interaction_count(text) from public, anon, authenticated;
grant execute on function public.increment_free_interaction_count(text) to service_role;

notify pgrst, 'reload schema';
commit;
