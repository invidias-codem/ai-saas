/**
 * Slack Integration Status Endpoint
 * Returns the current Slack integration status for the user
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if Slack is configured via environment variables
    const hasSlackConfig = !!(
      process.env.SLACK_BOT_TOKEN &&
      process.env.SLACK_SIGNING_SECRET &&
      process.env.SLACK_APP_ID
    );

    if (!hasSlackConfig) {
      return NextResponse.json({
        connected: false,
        message: 'Slack integration not configured',
      });
    }

    // In a full implementation, you would check Firestore for user-specific config
    // For now, we'll check if the bot token is valid by making a test API call
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.ok) {
        return NextResponse.json({
          connected: true,
          workspaceName: data.team,
          botUserId: data.user_id,
          botName: data.user,
          notificationsEnabled: true,
        });
      } else {
        return NextResponse.json({
          connected: false,
          error: data.error,
        });
      }
    } catch (error) {
      return NextResponse.json({
        connected: false,
        error: 'Failed to verify Slack connection',
      });
    }
  } catch (error: any) {
    console.error('[SLACK_STATUS_ERROR]', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to get Slack status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
