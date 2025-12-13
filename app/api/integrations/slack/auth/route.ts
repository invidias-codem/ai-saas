/**
 * Slack OAuth Authentication Endpoint
 * Initiates OAuth 2.0 flow for Slack integration
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const redirectUri = searchParams.get('redirect_uri');

    if (!redirectUri) {
      return new NextResponse('Missing redirect_uri parameter', { status: 400 });
    }

    // Get Client ID from environment - use SLACK_CLIENT_ID (not SLACK_APP_ID)
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId) {
      console.error('[SLACK_AUTH] SLACK_CLIENT_ID not configured');
      return new NextResponse(
        JSON.stringify({
          error: 'Slack integration not configured',
          details: 'SLACK_CLIENT_ID environment variable is missing',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate state for CSRF protection
    const state = Buffer.from(`${userId}:${Date.now()}`).toString('base64');

    // Redirect to Slack OAuth
    const slackAuthUrl = new URL(SLACK_AUTH_URL);
    slackAuthUrl.searchParams.append('client_id', clientId);
    slackAuthUrl.searchParams.append('redirect_uri', redirectUri);
    slackAuthUrl.searchParams.append('response_type', 'code');
    slackAuthUrl.searchParams.append('state', state);
    // Updated scopes for bot functionality
    slackAuthUrl.searchParams.append(
      'scope',
      'app_mentions:read,chat:write,commands,im:history,im:read,im:write,reactions:write,users:read'
    );

    console.log('[SLACK_AUTH] Redirecting to Slack OAuth with client_id:', clientId.substring(0, 10) + '...');

    return NextResponse.redirect(slackAuthUrl.toString());
  } catch (error: any) {
    console.error('[SLACK_AUTH_ERROR]', error);
    return new NextResponse(
      JSON.stringify({
        error: 'Failed to initiate Slack authentication',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
