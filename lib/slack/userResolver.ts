import { db } from '@/lib/firebaseAdmin';

/**
 * Resolve a Slack User ID to an internal User ID (Clerk ID)
 * Looks up the user profile based on the stored Slack User ID.
 * 
 * @param teamId - The Slack Team ID (optional, for future multi-tenant scoping)
 * @param slackUserId - The Slack User ID to resolve
 * @returns The internal User ID or null if not found
 */
export async function resolveSlackUser(
    teamId: string,
    slackUserId: string
): Promise<string | null> {
    try {
        // Query users collection for the profile with this slackUserId
        // Note: This relies on the composite index on 'context.profile.integrations.slackUserId'
        // or we scan if dataset is small, but ideally we should have an index.
        // Given the structure 'users/{userId}/context/profile', we cannot query deeper easily 
        // without a Collection Group query or a top-level mapping.

        // STRATEGY 1: Check 'slackInstallations' if we link it there (from tokenManager)
        // STRATEGY 2: Check 'slackUserPreferences' which maps teamId_slackUserId -> preferences
        // But that doesn't verify the main account link.

        // STRATEGY 3: Collection Group Query on 'context' (or 'profile' doc)
        // This requires an index.

        // ALTERNATIVE: Since we set 'integrations.slackUserId' in 'users/{userId}/context/profile',
        // We can do a collection group query if enabled.

        // FOR NOW: Let's assume we have a top-level mapping or use a specific collection 
        // `slackUserMappings` that we should probably maintain.

        // Let's check how 'configureNotifications' triggers. It updates `users/{userId}/context/profile`.

        // PROPOSAL: Use a dedicated 'slackUserMappings' collection for fast lookup.
        // If not exists, fall back to searching (expensive) or require linking.

        // Let's try to lookup in 'slackUserMappings' first.
        const mappingRef = db.collection('slackUserMappings').doc(`${teamId}:${slackUserId}`);
        const mappingDoc = await mappingRef.get();

        if (mappingDoc.exists) {
            return mappingDoc.data()?.userId || null;
        }

        // Fallback: If we don't have the mapping, we return null.
        // The user needs to 'link' their account or run /genie notify (which should create this mapping).

        return null;
    } catch (error) {
        console.error('[USER_RESOLVER] Error resolving Slack user:', error);
        return null;
    }
}

/**
 * Link a Slack User to an internal User ID
 */
export async function linkSlackUser(
    teamId: string,
    slackUserId: string,
    userId: string
): Promise<void> {
    try {
        await db.collection('slackUserMappings').doc(`${teamId}:${slackUserId}`).set({
            teamId,
            slackUserId,
            userId,
            linkedAt: Date.now(),
        });
        console.log(`[USER_RESOLVER] Linked Slack user ${slackUserId} to ${userId}`);
    } catch (error) {
        console.error('[USER_RESOLVER] Error linking Slack user:', error);
        throw error;
    }
}
