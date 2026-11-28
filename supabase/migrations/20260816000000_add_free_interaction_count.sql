-- Add free_interaction_count to subscriptions for metered nudge

alter table public.subscriptions
  add column if not exists free_interaction_count integer not null default 0;

create index if not exists subscriptions_free_interaction_count_idx
  on public.subscriptions (free_interaction_count);
