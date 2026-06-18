-- Partner API Key System
-- Enables companies to integrate with Lattice OS via the /api/v1 gateway.
-- Keys are hashed at rest (never store plaintext). Each key is scoped to a
-- workspace with explicit scopes, rate limits, and usage metering for billing.

-- ============================================================
-- partner_keys: API keys issued to integrating companies
-- ============================================================
create table if not exists public.partner_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null,                       -- Clerk user who created the key (owner)
  name text not null,                          -- Human label, e.g. "Acme Prod"
  key_prefix text not null,                    -- Visible prefix, e.g. "lat_live_a1b2" (for UI display)
  key_hash text not null,                      -- SHA-256 hash of full key (never store plaintext)
  environment text not null default 'test',    -- 'test' | 'live'
  scopes text[] not null default '{}',         -- e.g. {'memory:write','query:read','stream:read'}
  rate_limit_per_min integer not null default 100,
  revoked boolean not null default false,
  last_used_at timestamptz,
  expires_at timestamptz,                       -- null = no expiry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_keys_environment_check check (environment in ('test', 'live'))
);

create unique index if not exists partner_keys_key_hash_idx on public.partner_keys (key_hash);
create index if not exists partner_keys_workspace_idx on public.partner_keys (workspace_id);
create index if not exists partner_keys_user_idx on public.partner_keys (user_id);
create index if not exists partner_keys_active_idx on public.partner_keys (workspace_id) where revoked = false;

-- ============================================================
-- partner_usage: per-call metering for billing + analytics
-- ============================================================
create table if not exists public.partner_usage (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.partner_keys(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  endpoint text not null,                       -- e.g. '/api/v1/query'
  method text not null default 'POST',
  status_code integer not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  model_used text,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists partner_usage_key_idx on public.partner_usage (key_id);
create index if not exists partner_usage_workspace_idx on public.partner_usage (workspace_id);
create index if not exists partner_usage_created_idx on public.partner_usage (created_at);

-- Composite index for billing rollups (per key, per day)
create index if not exists partner_usage_billing_idx
  on public.partner_usage (key_id, created_at);

-- ============================================================
-- touch updated_at trigger on partner_keys
-- ============================================================
drop trigger if exists partner_keys_touch_updated_at on public.partner_keys;
create trigger partner_keys_touch_updated_at
before update on public.partner_keys
for each row
execute function public.touch_updated_at();

-- ============================================================
-- RLS: partner_keys + partner_usage are server-only (service role).
-- We do NOT enable client RLS access — all reads/writes go through
-- the API gateway using the service role key. Enable RLS to deny
-- anon/authenticated by default.
-- ============================================================
alter table public.partner_keys enable row level security;
alter table public.partner_usage enable row level security;

-- No policies = deny all for anon/authenticated. Service role bypasses RLS.
