-- Migration to add external identity fields to user_integrations table
-- This enables explicit identity tracking without relying on email equality.

ALTER TABLE public.user_integrations
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Comment: The metadata column will store service-specific linked account data.
-- For GitHub, it will store:
-- {
--   "github_user_id": "string",
--   "github_login": "string",
--   "github_email": "string"
-- }
