/**
 * Memory Sync API Route
 *
 * POST /api/sync/memory
 * Synchronizes facts, preferences, and feedback across devices
 * Integrates with intelligent memory system
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  mergeMemoryFacts,
  mergeUserPreferences,
  detectPreferenceConflicts,
  filterValidFacts,
  batchMemorySync,
  calculateSyncMetrics,
  // FIX: Removed 'MemorySyncMessage' from here, as it's a type 
  // and is likely not exported from this utility file.
  generateMemorySyncChecksum,
  SyncMetrics,
  getDefaultPreferences,
} from '@/lib/memorySyncUtils';
import { ExtractedFact, UserPreferences } from '@/lib/intelligentMemory';
// FIX: Added a direct import for the type from the dedicated schema file.
import { MemorySyncMessage } from '@/lib/memorySyncUtils';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { extractedFactSchemaStrict, userPreferencesSchemaStrict } from '@/lib/schemas';
import type { ExtractedFact } from '@/lib/intelligentMemory';
import type { UserPreferences } from '@/lib/intelligentMemory';

// SECURITY: Strict payload schemas at the API boundary.
// Any extra keys from remote payloads are rejected before they reach
// the merge layer, neutralizing prototype pollution and context injection.
const incomingFactSchema = z.object({
  id: z.string().optional(),
  content: z.string(),
  type: z.enum(['decision', 'action_item', 'blocker', 'project', 'verification']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sentiment: z.number().optional(),
  impactScore: z.number().min(0).max(1).optional(),
  scope: z.enum(['conversation', 'user']).optional(),
  extractedAt: z.union([z.number(), z.date()]).optional(),
  expiresAt: z.union([z.number(), z.date()]).optional(),
  lastUsedAt: z.union([z.number(), z.date()]).optional(),
  contextRelevance: z.number().optional(),
  usageCount: z.number().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
  createdAt: z.union([z.number(), z.date()]).optional(),
  metadata: z.record(z.any()).optional(),
});

const incomingFactSchemaStrict = incomingFactSchema.strict();

const incomingPreferencesSchema = z.object({
  communicationStyle: z.enum(['casual', 'professional', 'technical', 'balanced']).optional(),
  preferredDepth: z.enum(['brief', 'balanced', 'detailed']).optional(),
  topics: z.record(z.number()).optional(),
  sentimentPreference: z.number().min(-1).max(1).optional(),
  learnedTopics: z.array(z.string()).optional(),
  avgResponseLength: z.number().nonNegative().optional(),
  preferredFormats: z.array(z.string()).optional(),
});

const incomingPreferencesSchemaStrict = incomingPreferencesSchema.strict();

function normalizeFact(raw: unknown): ExtractedFact | null {
  const parsed = incomingFactSchemaStrict.safeParse(raw);
  if (!parsed.success) {
    console.warn('[Sync] Dropping malformed fact payload:', parsed.error.message);
    return null;
  }
  const f = parsed.data;
  return {
    id: f.id,
    content: f.content,
    type: f.type || 'conversation',
    confidence: f.confidence ?? 0.7,
    sentiment: f.sentiment,
    impactScore: f.impactScore,
    scope: f.scope || 'user',
    extractedAt: f.extractedAt instanceof Date ? f.extractedAt.getTime() : (f.extractedAt ?? Date.now()),
    expiresAt: f.expiresAt instanceof Date ? f.expiresAt.getTime() : f.expiresAt,
    lastUsedAt: f.lastUsedAt instanceof Date ? f.lastUsedAt : (f.lastUsedAt ? new Date(f.lastUsedAt as any) : undefined),
    contextRelevance: f.contextRelevance,
    usageCount: f.usageCount,
    conversationId: f.conversationId,
    userId: f.userId,
    createdAt: f.createdAt instanceof Date ? f.createdAt.getTime() : f.createdAt,
    metadata: f.metadata,
  };
}

function normalizePreferences(raw: unknown): UserPreferences | null {
  const parsed = incomingPreferencesSchemaStrict.safeParse(raw);
  if (!parsed.success) {
    console.warn('[Sync] Dropping malformed preferences payload:', parsed.error.message);
    return null;
  }
  const p = parsed.data;
  return {
    communicationStyle: p.communicationStyle || 'balanced',
    preferredDepth: p.preferredDepth || 'balanced',
    topics: p.topics || {},
    sentimentPreference: p.sentimentPreference ?? 0,
    learnedTopics: p.learnedTopics || [],
    avgResponseLength: p.avgResponseLength ?? 150,
    preferredFormats: p.preferredFormats || [],
  };
}

interface SyncPayload {
  deviceId: string;
  facts: ExtractedFact[];
  preferences?: UserPreferences;
  feedback?: Array<{
    factId: string;
    helpful: boolean;
    rating: number;
    feedback?: string;
  }>;
  lastSyncTimestamp?: number;
}

interface SyncResponse {
  success: boolean;
  syncedAt: number;
  metrics: SyncMetrics;
  conflicts?: string[];
  deviceCount: number;
  mergedFacts: ExtractedFact[];
  mergedPreferences: UserPreferences;
  newItemsFromCloud: {
    facts: ExtractedFact[];
    preferences: UserPreferences;
  };
}

export async function POST(req: Request): Promise<NextResponse<SyncResponse | { error: string }>> {
  const syncStartTime = Date.now();

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: SyncPayload = await req.json();
    const { deviceId, facts, preferences, feedback, lastSyncTimestamp } = body;

    if (!deviceId || !Array.isArray(facts)) {
      return NextResponse.json(
        { error: 'Missing deviceId or facts array' },
        { status: 400 }
      );
    }

    // 1. Get current cloud state
    const memoryRef = db.collection('users').doc(userId).collection('memory');
    const factsDoc = await memoryRef.doc('facts').get();
    const preferencesDoc = await memoryRef.doc('preferences').get();

    const cloudFacts: ExtractedFact[] = (factsDoc.data()?.items || []) as ExtractedFact[];
    const cloudPreferences: UserPreferences = (preferencesDoc.data()?.data || getDefaultPreferences()) as UserPreferences;

    // 2. Filter out expired/invalid facts
    const validNewFacts = filterValidFacts(facts);

    // 3. Merge facts with deduplication
    let mergedFacts = mergeMemoryFacts(cloudFacts, validNewFacts, deviceId);
    const deduplicatedCount = cloudFacts.length + validNewFacts.length - mergedFacts.length;

    // 4. Merge preferences from all devices
    const devicePrefsRef = db
      .collection('users')
      .doc(userId)
      .collection('devicePreferences');
    const allDevicePrefs = await devicePrefsRef.get();

    const devicePrefsMap = new Map<string, UserPreferences>();
    allDevicePrefs.docs.forEach((doc: QueryDocumentSnapshot) => {
      devicePrefsMap.set(doc.id, doc.data() as UserPreferences);
    });

    // Add current device preferences
    if (preferences) {
      devicePrefsMap.set(deviceId, preferences);
    }

    const mergedPreferences = mergeUserPreferences(devicePrefsMap);
    const conflicts = detectPreferenceConflicts(Array.from(devicePrefsMap.values()));

    // 5. Process feedback entries
    if (feedback && feedback.length > 0) {
      for (const fb of feedback) {
        // Update fact importance based on feedback
        const factIdx = mergedFacts.findIndex(f => f.id === fb.factId);
        if (factIdx >= 0) {
          const fact = mergedFacts[factIdx];
          const oldImpact = fact.impactScore || 0.5;

          // Calculate new impact score based on rating and helpfulness
          const ratingFactor = (fb.rating / 5) * 0.7; // 70% weight on rating
          const helpfulFactor = fb.helpful ? 0.3 : -0.1; // 30% weight on helpfulness
          const newImpact = Math.max(0, Math.min(1, oldImpact + (ratingFactor + helpfulFactor) / 2));

          mergedFacts[factIdx] = {
            ...fact,
            impactScore: newImpact,
            userRating: fb.rating,
          };
        }

        // Store feedback in history
        await db
          .collection('users')
          .doc(userId)
          .collection('feedback')
          .add({
            factId: fb.factId,
            helpful: fb.helpful,
            rating: fb.rating,
            feedback: fb.feedback || null,
            createdAt: new Date(),
            deviceId,
          });
      }
    }

    // 6. Store merged data back to cloud
    await memoryRef.doc('facts').set(
      {
        items: mergedFacts,
        totalCount: mergedFacts.length,
        lastUpdated: new Date(),
        version: (factsDoc.data()?.version || 0) + 1,
      },
      { merge: false }
    );

    await memoryRef.doc('preferences').set(
      {
        data: mergedPreferences,
        deviceCount: devicePrefsMap.size,
        lastUpdated: new Date(),
        source: 'merged',
      },
      { merge: false }
    );

    // 7. Update device metadata
    const deviceRef = db
      .collection('users')
      .doc(userId)
      .collection('devices')
      .doc(deviceId);

    await deviceRef.set(
      {
        lastMemorySyncAt: new Date(),
        lastFactsSyncedCount: validNewFacts.length,
        preferencesSynced: !!preferences,
        feedbackSyncedCount: feedback?.length || 0,
      },
      { merge: true }
    );

    // 8. Log sync event
    const syncDuration = Date.now() - syncStartTime;
    await db
      .collection('users')
      .doc(userId)
      .collection('syncEvents')
      .add({
        type: 'memory_sync',
        timestamp: new Date(),
        deviceId,
        factsSynced: validNewFacts.length,
        factsMerged: mergedFacts.length,
        feedbackProcessed: feedback?.length || 0,
        deduplicationRate: deduplicatedCount / (cloudFacts.length + validNewFacts.length || 1),
        conflictCount: conflicts.length,
        syncDuration,
      });

    const metrics = calculateSyncMetrics(
      { facts: cloudFacts.length, preferences: 1, feedback: 0 },
      { facts: mergedFacts.length, preferences: 1, feedback: feedback?.length || 0 },
      syncDuration,
      deduplicatedCount
    );

    // 9. Fetch new items from cloud that this device should know about
    const newItemsFromCloud = {
      facts: mergedFacts.filter(
        f =>
          !validNewFacts.some(nf => nf.id === f.id) &&
          f.confidence >= 0.5
      ),
      preferences: mergedPreferences,
    };

    console.log('[API:MemorySync] Sync successful:', {
      userId: userId.substring(0, 8),
      deviceId: deviceId.substring(0, 12),
      factsSynced: validNewFacts.length,
      factsMerged: mergedFacts.length,
      deduplicatedCount,
      conflictCount: conflicts.length,
      syncDuration,
    });

    return NextResponse.json({
      success: true,
      syncedAt: Date.now(),
      metrics,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      deviceCount: devicePrefsMap.size,
      mergedFacts,
      mergedPreferences,
      newItemsFromCloud,
    });
  } catch (error) {
    console.error('[API:MemorySync] Error:', error);
    return NextResponse.json(
      {
        error: `Memory sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get sync history for this user
    const syncEventsRef = db
      .collection('users')
      .doc(userId)
      .collection('syncEvents')
      .where('type', '==', 'memory_sync')
      .orderBy('timestamp', 'desc')
      .limit(10);

    const snapshot = await syncEventsRef.get();
    const syncHistory = snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      syncHistory,
      totalSyncs: snapshot.size,
    });
  } catch (error) {
    console.error('[API:MemorySync] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync history' },
      { status: 500 }
    );
  }
}