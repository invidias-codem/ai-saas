import * as functions from 'firebase-functions';
/**
 * Scheduled Cloud Function to clean up expired conversation-level facts
 * Runs daily at midnight UTC
 * Removes facts where expiresAt < now() and scope = "conversation"
 */
export declare const scheduleFactCleanup: functions.CloudFunction<unknown>;
//# sourceMappingURL=scheduleFactCleanup.d.ts.map