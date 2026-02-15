"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMemoryAnalytics = void 0;
exports.getFactAnalytics = getFactAnalytics;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Get analytics about stored facts for a user
 */
async function getFactAnalytics(userId) {
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
        const factsByType = {
            decision: 0,
            action_item: 0,
            blocker: 0,
            project: 0,
            verification: 0,
        };
        const factsByScope = {
            conversation: 0,
            user: 0,
        };
        let confidenceSum = 0;
        let oldestDate = null;
        let newestDate = null;
        let expiringFactsCount = 0;
        const now = Date.now();
        const ninetyDaysFromNow = now + 90 * 24 * 60 * 60 * 1000;
        const facts = [];
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
    }
    catch (error) {
        functions.logger.error(`Error getting fact analytics:`, error);
        throw error;
    }
}
/**
 * HTTP Cloud Function to get fact analytics for current user
 */
exports.getMemoryAnalytics = functions.https.onRequest(async (request, response) => {
    try {
        // Verify authentication (expect userId from auth context or request)
        const userId = request.user?.uid;
        if (!userId) {
            response.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const analytics = await getFactAnalytics(userId);
        response.status(200).json(analytics);
    }
    catch (error) {
        functions.logger.error('Error in getMemoryAnalytics:', error);
        response.status(500).json({ error: 'Internal server error' });
    }
});
//# sourceMappingURL=memoryAnalytics.js.map