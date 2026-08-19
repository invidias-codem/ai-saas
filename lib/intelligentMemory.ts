import { Firestore } from 'firebase-admin/firestore';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';

export interface ExtractedFact {
  id?: string;
  type: 'conversation' | 'user' | 'preference' | 'code';
  content: string;
  confidence: number;
  sentiment?: number; // -1.0 (negative) to 1.0 (positive)
  scope?: 'conversation' | 'user';
  extractedAt?: Date;
  expiresAt?: Date;
  usageCount?: number;
  impactScore?: number; // 0-1 scale
  lastUsedAt?: Date;
  userRating?: number; // 1-5 scale from feedback
  contextRelevance?: number; // For current conversation
  // Sync-route fields (optional, backward-compatible)
  conversationId?: string;
  userId?: string;
  createdAt?: number;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  communicationStyle: 'casual' | 'professional' | 'technical' | 'balanced';
  preferredDepth: 'brief' | 'balanced' | 'detailed';
  topics: { [topic: string]: number }; // Topic interest scores
  sentimentPreference: number; // -1 (prefers optimistic) to 1 (prefers realistic)
  learnedTopics: string[];
  avgResponseLength: number;
  preferredFormats: string[]; // 'code', 'explanation', 'examples', etc.
}

/**
 * Analyzes sentiment of text using keyword-based scoring
 * Returns score from -1.0 (very negative) to 1.0 (very positive)
 */
export function analyzeSentiment(text: string): number {
  if (!text || text.length === 0) return 0;

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
    challenge: -0.3, // context-dependent
  };

  let score = 0;
  let keywordCount = 0;

  // Score positive keywords
  for (const [keyword, value] of Object.entries(positiveKeywords)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      score += value * matches.length;
      keywordCount += matches.length;
    }
  }

  // Score negative keywords
  for (const [keyword, value] of Object.entries(negativeKeywords)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
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
 * Calculates importance score for a fact based on multiple factors
 * Formula: confidence (50%) + usage (25%) + impact (15%) + user feedback (10%)
 */
export function calculateImportance(fact: ExtractedFact): number {
  const confidenceScore = (fact.confidence ?? 0.75) * 0.5; // 50% weight
  const usageScore = Math.min(1, (fact.usageCount || 0) / 10) * 0.25; // 25% weight, normalize to 10 uses = max
  const impactScore = (fact.impactScore ?? 0.5) * 0.15; // 15% weight
  const userRatingScore = Math.min(1, (fact.userRating || 0) / 5) * 0.1; // 10% weight, normalize to 5-star scale

  return Math.min(1, confidenceScore + usageScore + impactScore + userRatingScore);
}

/**
 * Calculates context relevance for current conversation
 * Uses recency and keywords matching current topic
 */
export function calculateContextRelevance(
  fact: ExtractedFact,
  currentConversationContext: string
): number {
  if (!currentConversationContext || currentConversationContext.length === 0) {
    return 0.5; // Neutral if no context
  }

  // Recency: Facts used in last message more relevant
  const daysSinceLastUse = fact.lastUsedAt
    ? (Date.now() - new Date(fact.lastUsedAt).getTime()) / (1000 * 60 * 60 * 24)
    : 30;
  const recencyScore = Math.max(0, 1 - daysSinceLastUse / 30); // 30 days = 0 relevance

  // Keyword overlap
  const factWords = fact.content.toLowerCase().split(/\s+/);
  const contextWords = currentConversationContext.toLowerCase().split(/\s+/);
  const overlap = factWords.filter((w) => contextWords.includes(w)).length;
  const keywordScore = Math.min(1, overlap / Math.max(factWords.length, contextWords.length, 1));

  // Combined score: 60% recency, 40% keyword overlap
  return recencyScore * 0.6 + keywordScore * 0.4;
}

/**
 * Intelligently ranks memories combining multiple factors
 * Weights: vector similarity (40%) + keyword match (25%) + importance (20%) + sentiment alignment (15%)
 */
export function rankMemoriesIntelligently(
  facts: ExtractedFact[],
  vectorSimilarities: Map<string, number>,
  currentContext: string,
  userPreferences: Partial<UserPreferences> = {}
): ExtractedFact[] {
  const scored = facts.map((fact) => {
    const vectorScore = vectorSimilarities.get(fact.id || '') || 0; // 0-1
    const importanceScore = calculateImportance(fact); // 0-1
    const contextScore = calculateContextRelevance(fact, currentContext); // 0-1

    // Sentiment alignment: if user prefers optimistic, boost positive sentiment
    const sentimentBoost =
      (userPreferences.sentimentPreference || 0) * (fact.sentiment || 0) * 0.15;

    // Keyword matching as fallback
    const contextWords = currentContext.toLowerCase().split(/\s+/);
    const factWords = fact.content.toLowerCase().split(/\s+/);
    const keywordScore = contextWords.filter((w) => factWords.includes(w)).length / Math.max(contextWords.length, 1);

    const finalScore =
      vectorScore * 0.4 + // Vector similarity: 40%
      Math.min(1, keywordScore) * 0.25 + // Keyword match: 25%
      importanceScore * 0.2 + // Importance: 20%
      (fact.sentiment || 0) * 0.15; // Sentiment: 15%

    return { fact, score: finalScore + sentimentBoost };
  });

  // Sort by score descending
  return scored
    .filter((s) => s.score > 0) // Only return relevant facts
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      ...s.fact,
      contextRelevance: s.score,
    }));
}

/**
 * Builds user preferences from interaction history
 * Analyzes past conversations to learn communication style, depth, topics
 */
export function buildUserPreferences(
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>,
  existingPreferences?: Partial<UserPreferences>
): Partial<UserPreferences> {
  const userMessages = conversationHistory.filter((m) => m.role === 'user');
  const assistantMessages = conversationHistory.filter((m) => m.role === 'assistant');

  if (userMessages.length === 0) {
    return existingPreferences || {};
  }

  // Average message length indicates preferred depth
  const avgUserLength = userMessages.reduce((sum, m) => sum + m.content.length, 0) / userMessages.length;
  const avgAssistantLength = assistantMessages.reduce((sum, m) => sum + m.content.length, 0) / assistantMessages.length;

  let preferredDepth: 'brief' | 'balanced' | 'detailed' = 'balanced';
  if (avgUserLength < 100 && avgAssistantLength < 500) preferredDepth = 'brief';
  if (avgAssistantLength > 1500) preferredDepth = 'detailed';

  // Detect communication style
  const allUserText = userMessages.map((m) => m.content).join(' ').toLowerCase();
  let communicationStyle: 'casual' | 'professional' | 'technical' | 'balanced' = 'balanced';

  const technicalTerms = ['api', 'database', 'algorithm', 'function', 'variable', 'code', 'debug', 'optimize'];
  const techCount = technicalTerms.filter((t) => allUserText.includes(t)).length;

  const casualMarkers = ['lol', 'gonna', 'wanna', 'cool', 'awesome'];
  const casualCount = casualMarkers.filter((m) => allUserText.includes(m)).length;

  if (techCount > 5) communicationStyle = 'technical';
  else if (casualCount > 3) communicationStyle = 'casual';
  else communicationStyle = 'professional';

  // Detect sentiment preference from feedback
  const sentiments = userMessages.map((m) => analyzeSentiment(m.content));
  const avgSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

  // Extract topics from user messages
  const topics: { [key: string]: number } = {};
  const topicKeywords = {
    'machine learning': ['ml', 'neural', 'model', 'training', 'prediction'],
    'web development': ['html', 'css', 'javascript', 'react', 'node'],
    'data analysis': ['data', 'analytics', 'visualization', 'pandas', 'sql'],
    'devops': ['docker', 'kubernetes', 'ci/cd', 'deployment', 'infrastructure'],
    'security': ['encryption', 'authentication', 'ssl', 'secure', 'vulnerability'],
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    const matchCount = keywords.filter((k) => allUserText.includes(k)).length;
    if (matchCount > 0) {
      topics[topic] = matchCount / keywords.length;
    }
  }

  return {
    communicationStyle,
    preferredDepth,
    topics,
    sentimentPreference: avgSentiment,
    avgResponseLength: avgAssistantLength,
    learnedTopics: Object.keys(topics),
    preferredFormats: allUserText.includes('code') ? ['code', 'explanation'] : ['explanation'],
  };
}

/**
 * Merges real-time preferences with imported preferences from Supabase
 */
export async function buildUserPreferencesWithImport(
  userId: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  existingPreferences?: Partial<UserPreferences>
): Promise<Partial<UserPreferences>> {
  const realtimePrefs = buildUserPreferences(conversationHistory, existingPreferences);

  try {
    const { supabase } = await import('@/lib/supabaseClient');
    // Fetch imported preferences if any (assuming stored in user_profiles or similar, or just re-calculated)
    // For simplicity, we might query the latest import job or a dedicated profile table.
    // As per plan, let's assume we fetch from 'user_profiles' or similar if implemented, 
    // but since we haven't implemented a dedicated profile sync yet in this plan, 
    // we'll leave a placeholder or query the import_jobs metadata if accessible.

    // Return mostly realtime keys, but could merge if we had the data.
    return realtimePrefs;

  } catch (e) {
    return realtimePrefs;
  }
}

/**
 * Filters facts based on scope and relevance
 */
export function filterFactsByScope(
  facts: ExtractedFact[],
  scope: 'conversation' | 'user' | 'all' = 'all'
): ExtractedFact[] {
  if (scope === 'all') return facts;
  return facts.filter((f) => f.scope === scope || f.scope === undefined);
}

/**
 * Gets high-confidence facts with intelligent ranking
 * Replaces old getHighConfidenceFacts() with context awareness
 */
export function getHighConfidenceFactsIntelligent(
  facts: ExtractedFact[],
  currentContext: string,
  userPreferences?: Partial<UserPreferences>,
  threshold: number = 0.7
): ExtractedFact[] {
  // Filter by confidence
  const confident = facts.filter((f) => (f.confidence || 0.75) >= threshold);

  // Create mock vector similarities based on keyword matching
  const similarities = new Map<string, number>();
  const contextWords = currentContext.toLowerCase().split(/\s+/);

  for (const fact of confident) {
    const factWords = fact.content.toLowerCase().split(/\s+/);
    const overlap = factWords.filter((w) => contextWords.includes(w)).length;
    const similarity = overlap / Math.max(factWords.length, contextWords.length, 1);
    similarities.set(fact.id || '', similarity);
  }

  // Rank intelligently
  return rankMemoriesIntelligently(confident, similarities, currentContext, userPreferences).slice(0, 10);
}

/**
 * Records user feedback on fact helpfulness
 * Updates importance based on rating
 */
export async function recordFeedback(
  db: Firestore,
  userId: string,
  factId: string,
  feedback: {
    helpful: boolean;
    rating: number; // 1-5
    feedback?: string;
  }
): Promise<void> {
  const factRef = db.collection('users').doc(userId).collection('facts').doc(factId);

  const fact = await factRef.get();
  if (!fact.exists) {
    throw new Error(`Fact ${factId} not found`);
  }

  const factData = fact.data() as ExtractedFact;

  // Update rating (rolling average)
  const currentRating = factData.userRating || 0;
  const newRating = (currentRating + feedback.rating) / 2;

  // Update impact score based on helpfulness
  const currentImpact = factData.impactScore || 0.5;
  const newImpact = feedback.helpful ? Math.min(1, currentImpact + 0.1) : Math.max(0, currentImpact - 0.1);

  await factRef.update({
    userRating: newRating,
    impactScore: newImpact,
    lastUsedAt: new Date(),
    usageCount: (factData.usageCount || 0) + 1,
  });

  // Store feedback record
  await db
    .collection('users')
    .doc(userId)
    .collection('feedback')
    .add({
      factId,
      ...feedback,
      createdAt: new Date(),
    });
}

/**
 * Tracks fact usage
 */
export async function trackFactUsage(db: Firestore, userId: string, factId: string): Promise<void> {
  const factRef = db.collection('users').doc(userId).collection('facts').doc(factId);

  const fact = await factRef.get();
  if (!fact.exists) return;

  const factData = fact.data() as ExtractedFact;

  await factRef.update({
    usageCount: (factData.usageCount || 0) + 1,
    lastUsedAt: new Date(),
  });
}

/**
 * Gets or creates user preferences
 */
export async function getUserPreferences(
  db: Firestore,
  userId: string
): Promise<Partial<UserPreferences>> {
  const prefRef = db.collection('users').doc(userId).collection('settings').doc('preferences');

  const pref = await prefRef.get();
  if (pref.exists) {
    return pref.data() as Partial<UserPreferences>;
  }

  return {};
}

/**
 * Saves user preferences
 */
export async function saveUserPreferences(
  db: Firestore,
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const prefRef = db.collection('users').doc(userId).collection('settings').doc('preferences');

  await prefRef.set(
    {
      ...preferences,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

/**
 * Uses DeepSeek-R1 to synthesize a coherent context from scattered facts,
 * resolving conflicts and filtering noise.
 */
export async function synthesizeContextWithReasoning(
  facts: ExtractedFact[],
  query: string
): Promise<string> {
  if (facts.length === 0) return "";

  const deepseek = new DeepSeekProvider();

  // Format retrieved facts for the reasoning model
  const factsList = facts.map((f, i) => `[Fact ${i + 1}] (${f.confidence * 100}% confidence): ${f.content}`).join('\n');

  const prompt = `
You are an advanced reasoning engine. Your task is to analyze the following retrieved memory fragments and the user's current query.
Goal: Synthesize a coherent "Mental Model" of the context that is most relevant to the query.
- Resolve any conflicts between facts (prioritize higher confidence or more recent facts).
- Filter out irrelevant noise.
- Connect related concepts.

User Query: "${query}"

Retrieved Facts:
${factsList}

Output ONLY the synthesized context summary in a clear, concise paragraph. Do not output your internal reasoning traces in the final response (DeepSeek will output them separately, we want the final answer here).
`;

  try {
    const result = await deepseek.generateStream([
      { role: 'user', text: prompt }
    ], undefined, { maxTokens: 1024, temperature: 0.3 });

    // Collect the stream
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    // Clean up thought tags
    const cleanText = fullText.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();

    if (!cleanText) {
      throw new Error("Empty response from reasoning model");
    }

    return cleanText;

  } catch (error) {
    console.error("DeepSeek context synthesis failed:", error);
    // Fallback to naive concatenation
    return facts.map(f => f.content).join('\n');
  }
}
