-- Partner webhook subscriptions and delivery log.
-- Partners register webhook URLs; we sign and POST events to them
-- (e.g. memory.created, key.revoked, quota.warning).

create table if not exists public.partner_webhooks (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.partner_keys(id) on delete cascade,
  endpoint_url text not null,
  signing_secret text not null,                  -- HMAC-SHA256 secret sent in X-Lattice-Signature
  events text[] not null default '{}',           -- e.g. {'memory.created','memory.deleted','key.revoked'}
  active boolean not null default true,
  description text,                              -- human label, e.g. "Prod alerting"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_webhooks_key_idx on public.partner_webhooks (key_id);
create index if not exists partner_webhooks_active_idx on public.partner_webhooks (active) where active = true;

create table if not exists public.partner_webhook_log (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.partner_webhooks(id) on delete cascade,
  event_type text not null,
  payload_body jsonb not null,
  response_status integer,
  response_body text,                            -- truncated to 2KB
  duration_ms integer,
  success boolean not null,
  attempt_number integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists partner_webhook_log_webhook_idx on public.partner_webhook_log (webhook_id);
create index if not exists partner_webhook_log_created_idx on public.partner_webhook_log (created_at desc);
create index if not exists partner_webhook_log_failure_idx on public.partner_webhook_log (webhook_id, success) where success = false;

alter table public.partner_webhooks enable row level security;
alter table public.partner_webhook_log enable row level security;

drop trigger if exists partner_webhooks_touch_updated_at on public.partner_webhooks;
create trigger partner_webhooks_touch_updated_at
before update on public.partner_webhooks
for each row
execute function public.touch_updated_at();
