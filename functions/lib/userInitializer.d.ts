/**
 * User initialization trigger - Creates memory collections on user signup
 */
import * as functions from 'firebase-functions/v1';
/**
 * Firestore trigger: Initialize user context and memory collections on new user
 */
export declare const initializeUserMemory: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
/**
 * Update user context when interactions occur
 */
export declare function updateUserContext(userId: string, tokensUsed: number, featureType: string, topics?: string[]): Promise<void>;
//# sourceMappingURL=userInitializer.d.ts.map