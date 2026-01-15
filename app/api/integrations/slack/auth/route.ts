import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'edge';

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize';

/**
 * Initiates the Slack OAuth 2.0 flow
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();

    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.url);
      return NextResponse.redirect(signInUrl);
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Slack configuration missing' },
        { status: 500 }
      );
    }

    // Determine Redirect URI
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    // Remove trailing slash if present
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const redirectUri = `${cleanBaseUrl}/api/integrations/slack/callback`;

    // ─────────────────────────────────────────────────────────────────
    // Generate Stateless "State" Parameter
    // ─────────────────────────────────────────────────────────────────
    // We sign the state to prevent tampering. 
    // Format: "userId:timestamp:signature"
    const timestamp = Date.now().toString();
    const dataToSign = `${userId || 'system'}:${timestamp}`;

    // Create a signature using the Client Secret (or dedicated key)
    // Using Web Crypto API for Edge compatibility
    const encoder = new TextEncoder();
    const keyData = encoder.encode(clientSecret);
    const msgData = encoder.encode(dataToSign);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, msgData);
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Final state string (url-safe usually preferred, but base64 is accepted by Slack usually if short enough)
    // We replace characters to make it URL safe just in case
    const safeSignature = signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const state = `${dataToSign}:${safeSignature}`;

    // ─────────────────────────────────────────────────────────────────
    // Build OAuth URL
    // ─────────────────────────────────────────────────────────────────
    const slackAuthUrl = new URL(SLACK_AUTH_URL);
    slackAuthUrl.searchParams.append('client_id', clientId);
    slackAuthUrl.searchParams.append('redirect_uri', redirectUri);
    // Scopes needed for the requested bot functionality
    slackAuthUrl.searchParams.append('scope', 'app_mentions:read,chat:write,commands,im:history,im:read,im:write,reactions:write,users:read,assistant:write');
    slackAuthUrl.searchParams.append('state', state);

    return NextResponse.redirect(slackAuthUrl.toString());
  } catch (error: any) {
    console.error('[SLACK_AUTH_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to initiate Slack authentication' },
      { status: 500 }
    );
  }
}
