import * as functions from "firebase-functions";
export type FactType = "decision" | "action_item" | "blocker" | "project" | "verification";
export type FactScope = "conversation" | "user";
export interface ExtractedFact {
    type: FactType;
    content: string;
    confidence: number;
    sentiment?: number;
    extractedAt: number;
    expiresAt?: number;
    conversationId?: string;
    scope: FactScope;
    usageCount?: number;
    impactScore?: number;
    lastUsedAt?: number;
    userRating?: number;
}
interface ExtractionResult {
    facts: ExtractedFact[];
    rawExtractions: string[];
}
/**
 * Extract critical facts from conversation messages
 * Uses keyword matching + Gemini confidence scoring
 */
export declare function extractFactsFromConversation(messages: Array<{
    role: string;
    content: string;
}>, assistantResponse: string): Promise<ExtractionResult>;
/**
 * Store extracted facts to Firestore with deduplication
 */
export declare function storeExtractedFacts(userId: string, facts: ExtractedFact[]): Promise<number>;
/**
 * Retrieve high-confidence facts for a user
 */
export declare function getHighConfidenceFacts(userId: string, scope: FactScope, limit?: number): Promise<ExtractedFact[]>;
/**
 * Format extracted facts for prompt injection
 */
export declare function formatFactsForPrompt(facts: ExtractedFact[]): string;
/**
 * Clean up expired conversation-level facts (90+ days old)
 * User-level facts never expire and persist indefinitely
 */
export declare function cleanupExpiredFacts(userId: string): Promise<number>;
/**
 * HTTP Cloud Function - Retrieve facts for a user
 * Called from Next.js API routes to inject facts into prompts
 */
export declare const retrieveFactsForUser: functions.HttpsFunction;
export {};
//# sourceMappingURL=factExtractor.d.ts.map