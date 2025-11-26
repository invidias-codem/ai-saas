/**
 * Memory Sync Utilities
 * Handles intelligent memory fact and preference synchronization across devices
 */

import { ExtractedFact, UserPreferences } from '@/lib/intelligentMemory';

export interface MemorySyncMessage {
  id: string;
  type: 'fact' | 'preference' | 'feedback';
  deviceId: string;
  timestamp: number;
  data: ExtractedFact | UserPreferences | FeedbackData;
  checksum: string;
}

export interface FeedbackData {
  factId: string;
  helpful: boolean;
  rating: number;
  feedback?: string;
  createdAt: number;
}

export interface SyncState {
  lastSyncTimestamp: number;
  syncedFactIds: Set<string>;
  syncedPreferenceIds: Set<string>;
  deviceId: string;
}

/**
 * Generate deterministic checksum for memory sync deduplication
 */
export function generateMemorySyncChecksum(
  type: string,
  data: any,
  deviceId: string
): string {
  const content = JSON.stringify({
    type,
    data,
    deviceId,
  });

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(36);
}

/**
 * Merge facts from multiple devices with deduplication
 */
export function mergeMemoryFacts(
  existingFacts: ExtractedFact[],
  newFacts: ExtractedFact[],
  deviceId: string
): ExtractedFact[] {
  const factMap = new Map<string, ExtractedFact>();

  // Add existing facts
  existingFacts.forEach(fact => {
    if (fact.id) {
      factMap.set(fact.id, fact);
    }
  });

  // Merge new facts with conflict resolution
  newFacts.forEach(newFact => {
    if (!newFact.id) {
      // Generate ID if missing
      newFact.id = `fact_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    const existing = factMap.get(newFact.id);

    if (existing) {
      // Merge logic: keep highest confidence, combine usage, average sentiment
      const merged: ExtractedFact = {
        ...existing,
        confidence: Math.max(existing.confidence, newFact.confidence),
        usageCount: (existing.usageCount || 0) + (newFact.usageCount || 0),
        sentiment: existing.sentiment && newFact.sentiment
          ? (existing.sentiment + newFact.sentiment) / 2
          : existing.sentiment || newFact.sentiment,
        impactScore: Math.max(existing.impactScore || 0, newFact.impactScore || 0),
        lastUsedAt: new Date(
          Math.max(
            existing.lastUsedAt?.getTime() || 0,
            newFact.lastUsedAt?.getTime() || 0
          )
        ),
      };

      factMap.set(newFact.id, merged);
    } else {
      // New fact from different device
      factMap.set(newFact.id, newFact);
    }
  });

  return Array.from(factMap.values());
}

/**
 * Merge user preferences from multiple devices
 * Uses weighted average for numeric values, union for arrays/topics
 */
export function mergeUserPreferences(
  devicePreferences: Map<string, UserPreferences>,
  weights?: Map<string, number>
): UserPreferences {
  if (devicePreferences.size === 0) {
    return getDefaultPreferences();
  }

  const prefs = Array.from(devicePreferences.values());
  const defaultWeight = 1 / prefs.length;

  // Merge communication styles (most common)
  const styleCount: Record<string, number> = {};
  prefs.forEach(p => {
    styleCount[p.communicationStyle] = (styleCount[p.communicationStyle] || 0) + 1;
  });
  const communicationStyle = (
    Object.entries(styleCount).sort(([, a], [, b]) => b - a)[0]?.[0] || 'balanced'
  ) as any;

  // Merge preferred depths (most common)
  const depthCount: Record<string, number> = {};
  prefs.forEach(p => {
    depthCount[p.preferredDepth] = (depthCount[p.preferredDepth] || 0) + 1;
  });
  const preferredDepth = (
    Object.entries(depthCount).sort(([, a], [, b]) => b - a)[0]?.[0] || 'balanced'
  ) as any;

  // Merge topics (union with average interest scores)
  const topicScores: Record<string, number[]> = {};
  prefs.forEach((p, idx) => {
    const weight = weights?.get(Array.from(devicePreferences.keys())[idx]) || defaultWeight;
    Object.entries(p.topics).forEach(([topic, score]) => {
      if (!topicScores[topic]) {
        topicScores[topic] = [];
      }
      topicScores[topic].push(score * weight);
    });
  });

  const topics: Record<string, number> = {};
  Object.entries(topicScores).forEach(([topic, scores]) => {
    topics[topic] = scores.reduce((a, b) => a + b, 0);
  });

  // Average sentiment preference
  const avgSentimentPreference =
    prefs.reduce((sum, p) => sum + p.sentimentPreference, 0) / prefs.length;

  // Union of learned topics and preferred formats
  const learnedTopics = Array.from(
    new Set(prefs.flatMap(p => p.learnedTopics || []))
  );
  const preferredFormats = Array.from(
    new Set(prefs.flatMap(p => p.preferredFormats || []))
  );

  // Average response length
  const avgResponseLength =
    prefs.reduce((sum, p) => sum + p.avgResponseLength, 0) / prefs.length;

  return {
    communicationStyle,
    preferredDepth,
    topics,
    sentimentPreference: Math.max(-1, Math.min(1, avgSentimentPreference)),
    learnedTopics,
    avgResponseLength,
    preferredFormats,
  };
}

/**
 * Detect conflicts in preference merging
 */
export function detectPreferenceConflicts(
  preferences: UserPreferences[]
): string[] {
  const conflicts: string[] = [];

  if (preferences.length < 2) return conflicts;

  // Check if communication styles conflict
  const styles = new Set(preferences.map(p => p.communicationStyle));
  if (styles.size > 1) {
    conflicts.push(
      `Communication style mismatch: ${Array.from(styles).join(', ')}`
    );
  }

  // Check if sentiment preferences significantly differ
  const sentiments = preferences.map(p => p.sentimentPreference);
  const maxDiff = Math.max(...sentiments) - Math.min(...sentiments);
  if (maxDiff > 1.0) {
    conflicts.push(
      `Sentiment preference divergence: ${maxDiff.toFixed(2)} (max difference)`
    );
  }

  // Check topic interest conflicts
  const topicDivergence = calculateTopicDivergence(preferences);
  if (topicDivergence > 0.5) {
    conflicts.push(
      `Significant topic interest differences: divergence=${topicDivergence.toFixed(2)}`
    );
  }

  return conflicts;
}

/**
 * Calculate topic interest divergence across devices
 */
function calculateTopicDivergence(preferences: UserPreferences[]): number {
  if (preferences.length < 2) return 0;

  const allTopics = new Set<string>();
  preferences.forEach(p => {
    Object.keys(p.topics).forEach(t => allTopics.add(t));
  });

  let totalDivergence = 0;
  let topicCount = 0;

  allTopics.forEach(topic => {
    const scores = preferences.map(p => p.topics[topic] || 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    totalDivergence += Math.sqrt(variance);
    topicCount++;
  });

  return topicCount > 0 ? totalDivergence / topicCount : 0;
}

/**
 * Get default user preferences
 */
export function getDefaultPreferences(): UserPreferences {
  return {
    communicationStyle: 'balanced',
    preferredDepth: 'balanced',
    topics: {},
    sentimentPreference: 0,
    learnedTopics: [],
    avgResponseLength: 200,
    preferredFormats: ['text'],
  };
}

/**
 * Filter facts by recency and validity
 */
export function filterValidFacts(facts: ExtractedFact[], maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): ExtractedFact[] {
  const now = Date.now();
  return facts.filter(fact => {
    // Check if expired
    if (fact.expiresAt && fact.expiresAt.getTime() < now) {
      return false;
    }

    // Check if too old
    const factAge = fact.extractedAt ? now - fact.extractedAt.getTime() : 0;
    if (factAge > maxAgeMs) {
      return false;
    }

    // Check minimum confidence
    if (fact.confidence < 0.3) {
      return false;
    }

    return true;
  });
}

/**
 * Batch memory sync operations for efficiency
 */
export function batchMemorySync(
  messages: MemorySyncMessage[],
  batchSize: number = 100
): MemorySyncMessage[][] {
  const batches: MemorySyncMessage[][] = [];

  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Calculate sync efficiency metrics
 */
export interface SyncMetrics {
  factsSynced: number;
  factsDeduplicated: number;
  preferencesSynced: number;
  feedbackRecorded: number;
  syncDuration: number;
  deduplicationRate: number; // 0-1 scale
}

export function calculateSyncMetrics(
  before: { facts: number; preferences: number; feedback: number },
  after: { facts: number; preferences: number; feedback: number },
  duration: number,
  deduplicated: number
): SyncMetrics {
  const factsSynced = after.facts - before.facts;
  const preferencesSynced = after.preferences - before.preferences;
  const feedbackRecorded = after.feedback - before.feedback;
  const totalNewItems = factsSynced + preferencesSynced + feedbackRecorded;

  return {
    factsSynced,
    factsDeduplicated: deduplicated,
    preferencesSynced,
    feedbackRecorded,
    syncDuration: duration,
    deduplicationRate: totalNewItems > 0 ? deduplicated / totalNewItems : 0,
  };
}
