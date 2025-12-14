/**
 * Centralized Firebase Admin Initialization
 * 
 * This module ensures Firebase Admin is initialized only once with proper credentials.
 * All other files should import from here instead of initializing their own instance.
 */

import * as admin from 'firebase-admin';

// Singleton pattern - only initialize once
let initialized = false;

function initializeFirebaseAdmin(): admin.app.App {
  // If already initialized with proper credentials, return existing app
  if (admin.apps.length > 0) {
    // Check if the existing app has proper credentials by testing Firestore
    return admin.app();
  }

  console.log('[FIREBASE_ADMIN] Initializing Firebase Admin...');

  // Method 1: Try GCP_SERVICE_ACCOUNT_KEY_JSON (full JSON string)
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      if (serviceAccount.project_id && serviceAccount.private_key && serviceAccount.client_email) {
        const app = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
          }),
          projectId: serviceAccount.project_id,
        });
        console.log('[FIREBASE_ADMIN] Initialized with GCP_SERVICE_ACCOUNT_KEY_JSON');
        initialized = true;
        return app;
      }
    } catch (error) {
      console.error('[FIREBASE_ADMIN] Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON:', error);
    }
  }

  // Method 2: Try individual environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
    console.log('[FIREBASE_ADMIN] Initialized with individual env vars');
    initialized = true;
    return app;
  }

  // Method 3: Try GOOGLE_APPLICATION_CREDENTIALS file path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId || undefined,
    });
    console.log('[FIREBASE_ADMIN] Initialized with GOOGLE_APPLICATION_CREDENTIALS');
    initialized = true;
    return app;
  }

  // Method 4: Fallback - try application default (works in GCP environments)
  if (projectId) {
    const app = admin.initializeApp({
      projectId,
    });
    console.log('[FIREBASE_ADMIN] Initialized with projectId only (GCP environment)');
    initialized = true;
    return app;
  }

  // Last resort - initialize without credentials (will fail on Firestore operations)
  console.error('[FIREBASE_ADMIN] No valid credentials found! Firebase operations will fail.');
  const app = admin.initializeApp();
  return app;
}

// Initialize on module load
const firebaseApp = initializeFirebaseAdmin();

// Export the initialized app and Firestore instance
export const app = firebaseApp;
export const db = admin.firestore();
export { admin };

// Helper to check if properly initialized
export function isProperlyInitialized(): boolean {
  return initialized;
}

// Helper to get project ID
export function getProjectId(): string | undefined {
  try {
    const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson);
      return parsed.project_id;
    }
  } catch {
    // Ignore parse errors
  }
  return process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
}
