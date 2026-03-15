/**
 * Slack Integration - Bot commands and notifications
 */
import * as functions from 'firebase-functions';
/**
 * HTTP Cloud Function - Handle Slack Commands (/genie)
 */
export declare const handleSlackCommand: functions.HttpsFunction;
/**
 * HTTP Cloud Function - Handle Slack Interactivity (buttons, etc.)
 */
export declare const handleSlackInteractivity: functions.HttpsFunction;
/**
 * Send Slack notification
 */
export declare function sendSlackNotification(userId: string, message: string, blocks?: Record<string, any>[]): Promise<void>;
//# sourceMappingURL=slackIntegration.d.ts.map