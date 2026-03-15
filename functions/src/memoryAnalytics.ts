import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

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
export async function getFactAnalytics(userId: string): Promise<FactAnalytics> {
  try {
    const factsRef = db.collection('users').doc(userId).collection('facts');
    const snapshot = await factsRef.get();

    if (snapshot.empty) {
      return {
        totalFacts: 0,
        factsByType: {
          decision: 0,
          action_item: 0,
          blocker: 0,
          project: 0,
          verification: 0,
        },
        factsByScope: {
          conversation: 0,
          user: 0,
        },
        averageConfidence: 0,
        oldestFactDate: null,
        newestFactDate: null,
        expiringFactsCount: 0,
        facts: [],
      };
    }

    const factsByType: any = {
      decision: 0,
      action_item: 0,
      blocker: 0,
      project: 0,
      verification: 0,
    };

    const factsByScope: any = {
      conversation: 0,
      user: 0,
    };

    let confidenceSum = 0;
    let oldestDate: number | null = null;
    let newestDate: number | null = null;
    let expiringFactsCount = 0;
    const now = Date.now();
    const ninetyDaysFromNow = now + 90 * 24 * 60 * 60 * 1000;

    const facts: any[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      factsByType[data.type]++;
      factsByScope[data.scope]++;
      confidenceSum += data.confidence || 0;

      const extractedAt = data.extractedAt;
      if (!oldestDate || extractedAt < oldestDate) {
        oldestDate = extractedAt;
      }
      if (!newestDate || extractedAt > newestDate) {
        newestDate = extractedAt;
      }

      // Check if fact is expiring soon (within 7 days)
      if (data.expiresAt && data.expiresAt <= ninetyDaysFromNow && data.expiresAt > now) {
        expiringFactsCount++;
      }

      const daysUntilExpiry = data.expiresAt
        ? Math.ceil((data.expiresAt - now) / (24 * 60 * 60 * 1000))
        : undefined;

      facts.push({
        id: doc.id,
        type: data.type,
        content: data.content,
        confidence: data.confidence,
        scope: data.scope,
        extractedAt: data.extractedAt,
        expiresAt: data.expiresAt,
        daysUntilExpiry,
      });
    });

    const totalFacts = snapshot.size;
    const averageConfidence = totalFacts > 0 ? confidenceSum / totalFacts : 0;

    return {
      totalFacts,
      factsByType,
      factsByScope,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      oldestFactDate: oldestDate,
      newestFactDate: newestDate,
      expiringFactsCount,
      facts: facts.sort((a, b) => b.extractedAt - a.extractedAt),
    };
  } catch (error) {
    functions.logger.error(`Error getting fact analytics:`, error);
    throw error;
  }
}

/**
 * HTTP Cloud Function to get fact analytics for current user
 */
export const getMemoryAnalytics = functions.https.onRequest(
  async (request, response) => {
    try {
      // Verify authentication (expect userId from auth context or request)
      const userId = (request as any).user?.uid;
      if (!userId) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const analytics = await getFactAnalytics(userId);
      response.status(200).json(analytics);
    } catch (error) {
      functions.logger.error('Error in getMemoryAnalytics:', error);
      response.status(500).json({ error: 'Internal server error' });
    }
  }
);
