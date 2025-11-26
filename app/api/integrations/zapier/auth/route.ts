/**
 * Zapier OAuth Authentication Endpoint
 * Initiates OAuth 2.0 flow for Zapier integration
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

const ZAPIER_AUTH_URL = 'https://zapier.com/oauth/authorize';

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

    // Generate state for CSRF protection
    const state = Buffer.from(`${userId}:${Date.now()}`).toString('base64');

    // Redirect to Zapier OAuth
    const zapierAuthUrl = new URL(ZAPIER_AUTH_URL);
    zapierAuthUrl.searchParams.append('client_id', env.ZAPIER_CLIENT_ID || '');
    zapierAuthUrl.searchParams.append('redirect_uri', redirectUri);
    zapierAuthUrl.searchParams.append('response_type', 'code');
    zapierAuthUrl.searchParams.append('state', state);
    zapierAuthUrl.searchParams.append('scope', 'read write');

    return NextResponse.redirect(zapierAuthUrl.toString());
  } catch (error: any) {
    console.error('[ZAPIER_AUTH_ERROR]', error);
    return new NextResponse(
      JSON.stringify({
        error: 'Failed to initiate Zapier authentication',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
