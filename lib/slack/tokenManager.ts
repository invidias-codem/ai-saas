/**
 * Slack Token Manager
 * Handles multi-tenant token resolution from Firestore
 * 
 * This is the central service for resolving workspace credentials.
 * Instead of using a single SLACK_BOT_TOKEN env variable, this service
 * fetches the correct token for each workspace from Firestore.
 */

import { db, admin } from '@/lib/firebaseAdmin';

/**
 * Slack configuration for a specific workspace
 */
export interface SlackConfig {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  scopes: string[];
}

/**
 * Full installation data stored in Firestore
 */
export interface SlackInstallation {
  // Workspace Info
  teamId: string;
  teamName: string;

  // Bot Credentials
  botToken: string;
  botUserId: string;

  // Installing User
  installedBy: {
    slackUserId: string;
    clerkUserId?: string;
  };

  // Scopes
  scopes: string[];

  // Timestamps
  createdAt: number;
  updatedAt: number;

  // Optional: Link to internal organization
  organizationId?: string;
}

/**
 * Get Slack configuration for a specific workspace
 * @param teamId - Slack Team ID (T...)
 * @returns SlackConfig or throws if not found
 */
export async function getSlackConfig(teamId: string): Promise<SlackConfig> {
  if (!teamId) {
    throw new Error('Team ID is required');
  }

  // OVERRIDE: Prioritize local .env token if available
  // This ensures local testing works and allows simple single-tenant deployment via Env Vars
  if (process.env.SLACK_BOT_TOKEN) {
    console.warn(`[TOKEN_MANAGER] ⚠️ Using environment variable override for team ${teamId}`);
    return {
      teamId,
      teamName: 'Env Var Workspace',
      botToken: process.env.SLACK_BOT_TOKEN,
      botUserId: process.env.SLACK_BOT_USER_ID || '',
      scopes: ['app_mentions:read', 'chat:write'],
    };
  }

  const installationRef = db.collection('slackInstallations').doc(teamId);
  const doc = await installationRef.get();

  if (!doc.exists) {
    // Fallback: Use local environment variables if available
    // This allows developers to test without needing a synchronized Firestore database
    if (process.env.SLACK_BOT_TOKEN) {
      console.warn(`[TOKEN_MANAGER] Using environment variable fallback for team ${teamId}`);
      return {
        teamId,
        teamName: 'Env Var Workspace',
        botToken: process.env.SLACK_BOT_TOKEN,
        botUserId: process.env.SLACK_BOT_USER_ID || '', // Optional: Set in .env for better mention cleaning
        scopes: ['app_mentions:read', 'chat:write'],
      };
    }

    console.error(`[TOKEN_MANAGER] No installation found for team ${teamId}`);
    throw new Error(`No Slack installation found for team ${teamId}`);
  }

  const data = doc.data() as SlackInstallation;

  // Validate required fields
  if (!data.botToken || !data.botUserId) {
    console.error(`[TOKEN_MANAGER] Invalid installation data for team ${teamId}`);
    throw new Error(`Invalid Slack installation for team ${teamId}`);
  }

  return {
    teamId: data.teamId,
    teamName: data.teamName,
    botToken: data.botToken,
    botUserId: data.botUserId,
    scopes: data.scopes || [],
  };
}

/**
 * Store or update Slack installation
 * Uses upsert pattern - updates if exists, creates if not
 * @param installation - Installation data from OAuth callback
 */
export async function saveSlackInstallation(installation: {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  installedBy: {
    slackUserId: string;
    clerkUserId?: string;
  };
  scopes: string[];
}): Promise<void> {
  if (!installation.teamId) {
    throw new Error('Team ID is required');
  }

  const installationRef = db.collection('slackInstallations').doc(installation.teamId);
  const existingDoc = await installationRef.get();

  const now = Date.now();

  if (existingDoc.exists) {
    // Update existing installation (preserve createdAt)
    await installationRef.update({
      teamName: installation.teamName,
      botToken: installation.botToken,
      botUserId: installation.botUserId,
      installedBy: installation.installedBy,
      scopes: installation.scopes,
      updatedAt: now,
    });
    console.log(`[TOKEN_MANAGER] Updated installation for team ${installation.teamId}`);
  } else {
    // Create new installation
    await installationRef.set({
      ...installation,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[TOKEN_MANAGER] Created installation for team ${installation.teamId}`);
  }
}

/**
 * Remove Slack installation (when user disconnects)
 * @param teamId - Slack Team ID
 */
export async function removeSlackInstallation(teamId: string): Promise<void> {
  if (!teamId) {
    throw new Error('Team ID is required');
  }

  const installationRef = db.collection('slackInstallations').doc(teamId);
  const doc = await installationRef.get();

  if (!doc.exists) {
    console.warn(`[TOKEN_MANAGER] No installation to remove for team ${teamId}`);
    return;
  }

  await installationRef.delete();
  console.log(`[TOKEN_MANAGER] Removed installation for team ${teamId}`);
}

/**
 * Get all installations for a Clerk user
 * @param clerkUserId - Internal user ID
 */
export async function getInstallationsForUser(clerkUserId: string): Promise<SlackConfig[]> {
  if (!clerkUserId) {
    return [];
  }

  const snapshot = await db
    .collection('slackInstallations')
    .where('installedBy.clerkUserId', '==', clerkUserId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as SlackInstallation;
    return {
      teamId: data.teamId,
      teamName: data.teamName,
      botToken: data.botToken,
      botUserId: data.botUserId,
      scopes: data.scopes || [],
    };
  });
}

/**
 * Check if a team has an active installation
 * @param teamId - Slack Team ID
 */
export async function hasInstallation(teamId: string): Promise<boolean> {
  if (!teamId) {
    return false;
  }

  const doc = await db.collection('slackInstallations').doc(teamId).get();
  return doc.exists;
}

/**
 * Get installation by team ID (full data)
 * @param teamId - Slack Team ID
 */
export async function getInstallation(teamId: string): Promise<SlackInstallation | null> {
  if (!teamId) {
    return null;
  }

  const doc = await db.collection('slackInstallations').doc(teamId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as SlackInstallation;
}

/**
 * Update user link for an installation
 * Used when a user logs in and wants to link their existing Slack installation
 * @param teamId - Slack Team ID
 * @param clerkUserId - Internal user ID
 */
export async function linkInstallationToUser(
  teamId: string,
  clerkUserId: string
): Promise<void> {
  if (!teamId || !clerkUserId) {
    throw new Error('Team ID and Clerk User ID are required');
  }

  const installationRef = db.collection('slackInstallations').doc(teamId);
  const doc = await installationRef.get();

  if (!doc.exists) {
    throw new Error(`No installation found for team ${teamId}`);
  }

  await installationRef.update({
    'installedBy.clerkUserId': clerkUserId,
    updatedAt: Date.now(),
  });

  console.log(`[TOKEN_MANAGER] Linked team ${teamId} to user ${clerkUserId}`);
}

/**
 * Log an installation event for analytics
 * @param event - Event data
 */
export async function logInstallationEvent(event: {
  type: 'install' | 'reinstall' | 'uninstall';
  teamId: string;
  teamName?: string;
  installedBy?: string;
  clerkUserId?: string;
  duration?: number;
}): Promise<void> {
  try {
    await db.collection('slackInstallationEvents').add({
      ...event,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn('[TOKEN_MANAGER] Failed to log installation event:', error);
  }
}

/**
 * Get all installations (admin use only)
 * @param limit - Maximum number of installations to return
 */
export async function getAllInstallations(limit: number = 100): Promise<SlackInstallation[]> {
  const snapshot = await db
    .collection('slackInstallations')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => doc.data() as SlackInstallation);
}

/**
 * Validate that a bot token is still valid by making a test API call
 * @param teamId - Slack Team ID
 */
export async function validateInstallation(teamId: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const config = await getSlackConfig(teamId);

    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (data.ok) {
      return { valid: true };
    } else {
      return { valid: false, error: data.error };
    }
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
