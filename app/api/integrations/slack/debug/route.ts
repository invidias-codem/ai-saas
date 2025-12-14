/**
 * Debug endpoint to check Slack OAuth configuration
 * Remove this in production!
 */

import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

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
  let firebaseStatus = 'NOT_INITIALIZED';
  let firebaseError = null;
  let firestoreTest = 'NOT_TESTED';
  
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      firebaseStatus = 'ALREADY_INITIALIZED';
    } else {
      // Try to initialize
      const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
      
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id,
          });
          firebaseStatus = 'INITIALIZED_WITH_SERVICE_ACCOUNT';
        } catch (parseError: any) {
          firebaseError = `JSON Parse Error: ${parseError.message}`;
          firebaseStatus = 'PARSE_ERROR';
        }
      } else {
        firebaseStatus = 'NO_SERVICE_ACCOUNT_JSON';
      }
    }
    
    // Test Firestore connection
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      const testDoc = await db.collection('slackInstallations').limit(1).get();
      firestoreTest = `SUCCESS - Found ${testDoc.size} documents`;
    }
  } catch (error: any) {
    firebaseError = error.message;
    firestoreTest = `ERROR: ${error.message}`;
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
      GCP_SERVICE_ACCOUNT_KEY_JSON: process.env.GCP_SERVICE_ACCOUNT_KEY_JSON ? 
        `SET (${process.env.GCP_SERVICE_ACCOUNT_KEY_JSON.length} chars)` : 'NOT SET',
      GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID || '(not set)',
    },
    firebase: {
      status: firebaseStatus,
      error: firebaseError,
      appsCount: admin.apps.length,
      firestoreTest,
    },
    instructions: {
      step1: 'Copy the constructedRedirectUri value',
      step2: 'Go to https://api.slack.com/apps → Your App → OAuth & Permissions',
      step3: 'Add the exact URI to Redirect URLs',
      step4: 'Make sure there are no extra spaces or characters',
      step5: 'Check firebase.status - should be INITIALIZED_WITH_SERVICE_ACCOUNT',
      step6: 'Check firebase.firestoreTest - should show SUCCESS',
    }
  }, { status: 200 });
}
