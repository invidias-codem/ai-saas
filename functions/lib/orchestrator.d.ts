import * as functions from 'firebase-functions';
/**
 * 1. INFERENCE FUNCTION
 * Orchestrates the Reasoning Loop:
 * - Checks Jail Status
 * - Calls Gemini 2.0 Flash (Thinking Mode)
 * - Publishes result to Pub/Sub for Verification
 */
export declare const orchestrateGenieLoop: functions.HttpsFunction & functions.Runnable<any>;
/**
 * 2. VERIFICATION FUNCTION (Pub/Sub Trigger)
 * - Receives Trajectory
 * - Calls Snowflake Stored Procedure
 * - Triggers Feedback Function
 */
export declare const verifyReasoning: functions.CloudFunction<functions.pubsub.Message>;
//# sourceMappingURL=orchestrator.d.ts.map