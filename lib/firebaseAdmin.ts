/**
 * Centralized Firebase Admin Initialization
 * 
 * This module ensures Firebase Admin is initialized only once with proper credentials.
 * All other files should import from here instead of initializing their own instance.
 * 
 * IMPORTANT: This module MUST be imported before any other module that uses Firebase Admin.
 */

import * as admin from 'firebase-admin';

// Track if we initialized with proper credentials
let initializedWithCredentials = false;

/**
 * Helper to ensure private key is in correct PEM format
 */
function formatPrivateKey(key: string): string {
  // 1. Replace literal "\n" characters with real newlines
  let formatted = key.replace(/\\n/g, '\n');

  // 2. If it's a one-liner that wasn't fixed by step 1 (i.e. had no escaped newlines),
  //    we need to insert newlines around the headers.
  if (formatted.indexOf('\n') === -1) {
    formatted = formatted
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  }

  return formatted;
}

function getServiceAccountFromEnv(): admin.ServiceAccount | null {
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;

  if (serviceAccountJson) {
    try {
      // Clean string to remove potential bad control characters (newlines)
      const cleanedJson = serviceAccountJson.replace(/[\n\r]+/g, '');
      const parsed = JSON.parse(cleanedJson);
      if (parsed.project_id && parsed.private_key && parsed.client_email) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: formatPrivateKey(parsed.private_key),
        };
      }
    } catch (error) {
      console.error('[FIREBASE_ADMIN] Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON:', error);
    }
  }

  // Try individual environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
}

function initializeFirebaseAdmin(): admin.app.App {
  const serviceAccount = getServiceAccountFromEnv();

  // If already initialized
  if (admin.apps.length > 0) {
    const existingApp = admin.app();

    // If we have credentials but the existing app might not have them,
    // we can't reinitialize, but we can at least log a warning
    if (serviceAccount && !initializedWithCredentials) {
      console.warn('[FIREBASE_ADMIN] Firebase was already initialized without proper credentials. Some operations may fail.');
    }

    return existingApp;
  }

  console.log('[FIREBASE_ADMIN] Initializing Firebase Admin...');

  // Method 1: Use service account from environment
  if (serviceAccount) {
    try {
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
      console.log('[FIREBASE_ADMIN] Initialized with service account credentials');
      initializedWithCredentials = true;
      return app;
    } catch (error) {
      console.error('[FIREBASE_ADMIN] Failed to initialize with service account:', error);
    }
  }

  // Method 2: Try GOOGLE_APPLICATION_CREDENTIALS file path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
      const app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: projectId || undefined,
      });
      console.log('[FIREBASE_ADMIN] Initialized with GOOGLE_APPLICATION_CREDENTIALS');
      initializedWithCredentials = true;
      return app;
    } catch (error) {
      console.error('[FIREBASE_ADMIN] Failed to initialize with application default:', error);
    }
  }

  // Method 3: Fallback - initialize without credentials (will fail on Firestore operations)
  console.error('[FIREBASE_ADMIN] No valid credentials found! Firebase operations will fail.');
  console.error('[FIREBASE_ADMIN] Please set GCP_SERVICE_ACCOUNT_KEY_JSON environment variable.');

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  if (projectId) {
    return admin.initializeApp({ projectId });
  }

  return admin.initializeApp();
}

// Initialize on module load
const firebaseApp = initializeFirebaseAdmin();

// Export the initialized app and Firestore instance
export const app = firebaseApp;
export const db = admin.firestore();
export { admin };

// Helper to check if properly initialized
export function isProperlyInitialized(): boolean {
  return initializedWithCredentials;
}

// Helper to get project ID
export function getProjectId(): string | undefined {
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      return parsed.project_id;
    } catch {
      // Ignore parse errors
    }
  }
  return process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
}

// Helper to reinitialize if needed (for testing)
export function reinitializeIfNeeded(): boolean {
  if (initializedWithCredentials) {
    return true; // Already properly initialized
  }

  const serviceAccount = getServiceAccountFromEnv();
  if (!serviceAccount) {
    return false; // No credentials available
  }

  // Can't reinitialize if already initialized
  if (admin.apps.length > 0) {
    console.warn('[FIREBASE_ADMIN] Cannot reinitialize - Firebase already initialized');
    return false;
  }

  return true;
}
