import { sanitizeForLog } from '@/lib/security/urlValidator';
/**
 * Slack Token Manager (Supabase Edition)
 * Handles multi-tenant token resolution from Supabase
 * 
 * Uses RPC functions to securely handle encryption/decryption of tokens
 * on the database side.
 */

import { supabase } from '@/lib/supabaseClient';

// Encryption key for RPC calls - matches what we used in the callback
// We fallback to SLACK_CLIENT_SECRET if no dedicated key is providing, matching the callback logic
const ENCRYPTION_KEY = process.env.SLACK_TOKEN_ENCRYPTION_KEY || process.env.SLACK_CLIENT_SECRET;

if (!ENCRYPTION_KEY) {
  console.warn('[TOKEN_MANAGER] ⚠️ No encryption key found. Slack token retrieval will fail.');
}

export interface SlackConfig {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  scopes: string[];
  userId?: string; // Linked Supabase User ID (owner of the integration)
}

export interface SlackInstallation {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  userId?: string; // Supabase User ID
}

/**
 * Get Slack configuration for a specific workspace
 * @param teamId - Slack Team ID (T...)
 */
export async function getSlackConfig(teamId: string): Promise<SlackConfig> {
  if (!teamId) throw new Error('Team ID is required');

  // 1. Env Var Override (Dev/Testing)
  if (process.env.SLACK_BOT_TOKEN && (!process.env.NODE_ENV || process.env.NODE_ENV === 'development')) {
    console.warn(`[TOKEN_MANAGER] ⚠️ Using environment variable override for team ${teamId}`);
    return {
      teamId,
      teamName: 'Env Var Workspace',
      botToken: process.env.SLACK_BOT_TOKEN,
      botUserId: process.env.SLACK_BOT_USER_ID || '',
      scopes: ['app_mentions:read', 'chat:write'],
    };
  }

  // 2. Fetch from Supabase via Secure RPC
  // The RPC 'get_slack_integration' decrypts the token for us
  const { data, error } = await supabase
    .rpc('get_slack_integration', {
      p_slack_team_id: teamId,
      p_encryption_key: ENCRYPTION_KEY
    })
    .single();

  if (error || !data) {
    console.error(`[TOKEN_MANAGER] Failed to fetch token for team ${sanitizeForLog(teamId)}:`, error?.message);
    throw new Error(`No Slack installation found for team ${sanitizeForLog(teamId)}`);
  }

  return {
    teamId: data.slack_team_id,
    teamName: 'Workspace', // RPC might not return name to keep it light, or we can add it
    botToken: data.access_token, // This is the decrypted token
    botUserId: data.bot_user_id,
    scopes: [], // We might store scopes in DB if needed, currently optional
    userId: data.user_id, // Return the linked Supabase user ID
  };
}

/**
 * Check if a team has an active installation
 */
export async function hasInstallation(teamId: string): Promise<boolean> {
  if (!teamId) return false;

  const { count, error } = await supabase
    .from('slack_integrations')
    .select('*', { count: 'exact', head: true })
    .eq('slack_team_id', teamId);

  return !error && count !== null && count > 0;
}

/**
 * Remove Slack installation
 */
export async function removeSlackInstallation(teamId: string): Promise<void> {
  if (!teamId) throw new Error('Team ID is required');

  const { error } = await supabase
    .from('slack_integrations')
    .delete()
    .eq('slack_team_id', teamId);

  if (error) {
    console.error(`[TOKEN_MANAGER] Failed to remove team ${teamId}:`, error);
    throw new Error('Failed to remove installation');
  }

  console.log(`[TOKEN_MANAGER] Removed installation for team ${teamId}`);
}

/**
 * Save installation (Programmatic usage if needed, mostly used by Callback route directly)
 */
export async function saveSlackInstallation(installation: {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  userId?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('upsert_slack_integration', {
    p_slack_team_id: installation.teamId,
    p_slack_team_name: installation.teamName,
    p_access_token: installation.botToken,
    p_bot_user_id: installation.botUserId,
    p_user_id: installation.userId || null,
    p_encryption_key: ENCRYPTION_KEY
  });

  if (error) {
    throw new Error(`Failed to save installation: ${error.message}`);
  }
}
