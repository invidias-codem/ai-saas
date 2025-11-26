/**
 * Sync Conversation API Route
 * 
 * POST /api/sync/conversation
 * Merges and stores messages from device to cloud
 * Handles multi-device synchronization
 */

import { auth } from '@clerk/nextjs/server';
import * as admin from 'firebase-admin';
import { NextResponse } from 'next/server';
import { mergeMessages, SyncMessage } from '@/lib/messageMerge';

export const dynamic = 'force-dynamic';

const firebaseApp = !admin.apps.length ? admin.initializeApp() : admin.app();
const db = admin.firestore();

export async function POST(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { deviceId, messages, isNewDevice, lastSyncTimestamp } = body;

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
        lastSeen: Date.now(),
        messageCount: messages.length,
        isActive: true,
      },
      { merge: true }
    );

    // 2. Retrieve existing merged conversation (if any)
    const conversationRef = db
      .collection('users')
      .doc(userId)
      .collection('conversations')
      .doc('merged');

    const existingDoc = await conversationRef.get();
    const existing = existingDoc.data();
    const existingMessages: SyncMessage[] = existing?.messages || [];

    // 3. Merge new messages with existing
    const merged = mergeMessages(existingMessages, messages as SyncMessage[]);

    // 4. Track which devices contributed to this conversation
    const devicesSynced = new Set(existing?.devicesSynced || []);
    devicesSynced.add(deviceId);

    // 5. Store merged conversation back to Firestore
    await conversationRef.set(
      {
        messages: merged,
        devicesSynced: Array.from(devicesSynced),
        lastUpdated: Date.now(),
        version: (existing?.version || 0) + 1,
        totalMessages: merged.length,
      },
      { merge: false }
    );

    // 6. Log sync event for analytics
    await db.collection('users').doc(userId).collection('syncEvents').add({
      timestamp: Date.now(),
      deviceId,
      action: isNewDevice ? 'new_device_sync' : 'regular_sync',
      messagesSynced: messages.length,
      totalMerged: merged.length,
      deviceCount: devicesSynced.size,
    });

    console.log('[API:SyncConversation] Sync successful:', {
      userId: userId.substring(0, 8),
      deviceId: deviceId.substring(0, 12),
      messagesSynced: messages.length,
      totalMerged: merged.length,
      isNewDevice,
    });

    return NextResponse.json({
      success: true,
      merged,
      syncedAt: Date.now(),
      deviceCount: devicesSynced.size,
      messagesSynced: messages.length,
      totalMerged: merged.length,
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
