-- ==============================================================================
-- Fix Slack Integration User ID Type
-- Goal: Change user_id from UUID to TEXT to support Clerk IDs.
-- ==============================================================================

-- 1. Drop the Policy FIRST (because it depends on the column type)
DROP POLICY IF EXISTS "Users can view their own slack integrations" ON public.slack_integrations;

-- 2. Drop the constraint if it exists
ALTER TABLE public.slack_integrations DROP CONSTRAINT IF EXISTS slack_integrations_user_id_fkey;

-- 3. Alter the column type to TEXT
ALTER TABLE public.slack_integrations ALTER COLUMN user_id TYPE text;

-- 4. Re-create the RLS Policy
CREATE POLICY "Users can view their own slack integrations"
ON public.slack_integrations FOR SELECT
USING (auth.uid()::text = user_id);

-- 4. Update the RPC Function Signature
-- We must drop the old function first because changing argument types changes the signature identity in Postgres
DROP FUNCTION IF EXISTS public.upsert_slack_integration(text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.upsert_slack_integration(
  p_slack_team_id text,
  p_slack_team_name text,
  p_access_token text,
  p_bot_user_id text,
  p_user_id text, -- Changed from uuid to text
  p_encryption_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp -- Maintaining security best practice from previous fix
AS $$
BEGIN
  INSERT INTO public.slack_integrations (slack_team_id, slack_team_name, access_token, bot_user_id, user_id, updated_at)
  VALUES (
    p_slack_team_id,
    p_slack_team_name,
    pgp_sym_encrypt(p_access_token, p_encryption_key),
    p_bot_user_id,
    p_user_id,
    now()
  )
  ON CONFLICT (slack_team_id)
  DO UPDATE SET
    slack_team_name = EXCLUDED.slack_team_name,
    access_token = EXCLUDED.access_token,
    bot_user_id = EXCLUDED.bot_user_id,
    user_id = EXCLUDED.user_id,
    updated_at = now();
END;
$$;
