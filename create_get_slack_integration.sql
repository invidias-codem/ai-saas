-- ==============================================================================
-- Create Missing RPC Function: get_slack_integration
-- Goal: Retrieve and decrypt the Slack access token.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_slack_integration(p_slack_team_id text, p_encryption_key text)
RETURNS TABLE (
  slack_team_id text,
  access_token text,
  bot_user_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    si.slack_team_id,
    pgp_sym_decrypt(si.access_token, p_encryption_key) as access_token,
    si.bot_user_id
  FROM public.slack_integrations si
  WHERE si.slack_team_id = p_slack_team_id;
END;
$$;
