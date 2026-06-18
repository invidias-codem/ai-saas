-- Enterprise License System
-- Supports the Docker appliance model: one instance per deployment,
-- license key determines which features are unlocked (community vs enterprise).
--
-- Tier gates:
--   community  → no SAML/SSO, no multi-node clustering, no RBAC
--   enterprise → full SSO, Kubernetes clustering, RBAC, priority support
--
-- This is the mechanism that makes the "feature-gated community container"
-- strategy work. The container ships everything; the license key turns on
-- the enterprise features.

create table if not exists public.enterprise_licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text not null,                     -- the activation key, e.g. "LATOS-ENT-XXXX-XXXX-XXXX"
  instance_id uuid,                              -- nullable: set when container activates the license (self-registration)
  organization_name text not null,               -- the customer company, e.g. "Acme Corp"
  tier text not null default 'community',        -- 'community' | 'enterprise'
  feature_gates text[] not null default '{}',    -- e.g. {'sso:saml','rbac','multi_node','priority_support'}
  max_nodes integer not null default 1,          -- how many Kubernetes nodes this license covers
  max_seats integer not null default 5,          -- user seats included
  contact_email text not null,                   -- billing/admin contact
  activated_at timestamptz,                      -- null = not yet activated (issued ahead of deployment)
  expires_at timestamptz,                        -- null = perpetual (rare), otherwise annual renewal
  last_heartbeat_at timestamptz,                 -- container pings back (optional, never required for functionality)
  revoked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,   -- ad-hoc notes from sales/onboarding team
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_licenses_tier_check check (tier in ('community', 'enterprise'))
);

create unique index if not exists enterprise_licenses_license_key_idx on public.enterprise_licenses (license_key);
create index if not exists enterprise_licenses_instance_idx on public.enterprise_licenses (instance_id);
create index if not exists enterprise_licenses_active_idx on public.enterprise_licenses (revoked, expires_at) where revoked = false;

-- ============================================================
-- RLS: server-only (service role). No anon/authenticated access.
-- Containers reach this through internal admin-only endpoints.
-- ============================================================
alter table public.enterprise_licenses enable row level security;

drop trigger if exists enterprise_licenses_touch_updated_at on public.enterprise_licenses;
create trigger enterprise_licenses_touch_updated_at
before update on public.enterprise_licenses
for each row
execute function public.touch_updated_at();
