/**
 * Firebase Cloud Functions Entry Point
 * Aggregates all Cloud Functions for deployment
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// Export all Cloud Functions
export { initializeUserMemory, updateUserContext } from './userInitializer';
export { captureConversationMemory, retrieveMemories, handleMemoryUpdate, getMemoryStats } from './conversationCapture';
export { handleZapierWebhook, handleZapierAuth } from './zapierIntegration';
export { handleSlackCommand, handleSlackInteractivity } from './slackIntegration';
export { retrieveFactsForUser } from './factExtractor';
export { getFactAnalytics, getMemoryAnalytics } from './memoryAnalytics';
export { extendFactTTL, deleteFact, softDeleteFact } from './memoryRefresh';
