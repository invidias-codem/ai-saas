/**
 * Sync Conversation API Route
 * 
 * POST /api/sync/conversation
 * Merges and stores messages from device to cloud
 * Handles multi-device synchronization
 * Integrates with intelligent memory system for fact extraction
 */

import { auth } from '@clerk/nextjs/server';
import * as admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { mergeMessages, SyncMessage } from '@/lib/messageMerge';

export const dynamic = 'force-dynamic';

const firebaseApp = !admin.apps.length ? admin.initializeApp() : admin.app();
const db = admin.firestore();

interface ConversationSyncPayload {
  deviceId: string;
  messages: SyncMessage[];
  isNewDevice?: boolean;
  lastSyncTimestamp?: number;
  conversationId?: string;
}

export async function POST(req: Request) {
  const syncStartTime = Date.now();

  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ConversationSyncPayload = await req.json();
    const { deviceId, messages, isNewDevice, lastSyncTimestamp, conversationId } = body;

    if (!deviceId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing deviceId or messages' },
        { status: 400 }
      );
    }

    // 1. Update device metadata in Firestore
    const deviceRef = db.collection('users').doc(userId).collection('devices').doc(deviceId);
    await deviceRef.set(
      {
        lastSeen: new Date(),
        lastConversationSyncAt: new Date(),
        messageCount: messages.length,
        isActive: true,
        syncStatus: 'syncing',
      },
      { merge: true }
    );

    // 2. Retrieve existing merged conversation (if any)
    const convId = conversationId || 'merged';
    const conversationRef = db
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc(convId);

    const existingDoc = await conversationRef.get();
    const existing = existingDoc.data();
    const existingMessages: SyncMessage[] = existing?.messages || [];

    // 3. Merge new messages with existing (handles deduplication)
    const merged = mergeMessages(existingMessages, messages as SyncMessage[]);

    // 4. Track which devices contributed to this conversation
    const devicesSynced = new Set(existing?.devicesSynced || []);
    devicesSynced.add(deviceId);

    // 5. Extract metrics for optimization
    const messageDeduplicatedCount = existingMessages.length + messages.length - merged.length;
    const newMessagesCount = merged.length - (existing?.messages?.length || 0);

    // 6. Store merged conversation back to Firestore
    await conversationRef.set(
      {
        messages: merged,
        devicesSynced: Array.from(devicesSynced),
        lastUpdated: new Date(),
        lastUpdatedBy: deviceId,
        version: (existing?.version || 0) + 1,
        totalMessages: merged.length,
        messageDeduplicatedCount,
        syncHistory: [
          ...(existing?.syncHistory || []),
          {
            deviceId,
            timestamp: new Date(),
            newMessages: newMessagesCount,
            totalAfterMerge: merged.length,
          },
        ].slice(-20), // Keep last 20 syncs
      },
      { merge: false }
    );

    // 7. Log sync event for analytics
    const syncDuration = Date.now() - syncStartTime;
    await db.collection('users').doc(userId).collection('syncEvents').add({
      type: 'conversation_sync',
      timestamp: new Date(),
      deviceId,
      conversationId: convId,
      action: isNewDevice ? 'new_device_sync' : 'regular_sync',
      messagesSynced: messages.length,
      totalMerged: merged.length,
      messageDeduplicatedCount,
      deviceCount: devicesSynced.size,
      syncDuration,
    });

    // 8. Update device sync status
    await deviceRef.update({
      syncStatus: 'synced',
      lastSyncDuration: syncDuration,
    });

    console.log('[API:SyncConversation] Sync successful:', {
      userId: userId.substring(0, 8),
      deviceId: deviceId.substring(0, 12),
      conversationId: convId.substring(0, 12),
      messagesSynced: messages.length,
      totalMerged: merged.length,
      deduplicatedCount: messageDeduplicatedCount,
      isNewDevice,
      syncDuration,
    });

    return NextResponse.json({
      success: true,
      merged,
      syncedAt: new Date(),
      deviceCount: devicesSynced.size,
      metrics: {
        messagesSynced: messages.length,
        totalMerged: merged.length,
        messageDeduplicatedCount,
        syncDuration,
      },
    });
  } catch (error) {
    console.error('[API:SyncConversation] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Sync failed', details: errorMessage },
      { status: 500 }
    );
  }
}
