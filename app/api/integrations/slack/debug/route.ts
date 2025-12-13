/**
 * Debug endpoint to check Slack OAuth configuration
 * Remove this in production!
 */

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  
  // Get the base URL the same way auth route does
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  if (baseUrl) {
    baseUrl = baseUrl.replace(/\/+$/, '');
  } else {
    baseUrl = requestUrl.origin;
  }
  
  const redirectUri = `${baseUrl}/api/integrations/slack/callback`;
  
  return NextResponse.json({
    debug: {
      NEXT_PUBLIC_APP_URL_raw: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
      NEXT_PUBLIC_APP_URL_cleaned: baseUrl,
      requestOrigin: requestUrl.origin,
      constructedRedirectUri: redirectUri,
      SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID ? 'SET (hidden)' : 'NOT SET',
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ? 'SET (hidden)' : 'NOT SET',
    },
    instructions: {
      step1: 'Copy the constructedRedirectUri value',
      step2: 'Go to https://api.slack.com/apps → Your App → OAuth & Permissions',
      step3: 'Add the exact URI to Redirect URLs',
      step4: 'Make sure there are no extra spaces or characters',
    }
  }, { status: 200 });
}
