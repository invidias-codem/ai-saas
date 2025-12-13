/**
 * Slack OAuth Callback
 * Handles the OAuth redirect after user authorizes Slack app
 */

import { NextResponse } from 'next/server';

const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Determine the base URL for redirects
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

    // Check for authorization errors from Slack
    if (error) {
      console.error('[SLACK_CALLBACK] Authorization error from Slack:', error);
      const settingsUrl = new URL('/settings', baseUrl);
      settingsUrl.searchParams.set('slack_error', error);
      return NextResponse.redirect(settingsUrl.toString());
    }

    if (!code || !state) {
      console.error('[SLACK_CALLBACK] Missing code or state parameter');
      const settingsUrl = new URL('/settings', baseUrl);
      settingsUrl.searchParams.set('slack_error', 'missing_parameters');
      return NextResponse.redirect(settingsUrl.toString());
    }

    // Extract userId from state parameter (we encoded it during auth)
    // State format: base64(userId:timestamp)
    let stateUserId: string;
    let stateTimestamp: number;
    
    try {
      const decodedState = Buffer.from(state, 'base64').toString();
      const [userId, timestamp] = decodedState.split(':');
      stateUserId = userId;
      stateTimestamp = parseInt(timestamp, 10);
      
      // Verify state is not too old (10 minutes max)
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      if (stateTimestamp < tenMinutesAgo) {
        console.error('[SLACK_CALLBACK] State expired');
        const settingsUrl = new URL('/settings', baseUrl);
        settingsUrl.searchParams.set('slack_error', 'state_expired');
        return NextResponse.redirect(settingsUrl.toString());
      }
      
      console.log('[SLACK_CALLBACK] State validated for user:', stateUserId);
    } catch (err) {
      console.error('[SLACK_CALLBACK] Invalid state parameter:', err);
      const settingsUrl = new URL('/settings', baseUrl);
      settingsUrl.searchParams.set('slack_error', 'invalid_state');
      return NextResponse.redirect(settingsUrl.toString());
    }

    // Get credentials from environment
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[SLACK_CALLBACK] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET');
      return new NextResponse('Slack integration not configured', { status: 500 });
    }

    // Exchange code for access token using form-urlencoded format
    const tokenResponse = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    const tokenData = await tokenResponse.json();

    console.log('[SLACK_CALLBACK] Token response:', {
      ok: tokenData.ok,
      error: tokenData.error,
      team: tokenData.team?.name,
    });

    if (!tokenData.ok) {
      console.error('[SLACK_CALLBACK] Token exchange failed:', tokenData.error);
      const settingsUrl = new URL('/settings', baseUrl);
      settingsUrl.searchParams.set('slack_error', tokenData.error || 'token_exchange_failed');
      return NextResponse.redirect(settingsUrl.toString());
    }

    // Successfully got tokens
    const {
      access_token: botToken,
      authed_user,
      team,
      bot_user_id,
    } = tokenData;

    console.log('[SLACK_CALLBACK] Successfully authenticated:', {
      team: team?.name,
      botUserId: bot_user_id,
      userId: authed_user?.id,
      clerkUserId: stateUserId,
    });

    // Log the bot token (first 20 chars) for debugging
    console.log('[SLACK_CALLBACK] Bot token received:', botToken?.substring(0, 20) + '...');

    // TODO: Store bot token securely in Firestore for this user (stateUserId)
    // For now, the bot token should be set as SLACK_BOT_TOKEN env var
    // In production, you would store per-user tokens in the database

    // Redirect to settings page with success
    const settingsUrl = new URL('/settings', baseUrl);
    settingsUrl.searchParams.set('slack_success', 'true');
    settingsUrl.searchParams.set('slack_team', team?.name || 'Workspace');
    return NextResponse.redirect(settingsUrl.toString());

  } catch (error: any) {
    console.error('[SLACK_CALLBACK_ERROR]', error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const settingsUrl = new URL('/settings', baseUrl);
    settingsUrl.searchParams.set('slack_error', 'callback_failed');
    return NextResponse.redirect(settingsUrl.toString());
  }
}
