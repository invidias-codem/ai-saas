/**
 * Debug endpoint to check Slack OAuth configuration
 * Remove this in production!
 */

import { NextResponse } from 'next/server';
import { db, isProperlyInitialized, getProjectId } from '@/lib/firebaseAdmin';

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
  
  // Check Firebase initialization
  let firebaseStatus = 'UNKNOWN';
  let firestoreTest = 'NOT_TESTED';
  let firestoreError = null;
  
  try {
    // Test Firestore connection
    const testDoc = await db.collection('slackInstallations').limit(1).get();
    firestoreTest = `SUCCESS - Found ${testDoc.size} documents`;
    firebaseStatus = 'WORKING';
  } catch (error: any) {
    firestoreError = error.message;
    firestoreTest = `ERROR: ${error.message}`;
    firebaseStatus = 'ERROR';
  }
  
  // Check service account JSON parsing
  let serviceAccountStatus = 'NOT_SET';
  let serviceAccountProjectId = null;
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      serviceAccountProjectId = parsed.project_id;
      serviceAccountStatus = parsed.project_id ? 'VALID' : 'MISSING_PROJECT_ID';
    } catch (e: any) {
      serviceAccountStatus = `PARSE_ERROR: ${e.message}`;
    }
  }
  
  return NextResponse.json({
    debug: {
      NEXT_PUBLIC_APP_URL_raw: process.env.NEXT_PUBLIC_APP_URL || '(not set)',
      NEXT_PUBLIC_APP_URL_cleaned: baseUrl,
      requestOrigin: requestUrl.origin,
      constructedRedirectUri: redirectUri,
      SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID ? 'SET (hidden)' : 'NOT SET',
      SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ? 'SET (hidden)' : 'NOT SET',
      SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET ? 'SET (hidden)' : 'NOT SET',
      GCP_SERVICE_ACCOUNT_KEY_JSON: serviceAccountJson ? 
        `SET (${serviceAccountJson.length} chars)` : 'NOT SET',
      GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID || '(not set)',
    },
    firebase: {
      status: firebaseStatus,
      properlyInitialized: isProperlyInitialized(),
      projectId: getProjectId(),
      serviceAccountStatus,
      serviceAccountProjectId,
      firestoreTest,
      firestoreError,
    },
    instructions: {
      step1: 'Copy the constructedRedirectUri value',
      step2: 'Go to https://api.slack.com/apps → Your App → OAuth & Permissions',
      step3: 'Add the exact URI to Redirect URLs',
      step4: 'Make sure there are no extra spaces or characters',
      step5: 'Check firebase.status - should be WORKING',
      step6: 'Check firebase.firestoreTest - should show SUCCESS',
      step7: 'If firebase.serviceAccountStatus shows PARSE_ERROR, fix the JSON in Vercel env vars',
    }
  }, { status: 200 });
}
