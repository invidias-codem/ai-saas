-- Lambda instance state + event log
-- Used by the smart proxy to persist instance info across process restarts

create table if not exists lambda_state (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

create table if not exists lambda_events (
  id         bigserial primary key,
  event      text not null,
  detail     text,
  ts         double precision,  -- unix epoch from Python
  created_at timestamptz default now()
);

-- RLS: service role only (these tables are internal)
alter table lambda_state  enable row level security;
alter table lambda_events enable row level security;

create policy "service role only" on lambda_state  using (auth.role() = 'service_role');
create policy "service role only" on lambda_events using (auth.role() = 'service_role');
