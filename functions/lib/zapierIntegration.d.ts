/**
 * Zapier Integration - Webhook handlers for triggering external workflows
 */
import * as functions from "firebase-functions";
/**
 * HTTP Cloud Function - Zapier Authentication/Configuration
 */
export declare const handleZapierAuth: functions.HttpsFunction;
/**
 * Trigger Zapier webhooks on events
 */
export declare function triggerZapierWebhook(userId: string, eventType: string, eventData: Record<string, any>): Promise<void>;
/**
 * Handle incoming webhooks from Zapier
 */
export declare const handleZapierWebhook: functions.HttpsFunction;
//# sourceMappingURL=zapierIntegration.d.ts.map