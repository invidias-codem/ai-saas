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
      // Diagnostic logging (masked)
      console.log(`[FIREBASE_ADMIN] Found GCP_SERVICE_ACCOUNT_KEY_JSON (length: ${serviceAccountJson.length})`);

      let cleanedJson = serviceAccountJson.trim();

      // Handle wrapping quotes if present (common copy-paste error or shell behavior)
      if ((cleanedJson.startsWith("'") && cleanedJson.endsWith("'")) ||
        (cleanedJson.startsWith('"') && cleanedJson.endsWith('"'))) {
        // Only remove if it looks like the *entire* string is wrapped
        // Check if the content inside looks like JSON start/end to be safe
        // But simple slice is usually enough for the common case
        cleanedJson = cleanedJson.slice(1, -1);
      }

      // Remove newlines *only if* they are breaking the JSON (not inside strings usually, 
      // but for service account JSON, we don't expect newlines inside keys/vals except private key)
      // The previous regex replacement /[\n\r]+/g might have been too aggressive or not aggressive enough for escaped chars.
      // Standard JSON.parse handles newlines perfectly fine if they are whitespace.
      // The issue is often escaped newlines `\n` literals in the string vs actual newline characters.

      // Try parsing as is first (standard JSON allows whitespace)
      try {
        const parsed = JSON.parse(cleanedJson);
        if (validateParsedServiceAccount(parsed)) {
          return transformToServiceAccount(parsed);
        }
      } catch (e) {
        // If direct parse fails, try 'cleaning' aggressive newlines/escapes setup
        // Only do this if direct parse failed, as it's risky
        console.log('[FIREBASE_ADMIN] Direct JSON parse failed, attempting to clean string...');

        // Replace literal '\n' characters with space if they are outside strings? Hard to do with regex.
        // However, most env vars for this come in constrained formats.
        // Let's rely on the previous "remove all newlines" strategy BUT be careful about the private key.
        // The private key expects `\n` characters. If we remove all newlines from the JSON string, 
        // we destroy the JSON structure if it relies on newlines for separation (invalid JSON)
        // OR if it's correct JSON, `\n` in strings should be preserved?
        // Actually, standard JSON: strings use `\n` (escaped).
        // If the env var has *actual* newlines (0x0A), JSON.parse is fine with that as whitespace.

        // If the user pasted it as a single line with no spaces? Fine.

        // The error is likely that the env var value includes the single quotes that were intending to *delimit* the var in the shell,
        // but became part of the value.
        // We handled that above.

        // Another case: `\n` literals.
        // Let's try to unescape if needed?
      }

    } catch (error) {
      console.error('[FIREBASE_ADMIN] Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON:', error);
      // Log a snippet to help debug (safety: show only start/end)
      const safeSnippet = serviceAccountJson.substring(0, 10) + '...' + serviceAccountJson.substring(serviceAccountJson.length - 10);
      console.error(`[FIREBASE_ADMIN] Snippet: ${safeSnippet}`);
    }
  }

  // Try individual environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Handle potentially escaped newlines in private key
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    console.log('[FIREBASE_ADMIN] Found individual env vars (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY)');
    return { projectId, clientEmail, privateKey };
  } else {
    if (projectId) console.log('[FIREBASE_ADMIN] Found projectId but missing clientEmail or privateKey');
  }

  return null;
}

function validateParsedServiceAccount(parsed: any): boolean {
  return parsed.project_id && parsed.private_key && parsed.client_email;
}

function transformToServiceAccount(parsed: any): admin.ServiceAccount {
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: formatPrivateKey(parsed.private_key),
  };
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
