/**
 * Zapier OAuth Callback
 * Handles the OAuth redirect after user authorizes Zapier
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import axios from 'axios';
import { env } from '@/lib/env';

const ZAPIER_TOKEN_URL = 'https://zapier.com/oauth/token';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
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
    const tokenResponse = await axios.post(ZAPIER_TOKEN_URL, {
      client_id: env.ZAPIER_CLIENT_ID,
      client_secret: env.ZAPIER_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    });

    const { access_token, refresh_token } = tokenResponse.data;

    // TODO: Store access token and refresh token in Firestore securely
    // For now, return success response
    // In production: Encrypt and store in user's integrations collection

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: 'Zapier integration configured successfully',
        // Don't expose tokens in response
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('[ZAPIER_CALLBACK_ERROR]', error);
    return new NextResponse(
      JSON.stringify({
        error: 'Failed to complete Zapier authentication',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
