-- Seed data for local P0 verification of /api/v1/tasks
-- Run these statements in your local Supabase SQL editor.

-- 1. Ensure a deterministic test workspace exists (not default to avoid index collision)
INSERT INTO public.workspaces (
  id,
  user_id,
  name,
  slug,
  description,
  kind,
  status,
  is_default,
  onboarding_state,
  routing_profile,
  memory_profile,
  last_opened_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'Local Dev Workspace',
  'local-dev-workspace',
  'Workspace used for local partner API task execution tests.',
  'personal',
  'active',
  false,
  'active',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed a test partner API key
-- Plaintext: lat_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
-- SHA-256: b08f706a90f5354ba5009d50f340ea3490a1a9f0b2876dfdd23a28f02ca8d36f
INSERT INTO public.partner_keys (
  workspace_id,
  user_id,
  name,
  key_prefix,
  key_hash,
  environment,
  scopes,
  rate_limit_per_min,
  revoked,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'local-dev-test-key',
  'lat_test_0123',
  'b08f706a90f5354ba5009d50f340ea3490a1a9f0b2876dfdd23a28f02ca8d36f',
  'test',
  ARRAY['stream:read','memory:read','tasks:write','tasks:read'],
  60,
  false,
  NULL,
  now(),
  now()
)
ON CONFLICT (key_hash) DO NOTHING;
