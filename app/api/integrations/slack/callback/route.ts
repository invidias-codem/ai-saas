/**
 * Slack OAuth Callback
 * Handles the OAuth redirect after user authorizes Slack app
 * Stores installation data in Firestore for multi-tenancy
 * 
 * Flow:
 * 1. User clicks "Add to Slack" or "Connect Slack"
 * 2. Slack redirects here with authorization code
 * 3. We exchange code for access token
 * 4. We store the token in Firestore (keyed by team_id)
 * 5. We redirect user back to settings page
 */

import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import {
  saveSlackInstallation,
  logInstallationEvent,
  hasInstallation,
} from '@/lib/slack/tokenManager';

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';

export async function GET(req: Request) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Determine the base URL for redirects
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

    // ─────────────────────────────────────────────────────────────────
    // 1. Handle Authorization Errors from Slack
    // ─────────────────────────────────────────────────────────────────
    if (error) {
      console.error('[SLACK_CALLBACK] Authorization error from Slack:', error);
      return redirectWithError(baseUrl, error);
    }

    if (!code) {
      console.error('[SLACK_CALLBACK] Missing authorization code');
      return redirectWithError(baseUrl, 'missing_code');
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. Validate State Parameter (CSRF Protection)
    // ─────────────────────────────────────────────────────────────────
    let stateUserId: string | null = null;
    let stateTimestamp: number | null = null;

    if (state) {
      try {
        const decodedState = Buffer.from(state, 'base64').toString();
        const [userId, timestamp] = decodedState.split(':');
        stateUserId = userId;
        stateTimestamp = parseInt(timestamp, 10);

        // Verify state is not too old (10 minutes max)
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        if (stateTimestamp < tenMinutesAgo) {
          console.error('[SLACK_CALLBACK] State expired');
          return redirectWithError(baseUrl, 'state_expired');
        }

        console.log('[SLACK_CALLBACK] State validated for user:', stateUserId);
      } catch (err) {
        console.error('[SLACK_CALLBACK] Invalid state parameter:', err);
        return redirectWithError(baseUrl, 'invalid_state');
      }
    } else {
      // State is optional for public "Add to Slack" button
      console.log('[SLACK_CALLBACK] No state parameter - public installation');
    }

    // ─────────────────────────────────────────────────────────────────
    // 3. Exchange Authorization Code for Access Token
    // ────────────��────────────────────────────────────────────────────
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[SLACK_CALLBACK] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET');
      return redirectWithError(baseUrl, 'server_configuration_error');
    }

    // Construct redirect URI (must match exactly what was sent in auth request)
    const redirectUri = `${baseUrl}/api/integrations/slack/callback`;

    console.log('[SLACK_CALLBACK] Exchanging code for token:', {
      redirectUri,
      hasCode: !!code,
    });

    const tokenResponse = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    console.log('[SLACK_CALLBACK] Token response:', {
      ok: tokenData.ok,
      error: tokenData.error,
      team: tokenData.team?.name,
      teamId: tokenData.team?.id,
      botUserId: tokenData.bot_user_id,
      hasAccessToken: !!tokenData.access_token,
    });

    if (!tokenData.ok) {
      console.error('[SLACK_CALLBACK] Token exchange failed:', tokenData.error);
      return redirectWithError(baseUrl, tokenData.error || 'token_exchange_failed');
    }

    // ─────────────────────────────────────────────────────────────────
    // 4. Extract Installation Data
    // ─────────────────────────────────────────────────────────────────
    const {
      access_token: botToken,
      authed_user: authedUser,
      team,
      bot_user_id: botUserId,
      scope,
    } = tokenData;

    if (!team?.id || !botToken || !botUserId) {
      console.error('[SLACK_CALLBACK] Missing required fields in token response:', {
        hasTeamId: !!team?.id,
        hasBotToken: !!botToken,
        hasBotUserId: !!botUserId,
      });
      return redirectWithError(baseUrl, 'incomplete_token_response');
    }

    // ───────────────────────────────────────────────────────��─────────
    // 5. Check if this is a new installation or reinstall
    // ─────────────────────────────────────────────────────────────────
    const isReinstall = await hasInstallation(team.id);

    // ─────────────────────────────────────────────────────────────────
    // 6. Store Installation in Firestore (CRITICAL FOR MULTI-TENANCY)
    // ─────────────────────────────────────────────────────────────────
    const installationData = {
      // Workspace Info
      teamId: team.id,
      teamName: team.name || 'Unknown Workspace',

      // Bot Credentials
      botToken: botToken,
      botUserId: botUserId,

      // Installing User
      installedBy: {
        slackUserId: authedUser?.id || 'unknown',
        clerkUserId: stateUserId || undefined,
      },

      // Scopes
      scopes: scope ? scope.split(',') : [],
    };

    await saveSlackInstallation(installationData);

    console.log('[SLACK_CALLBACK] Installation saved:', {
      teamId: team.id,
      teamName: team.name,
      isReinstall,
      hasClerkUser: !!stateUserId,
    });

    // ─────────────────────────────────────────────────────────────────
    // 7. Link to User Context (if user was logged in)
    // ─────────────────────────────────────────────────────────────────
    if (stateUserId) {
      try {
        const userContextRef = db
          .collection('users')
          .doc(stateUserId)
          .collection('context')
          .doc('profile');

        await userContextRef.set(
          {
            'integrations.slackEnabled': true,
            'integrations.slackTeamId': team.id,
            'integrations.slackTeamName': team.name,
            'integrations.slackBotUserId': botUserId,
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        console.log('[SLACK_CALLBACK] Linked installation to user:', stateUserId);
      } catch (userUpdateError) {
        // Non-fatal - installation still succeeded
        console.warn('[SLACK_CALLBACK] Failed to update user context:', userUpdateError);
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // 8. Log Installation Event (for analytics)
    // ─────────────────────────────────────────────────────────────────
    await logInstallationEvent({
      type: isReinstall ? 'reinstall' : 'install',
      teamId: team.id,
      teamName: team.name,
      installedBy: authedUser?.id,
      clerkUserId: stateUserId || undefined,
      duration: Date.now() - startTime,
    });

    // ─────────────────────────────────────────────────────────────────
    // 9. Redirect to Success Page
    // ─────────────────────────────────────────────────────────────────
    const successUrl = new URL('/settings', baseUrl);
    successUrl.searchParams.set('slack_success', 'true');
    successUrl.searchParams.set('slack_team', team.name || 'Workspace');
    successUrl.searchParams.set('slack_team_id', team.id);

    console.log('[SLACK_CALLBACK] Installation complete:', {
      teamId: team.id,
      teamName: team.name,
      clerkUserId: stateUserId,
      isReinstall,
      duration: Date.now() - startTime,
    });

    return NextResponse.redirect(successUrl.toString());
  } catch (error: any) {
    console.error('[SLACK_CALLBACK_ERROR]', error);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    return redirectWithError(baseUrl, 'callback_failed');
  }
}

/**
 * Helper to redirect with error parameter
 */
function redirectWithError(baseUrl: string, errorCode: string): NextResponse {
  const settingsUrl = new URL('/settings', baseUrl);
  settingsUrl.searchParams.set('slack_error', errorCode);
  return NextResponse.redirect(settingsUrl.toString());
}
