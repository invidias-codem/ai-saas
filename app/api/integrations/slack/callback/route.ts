/**
 * Slack OAuth Callback
 * Handles the OAuth redirect after user authorizes Slack app
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import axios from 'axios';
import { env } from '@/lib/env';

const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export async function GET(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for authorization errors
    if (error) {
      return new NextResponse(
        JSON.stringify({
          error: 'Authorization denied',
          details: error,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!code || !state) {
      return new NextResponse('Invalid callback parameters', { status: 400 });
    }

    // Verify state parameter
    try {
      const [stateUserId] = Buffer.from(state, 'base64').toString().split(':');
      if (stateUserId !== userId) {
        return new NextResponse('State mismatch - possible CSRF attack', {
          status: 400,
        });
      }
    } catch (err) {
      return new NextResponse('Invalid state parameter', { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(SLACK_TOKEN_URL, {
      client_id: env.SLACK_APP_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
    });

    const {
      access_token: botToken,
      user_id: slackUserId,
      channel: slackChannelId,
      ok,
    } = tokenResponse.data;

    if (!ok) {
      return new NextResponse(
        JSON.stringify({
          error: 'Slack authorization failed',
          details: tokenResponse.data.error,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Store bot token, user ID, channel in Firestore securely
    // For now, return success response
    // In production: Encrypt and store in user's integrations collection

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Slack integration configured successfully',
        // Don't expose tokens in response
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('[SLACK_CALLBACK_ERROR]', error);
    return new NextResponse(
      JSON.stringify({
        error: 'Failed to complete Slack authentication',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
