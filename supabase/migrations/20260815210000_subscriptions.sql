-- Migration: 20260815210000_subscriptions.sql
-- Purpose: Track Stripe subscriptions for expert/enterprise tiers.

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

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

create index if not exists subscriptions_clerk_user_id_idx
  on public.subscriptions (clerk_user_id);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id);

create index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions (stripe_subscription_id);

create unique index if not exists subscriptions_user_id_unique
  on public.subscriptions (user_id)
  where tier in ('pro', 'enterprise');

alter table public.subscriptions enable row level security;

create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid()::text = user_id or user_id is null);

create policy "Users can insert own subscriptions"
  on public.subscriptions for insert
  with check (auth.uid()::text = user_id or user_id is null);

create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid()::text = user_id or user_id is null);

create policy "Users can delete own subscriptions"
  on public.subscriptions for delete
  using (auth.uid()::text = user_id or user_id is null);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();
