create table if not exists ucol_routing_telemetry (
  id text primary key,
  request_id text not null,
  route_timestamp timestamptz not null default now(),
  intent_category text not null,
  workspace_id text,
  operating_profile_id text,
  execution_mode text not null,
  selected_model_refs jsonb not null default '[]'::jsonb,
  selected_tools jsonb not null default '[]'::jsonb,
  read_scopes jsonb not null default '[]'::jsonb,
  memory_hits integer,
  graph_hits integer,
  latency_ms integer,
  estimated_cost_usd numeric,
  outcome text not null,
  user_correction_signal text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ucol_routing_telemetry_request_id on ucol_routing_telemetry(request_id);
create index if not exists idx_ucol_routing_telemetry_route_timestamp on ucol_routing_telemetry(route_timestamp desc);
create index if not exists idx_ucol_routing_telemetry_intent_category on ucol_routing_telemetry(intent_category);
