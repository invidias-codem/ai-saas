/**
 * Slack Disconnect Endpoint
 * Disconnects the Slack integration for the user by revoking the OAuth token
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const SLACK_REVOKE_URL = 'https://slack.com/api/auth.revoke';

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    
    if (!botToken) {
      console.log('[SLACK_DISCONNECT] No bot token configured, nothing to revoke');
      return NextResponse.json({
        success: true,
        message: 'Slack integration disconnected (no active connection)',
      });
    }

    // Attempt to revoke the token with Slack
    // Note: In a multi-workspace setup, you would fetch the user's specific token from the database
    try {
      const revokeResponse = await fetch(SLACK_REVOKE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${botToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const revokeData = await revokeResponse.json();
      
      console.log('[SLACK_DISCONNECT] Revoke response:', {
        ok: revokeData.ok,
        error: revokeData.error,
        userId,
      });

      if (revokeData.ok) {
        // Token successfully revoked
        // In production, you would also:
        // 1. Remove the token from your database
        // 2. Clear any cached Slack data for this user
        // 3. Update user preferences in Firestore
        
        return NextResponse.json({
          success: true,
          message: 'Successfully disconnected from Slack. The bot has been removed from your workspace.',
          revoked: true,
        });
      } else if (revokeData.error === 'token_revoked') {
        // Token was already revoked
        return NextResponse.json({
          success: true,
          message: 'Slack was already disconnected.',
          revoked: true,
        });
      } else if (revokeData.error === 'invalid_auth' || revokeData.error === 'not_authed') {
        // Token is invalid or expired - consider it disconnected
        return NextResponse.json({
          success: true,
          message: 'Slack connection cleared (token was invalid or expired).',
          revoked: false,
        });
      } else {
        // Other error from Slack
        console.error('[SLACK_DISCONNECT] Slack API error:', revokeData.error);
        return NextResponse.json({
          success: false,
          error: `Failed to revoke Slack access: ${revokeData.error}`,
          details: revokeData.error,
        }, { status: 400 });
      }
    } catch (revokeError: any) {
      console.error('[SLACK_DISCONNECT] Network error during revoke:', revokeError);
      // If we can't reach Slack, still allow "disconnection" on our end
      return NextResponse.json({
        success: true,
        message: 'Disconnected from Slack (could not verify with Slack servers).',
        warning: 'You may need to manually remove the app from your Slack workspace settings.',
        revoked: false,
      });
    }

  } catch (error: any) {
    console.error('[SLACK_DISCONNECT_ERROR]', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to disconnect Slack',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
