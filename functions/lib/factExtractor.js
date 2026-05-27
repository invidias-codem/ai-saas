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
exports.retrieveFactsForUser = void 0;
exports.extractFactsFromConversation = extractFactsFromConversation;
exports.storeExtractedFacts = storeExtractedFacts;
exports.getHighConfidenceFacts = getHighConfidenceFacts;
exports.formatFactsForPrompt = formatFactsForPrompt;
exports.cleanupExpiredFacts = cleanupExpiredFacts;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const db = admin.firestore();
/**
 * Extract critical facts from conversation messages
 * Uses keyword matching + Gemini confidence scoring
 */
async function extractFactsFromConversation(messages, assistantResponse) {
    const facts = [];
    const rawExtractions = [];
    // Combine all message content for analysis
    const fullConversation = [
        ...messages.map((m) => `${m.role}: ${m.content}`),
        `assistant: ${assistantResponse}`,
    ].join("\n");
    // Stage 1: Keyword-based extraction (fast, high precision)
    const keywordFacts = extractKeywordFacts(fullConversation);
    facts.push(...keywordFacts);
    rawExtractions.push(...keywordFacts.map((f) => `[${f.type}] ${f.content}`));
    // Stage 2: Gemini-based confidence scoring for extracted facts
    try {
        const scoredFacts = await scoreFactsWithGemini(facts, fullConversation);
        return {
            facts: scoredFacts.filter((f) => f.confidence >= 0.75), // Only return high-confidence facts
            rawExtractions,
        };
    }
    catch (error) {
        functions.logger.warn("Gemini scoring failed, using keyword confidence:", error);
        // Fallback: use conservative confidence scores from keyword extraction
        return {
            facts: facts.filter((f) => f.confidence >= 0.80),
            rawExtractions,
        };
    }
}
/**
 * Stage 1: Extract facts using regex patterns and keywords
 * Fast, deterministic, high-precision extraction
 */
function extractKeywordFacts(content) {
    const facts = [];
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000; // Conversation facts expire after 90 days
    // 1. DECISION facts - look for decision keywords (caps lock or explicit markers)
    const decisionPatterns = [
        /(?:DECISION|DECIDED|WILL USE|WE'LL USE|CHOOSING):\s*(.+?)(?:\n|$)/gi,
        /(?:we|i|we've)\s+(?:decided to|will use|are using|chose)\s+([a-zA-Z0-9\s\-_.()]+)(?:\s+(?:because|for|to)|\.|\n|$)/gi,
    ];
    decisionPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const decision = match[1].trim().slice(0, 200);
            if (decision.length > 10 && !isHypothetical(decision)) {
                facts.push({
                    type: "decision",
                    content: decision,
                    confidence: 0.90, // High confidence for explicit decision markers
                    extractedAt: now,
                    expiresAt: now + ninetyDaysMs, // Expire after 90 days
                    scope: "conversation",
                });
            }
        }
    });
    // 2. ACTION_ITEM facts - look for TODO, action markers, future-tense tasks
    const actionPatterns = [
        /(?:TODO|ACTION|TASK):\s*(.+?)(?:\n|$)/gi,
        /(?:need to|must|should|have to|going to)\s+([a-z]+\s+[a-z0-9\s\-_.()]+?)(?:\s+(?:by|before|in|this|next)|\.|\n|$)/gi,
        /\b(?:implement|fix|review|test|deploy|refactor|add|remove)\s+([a-z0-9\s\-_.()]+)(?:\s+(?:in|by|this|next|soon)|\.|\n|$)/gi,
    ];
    actionPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const action = match[1].trim().slice(0, 200);
            if (action.length > 5 && !isHypothetical(action)) {
                facts.push({
                    type: "action_item",
                    content: action,
                    confidence: 0.85, // High confidence for explicit action markers
                    extractedAt: now,
                    expiresAt: now + ninetyDaysMs, // Expire after 90 days
                    scope: "conversation",
                });
            }
        }
    });
    // 3. BLOCKER facts - look for blocker keywords and waiting patterns
    const blockerPatterns = [
        /(?:BLOCKER|BLOCKED):\s*(.+?)(?:\n|$)/gi,
        /(?:stuck|blocked|waiting for|depends on|constraint|limitation):\s*(.+?)(?:\n|$)/gi,
        /(?:blocked by|waiting for|depends on|need)\s+([a-zA-Z0-9\s\-_.()]+)(?:\s+(?:before|to|so)|\.|\n|$)/gi,
    ];
    blockerPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const blocker = match[1].trim().slice(0, 200);
            if (blocker.length > 5) {
                facts.push({
                    type: "blocker",
                    content: blocker,
                    confidence: 0.88, // High confidence for explicit blocker markers
                    extractedAt: now,
                    expiresAt: now + ninetyDaysMs, // Expire after 90 days
                    scope: "conversation",
                });
            }
        }
    });
    // 4. PROJECT facts - look for project names and tech stack
    const projectPatterns = [
        /(?:project|product|initiative|working on|building):\s*([a-zA-Z0-9\s\-_.()]+?)(?:\s+(?:using|with|in|for)|\.|\n|$)/gi,
        /(?:we're building|we're working on|project name is|current project):\s*([a-zA-Z0-9\s\-_.()]+?)(?:\s+(?:using|with|in|for)|\.|\n|$)/gi,
    ];
    projectPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const project = match[1].trim().slice(0, 200);
            if (project.length > 3 && !isHypothetical(project)) {
                facts.push({
                    type: "project",
                    content: project,
                    confidence: 0.80, // Moderate confidence for project mentions
                    extractedAt: now,
                    // User-level facts DO NOT expire (removed expiresAt)
                    scope: "user",
                });
            }
        }
    });
    // 5. VERIFICATION facts - look for explicit confirmations
    const verificationPatterns = [
        /(?:yes,?\s+that's? right|correct|exactly|confirmed|verified|that's? accurate):\s*(.+?)(?:\n|$)/gi,
        /(?:my|our)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:is|are)\s+([a-zA-Z0-9\s\-_.()]+)(?:\.|\n|$)/gi,
    ];
    verificationPatterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const verification = match[match.length - 1].trim().slice(0, 200);
            if (verification.length > 5) {
                facts.push({
                    type: "verification",
                    content: verification,
                    confidence: 0.95, // Very high confidence for explicit verifications
                    extractedAt: now,
                    scope: "user",
                });
            }
        }
    });
    return facts;
}
/**
 * Analyze sentiment of text using keyword-based scoring
 * Returns score from -1.0 (very negative) to 1.0 (very positive)
 */
function analyzeSentiment(text) {
    if (!text || text.length === 0)
        return 0;
    const lowerText = text.toLowerCase();
    // Positive indicators
    const positiveKeywords = {
        excellent: 2,
        amazing: 2,
        great: 1.5,
        good: 1,
        helpful: 1.5,
        love: 1.5,
        perfect: 2,
        wonderful: 1.5,
        fantastic: 2,
        brilliant: 1.5,
        success: 1,
        solved: 1.5,
        working: 0.5,
        thanks: 0.5,
        appreciate: 1,
        useful: 1,
        insightful: 1.5,
        effective: 1,
    };
    // Negative indicators
    const negativeKeywords = {
        terrible: -2,
        awful: -2,
        horrible: -2,
        bad: -1,
        hate: -1.5,
        useless: -2,
        broken: -1.5,
        error: -1,
        problem: -0.8,
        difficult: -0.5,
        confusing: -1,
        frustrating: -1.5,
        failed: -1.5,
        wrong: -1,
        issue: -0.8,
        challenge: -0.3,
    };
    let score = 0;
    let keywordCount = 0;
    // Score positive keywords
    for (const [keyword, value] of Object.entries(positiveKeywords)) {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        const matches = lowerText.match(regex);
        if (matches) {
            score += value * matches.length;
            keywordCount += matches.length;
        }
    }
    // Score negative keywords
    for (const [keyword, value] of Object.entries(negativeKeywords)) {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        const matches = lowerText.match(regex);
        if (matches) {
            score += value * matches.length;
            keywordCount += matches.length;
        }
    }
    // Normalize to -1.0 to 1.0 range
    if (keywordCount === 0) {
        return 0;
    }
    const normalized = score / (keywordCount * 2); // Max 2 per keyword
    return Math.max(-1, Math.min(1, normalized));
}
/**
 * Stage 2: Score extracted facts using Gemini for confidence calibration
 * Validates extraction accuracy and adjusts confidence scores
 */
async function scoreFactsWithGemini(facts, context) {
    if (facts.length === 0)
        return facts;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const factsToScore = facts.map((f, i) => `${i + 1}. [${f.type}] "${f.content}"`).join("\n");
        const prompt = `Given the conversation context below, score the confidence level (0.0-1.0) for each extracted fact.
Score based on:
- Is the fact stated explicitly and clearly? (0.85-1.0)
- Is it implied or inferred from context? (0.60-0.84)
- Is it speculative or hypothetical? (0.0-0.59) - DO NOT INCLUDE

Conversation:
${context.slice(0, 2000)}

Extracted Facts:
${factsToScore}

Return ONLY a JSON array like: [{"index": 1, "confidence": 0.95}, {"index": 2, "confidence": 0.60}]
Include only facts with confidence >= 0.60.`;
        const response = await model.generateContent(prompt);
        const responseText = response.response.text();
        // Parse JSON response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            functions.logger.warn("No JSON found in Gemini response");
            return facts;
        }
        const scores = JSON.parse(jsonMatch[0]);
        // Update confidence scores and add sentiment based on Gemini assessment
        return facts.map((fact, index) => {
            const score = scores.find((s) => s.index === index + 1);
            return {
                ...fact,
                confidence: score?.confidence ?? fact.confidence,
                sentiment: analyzeSentiment(fact.content), // Add sentiment analysis
            };
        });
    }
    catch (error) {
        functions.logger.error("Error scoring facts with Gemini:", error);
        // Return facts with sentiment analysis even if Gemini scoring fails
        return facts.map((fact) => ({
            ...fact,
            sentiment: analyzeSentiment(fact.content),
        }));
    }
}
/**
 * Check if text is hypothetical/speculative (should not be extracted as fact)
 */
function isHypothetical(text) {
    const hypotheticalKeywords = [
        "if we",
        "if we had",
        "could be",
        "might be",
        "should be",
        "could use",
        "might use",
        "wish we",
        "hope to",
        "perhaps",
        "maybe",
        "supposedly",
        "arguably",
        "in theory",
        "would be",
        "would use",
    ];
    const lowerText = text.toLowerCase();
    return hypotheticalKeywords.some((keyword) => lowerText.includes(keyword));
}
/**
 * Store extracted facts to Firestore with deduplication
 */
async function storeExtractedFacts(userId, facts) {
    if (facts.length === 0)
        return 0;
    const factsRef = db.collection("users").doc(userId).collection("facts");
    let storedCount = 0;
    for (const fact of facts) {
        try {
            // Check for duplicates: same type + similar content (substring match)
            const existingQuery = await factsRef
                .where("type", "==", fact.type)
                .where("confidence", ">=", 0.75)
                .orderBy("confidence", "desc")
                .limit(10)
                .get();
            const similar = existingQuery.docs.find((doc) => {
                const existing = doc.data();
                return (stringSimilarity(existing.content, fact.content) > 0.8 || // 80% text similarity
                    existing.content.includes(fact.content.slice(0, 20)) || // Substring match
                    fact.content.includes(existing.content.slice(0, 20)));
            });
            if (similar) {
                // Update existing fact: merge confidence scores, update timestamp
                const existingData = similar.data();
                await similar.ref.update({
                    confidence: Math.max(existingData.confidence, fact.confidence),
                    extractedAt: Date.now(),
                    expiresAt: fact.expiresAt || existingData.expiresAt,
                });
                functions.logger.debug(`Updated existing fact: ${fact.type}`);
            }
            else {
                // Store new fact
                await factsRef.add({
                    ...fact,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                storedCount++;
                functions.logger.debug(`Stored new fact: ${fact.type} - ${fact.content.slice(0, 50)}`);
            }
        }
        catch (error) {
            functions.logger.error(`Error storing fact [${fact.type}]:`, error);
        }
    }
    return storedCount;
}
/**
 * Retrieve high-confidence facts for a user
 */
async function getHighConfidenceFacts(userId, scope, limit = 10) {
    try {
        const factsRef = db.collection("users").doc(userId).collection("facts");
        let query = factsRef.where("confidence", ">=", 0.80).where("scope", "==", scope);
        // Add expiration check for conversation-level facts
        if (scope === "conversation") {
            query = query.where("expiresAt", ">", Date.now());
        }
        const snapshot = await query.orderBy("confidence", "desc").orderBy("extractedAt", "desc").limit(limit).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        functions.logger.error(`Error retrieving facts for user ${userId}:`, error);
        return [];
    }
}
/**
 * Format extracted facts for prompt injection
 */
function formatFactsForPrompt(facts) {
    if (facts.length === 0)
        return "";
    const grouped = new Map();
    facts.forEach((fact) => {
        if (!grouped.has(fact.type)) {
            grouped.set(fact.type, []);
        }
        grouped.get(fact.type).push(fact);
    });
    let prompt = "\n## Critical Context (Verified Facts)\n";
    // Decisions
    if (grouped.has("decision")) {
        prompt += "\n**Decisions Made:**\n";
        grouped.get("decision").forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Action Items
    if (grouped.has("action_item")) {
        prompt += "\n**Action Items:**\n";
        grouped.get("action_item").forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Blockers
    if (grouped.has("blocker")) {
        prompt += "\n**Current Blockers:**\n";
        grouped.get("blocker").forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Projects
    if (grouped.has("project")) {
        prompt += "\n**Active Projects:**\n";
        grouped.get("project").forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Verifications
    if (grouped.has("verification")) {
        prompt += "\n**Verified Information:**\n";
        grouped.get("verification").forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    prompt += "\nUse the above facts to ensure accuracy in your response.\n";
    return prompt;
}
/**
 * Simple string similarity metric (0-1)
 * Used for deduplication detection
 */
function stringSimilarity(a, b) {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower === bLower)
        return 1;
    if (aLower.includes(bLower) || bLower.includes(aLower))
        return 0.9;
    // Levenshtein-like distance estimation
    const longer = aLower.length > bLower.length ? aLower : bLower;
    const shorter = aLower.length > bLower.length ? bLower : aLower;
    if (longer.length === 0)
        return 1;
    const editDistance = getEditDistance(longer, shorter);
    return 1 - editDistance / longer.length;
}
/**
 * Calculate Levenshtein distance for string similarity
 */
function getEditDistance(longer, shorter) {
    const costs = [];
    for (let i = 0; i <= longer.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= shorter.length; j++) {
            if (i === 0) {
                costs[j] = j;
            }
            else if (j > 0) {
                let newValue = costs[j - 1];
                if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0)
            costs[shorter.length] = lastValue;
    }
    return costs[shorter.length];
}
/**
 * Clean up expired conversation-level facts (90+ days old)
 * User-level facts never expire and persist indefinitely
 */
async function cleanupExpiredFacts(userId) {
    try {
        const factsRef = db.collection("users").doc(userId).collection("facts");
        const expiredSnapshot = await factsRef
            .where("expiresAt", "<=", Date.now())
            .where("scope", "==", "conversation")
            .get();
        let deletedCount = 0;
        const batch = db.batch();
        expiredSnapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
            deletedCount++;
        });
        if (deletedCount > 0) {
            await batch.commit();
            functions.logger.debug(`Cleaned up ${deletedCount} expired facts for user ${userId}`);
        }
        return deletedCount;
    }
    catch (error) {
        functions.logger.error("Error cleaning up expired facts:", error);
        return 0;
    }
}
/**
 * HTTP Cloud Function - Retrieve facts for a user
 * Called from Next.js API routes to inject facts into prompts
 */
exports.retrieveFactsForUser = functions.https.onRequest(async (req, res) => {
    try {
        if (req.method !== "POST") {
            res.status(405).json({ error: "Method not allowed" });
            return;
        }
        const { userId, limit = 10 } = req.body;
        if (!userId) {
            res.status(400).json({ error: "Missing userId" });
            return;
        }
        // Retrieve high-confidence facts for both scopes
        const conversationFacts = await getHighConfidenceFacts(userId, "conversation", limit / 2);
        const userFacts = await getHighConfidenceFacts(userId, "user", limit / 2);
        const allFacts = [...conversationFacts, ...userFacts]
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, limit);
        res.status(200).json({
            success: true,
            facts: allFacts,
            count: allFacts.length,
        });
    }
    catch (error) {
        functions.logger.error("Error retrieving facts:", error);
        res.status(500).json({
            error: `Failed to retrieve facts: ${error}`,
        });
    }
});
//# sourceMappingURL=factExtractor.js.map