/**
 * Conversation Capture - Triggered after successful API responses
 * Stores interactions in Firestore for RAG memory
 */
import * as functions from "firebase-functions";
import { UserMemory } from "./schemas";
/**
 * HTTP Cloud Function - Capture conversation after API call
 * Called from Next.js API routes to store interaction in memory
 */
export declare const captureConversationMemory: functions.HttpsFunction;
/**
 * Capture and process memory update
 */
export declare function handleMemoryUpdate(userId: string, memoryId: string, updates: Partial<UserMemory>): Promise<void>;
/**
 * HTTP Cloud Function - Retrieve relevant memories for API context injection
 * Called from Next.js API routes to get semantically similar memories
 */
export declare const retrieveMemories: functions.HttpsFunction;
/**
 * Prepare memory context for API injection
 * Called from Next.js API routes to get relevant memories
 */
export declare function getMemoryContextForApi(userId: string, query: string, featureType?: string): Promise<string>;
/**
 * HTTP Cloud Function - Get user memory statistics
 * Called from Next.js to gather memory stats for user context
 */
export declare const getMemoryStats: functions.HttpsFunction;
//# sourceMappingURL=conversationCapture.d.ts.map