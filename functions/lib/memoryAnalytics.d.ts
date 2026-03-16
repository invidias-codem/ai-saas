import * as functions from "firebase-functions";
interface FactAnalytics {
    totalFacts: number;
    factsByType: {
        decision: number;
        action_item: number;
        blocker: number;
        project: number;
        verification: number;
    };
    factsByScope: {
        conversation: number;
        user: number;
    };
    averageConfidence: number;
    oldestFactDate: number | null;
    newestFactDate: number | null;
    expiringFactsCount: number;
    facts: Array<{
        id: string;
        type: string;
        content: string;
        confidence: number;
        scope: string;
        extractedAt: number;
        expiresAt?: number;
        daysUntilExpiry?: number;
    }>;
}
/**
 * Get analytics about stored facts for a user
 */
export declare function getFactAnalytics(userId: string): Promise<FactAnalytics>;
/**
 * HTTP Cloud Function to get fact analytics for current user
 */
export declare const getMemoryAnalytics: functions.HttpsFunction;
export {};
//# sourceMappingURL=memoryAnalytics.d.ts.map