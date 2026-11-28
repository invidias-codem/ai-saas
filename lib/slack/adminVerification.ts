/**
 * Slack Admin Verification
 * 
 * Provides authoritative admin permission checks using verified Slack API responses.
 * Does NOT trust arbitrary usergroup names - only official Slack admin flags.
 */

export interface SlackAdminCheckResult {
  isAdmin: boolean;
  reason: 'workspace_owner' | 'workspace_admin' | 'primary_owner' | 'not_admin' | 'api_error';
}

/**
 * Check if a Slack user is a workspace admin/owner using verified Slack API
 * Only trusts official Slack user flags: is_admin, is_owner, is_primary_owner
 * Does NOT fall back to arbitrary usergroup membership (security hardening)
 */
export async function verifySlackAdmin(
  botToken: string,
  userId: string
): Promise<SlackAdminCheckResult> {
  try {
    const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { 'Authorization': `Bearer ${botToken}` }
    });
    const userInfo = await userInfoRes.json();

    if (!userInfo.ok) {
      console.error('[SLACK_ADMIN] users.info failed:', userInfo.error);
      return { isAdmin: false, reason: 'api_error' };
    }

    const user = userInfo.user;
    if (user?.is_primary_owner) return { isAdmin: true, reason: 'primary_owner' };
    if (user?.is_owner) return { isAdmin: true, reason: 'workspace_owner' };
    if (user?.is_admin) return { isAdmin: true, reason: 'workspace_admin' };

    return { isAdmin: false, reason: 'not_admin' };
  } catch (error) {
    console.error('[SLACK_ADMIN] Admin check failed:', error);
    return { isAdmin: false, reason: 'api_error' };
  }
}

/**
 * Simple boolean check for backward compatibility
 * @deprecated Use verifySlackAdmin for detailed result
 */
export async function isSlackAdmin(
  botToken: string,
  teamId: string, // unused, kept for compatibility
  userId: string
): Promise<boolean> {
  const result = await verifySlackAdmin(botToken, userId);
  return result.isAdmin;
}