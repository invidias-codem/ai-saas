-- guest_infrastructure.sql
-- Phase 1 of the guest-first platform: guest_sessions, rate_limit_counters,
-- and the check_rate_limit rolling-window RPC. Run via Supabase SQL editor or pg_cron.

-- ── 1. Guest sessions (TTL via cleanup job in step 6) ──────────────
create table if not exists guest_sessions (
  guest_id      text primary key,
  created_at    timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  ip_hash       text,
  user_agent    text,
  converted_to_user_id text,
  converted_at timestamptz
);

create index if not exists idx_guest_sessions_created
  on guest_sessions (created_at);

create index if not exists idx_guest_sessions_converted
  on guest_sessions (converted_to_user_at)
  where converted_to_user_id is not null;

-- ── 2. Rate limit counters (rolling window) ─────────────────────────
create table if not exists rate_limit_counters (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null default 0
);

create index if not exists idx_rate_limit_window
  on rate_limit_counters (window_start);

-- ── 3. Rolling-window rate limit RPC ────────────────────────────────
-- Returns TRUE when the limit IS EXCEEDED (caller should 429).
create or replace function check_rate_limit(
  p_key            text,
  p_window_interval interval,
  p_max_requests   int
) returns boolean as $$
begin
  -- Prune stale windows first
  delete from rate_limit_counters
   where key = p_key and window_start < now() - p_window_interval;

  -- Atomic increment
  insert into rate_limit_counters(key, window_start, count)
  values(p_key, now(), 1)
  on conflict(key) do update
   set count = rate_limit_counters.count + 1;

  return (select count from rate_limit_counters where key = p_key) > p_max_requests;
end;
$$ language plpgsql volatile;

comment on function check_rate_limit(text, interval, int) is
  'Rolling-window rate limiter. Returns true if p_max_requests exceeded within p_window_interval.';
