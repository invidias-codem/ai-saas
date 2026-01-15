import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

// Initialize Supabase Client for Edge
// We use the centralized client from lib
const encryptionKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY || process.env.SLACK_CLIENT_SECRET!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  // 1. Handle Errors
  if (error) {
    return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=${error}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=missing_params`);
  }

  try {
    // 2. Verify State (Stateless)
    const [userIdRaw, timestampRaw, signature] = state.split(':');

    // Check timestamp (expiration: 15 mins)
    const timestamp = parseInt(timestampRaw);
    if (Date.now() - timestamp > 15 * 60 * 1000) {
      return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=state_expired`);
    }

    // Verify Signature
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    const dataToVerify = `${userIdRaw}:${timestampRaw}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(clientSecret);
    const msgData = encoder.encode(dataToVerify);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, msgData);
    const calculatedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    if (calculatedSig !== signature) {
      console.error('[SLACK_CALLBACK] Signature mismatch');
      return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=invalid_state`);
    }

    // 3. Exchange Code for Token
    const redirectUri = `${cleanBaseUrl}/api/integrations/slack/callback`;
    const tokenResponse = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok) {
      console.error('[SLACK_CALLBACK] Token exchange failed:', tokenData.error);
      return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=${tokenData.error}`);
    }

    // 4. Save to Supabase (Upsert via RPC)
    const { supabaseAdmin } = await import('@/lib/supabaseClient');

    // "system" indicates a public install (no specific user logged in during auth start)
    // If userIdRaw is valid UUID, we link it.
    const userIdToLink = (userIdRaw && userIdRaw !== 'system' && userIdRaw !== 'undefined') ? userIdRaw : null;

    const { error: rpcError } = await supabaseAdmin.rpc('upsert_slack_integration', {
      p_slack_team_id: tokenData.team.id,
      p_slack_team_name: tokenData.team.name,
      p_access_token: tokenData.access_token,
      p_bot_user_id: tokenData.bot_user_id,
      p_user_id: userIdToLink,
      p_encryption_key: encryptionKey
    });

    if (rpcError) {
      console.error('[SLACK_CALLBACK] DB Save failed:', rpcError);
      return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=db_error`);
    }

    // 5. Success
    return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_success=true&team=${encodeURIComponent(tokenData.team.name)}`);

  } catch (err) {
    console.error('[SLACK_CALLBACK] Unexpected error:', err);
    return NextResponse.redirect(`${cleanBaseUrl}/settings?slack_error=server_error`);
  }
}
