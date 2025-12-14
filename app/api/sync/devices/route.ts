/**
 * Sync Devices API Route
 * 
 * GET /api/sync/devices
 * Returns list of all devices user has logged in from
 * Includes memory sync status and preferences state
 * 
 * DELETE /api/sync/devices/[deviceId]
 * Removes a device and triggers preference reconciliation
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { mergeUserPreferences } from '@/lib/memorySyncUtils';
import { db } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

interface DeviceInfo {
  id: string;
  lastSeen: number;
  messageCount: number;
  isActive: boolean;
  lastConversationSyncAt?: Date;
  lastMemorySyncAt?: Date;
  lastFactsSyncedCount?: number;
  preferencesSynced?: boolean;
  syncStatus?: 'syncing' | 'synced' | 'pending';
  lastSyncDuration?: number;
}

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query devices collection for this user
    const devicesRef = db.collection('users').doc(userId).collection('devices');
    const snapshot = await devicesRef.orderBy('lastSeen', 'desc').get();

    const now = Date.now();
    const devices: DeviceInfo[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const lastSeenTime = (data.lastSeen?.toDate?.()?.getTime?.() || data.lastSeen || 0);
      
      return {
        id: doc.id,
        lastSeen: lastSeenTime,
        messageCount: data.messageCount || 0,
        isActive: now - lastSeenTime < 30 * 60 * 1000, // 30 min timeout
        lastConversationSyncAt: data.lastConversationSyncAt,
        lastMemorySyncAt: data.lastMemorySyncAt,
        lastFactsSyncedCount: data.lastFactsSyncedCount,
        preferencesSynced: data.preferencesSynced,
        syncStatus: data.syncStatus || 'pending',
        lastSyncDuration: data.lastSyncDuration,
      };
    });

    // Get memory sync status
    const memoryRef = db.collection('users').doc(userId).collection('memory');
    const factsDoc = await memoryRef.doc('facts').get();
    const preferencesDoc = await memoryRef.doc('preferences').get();

    const memoryStats = {
      totalFacts: factsDoc.data()?.totalCount || 0,
      preferencesDeviceCount: preferencesDoc.data()?.deviceCount || 0,
      lastMemoryUpdate: preferencesDoc.data()?.lastUpdated?.toDate?.() || null,
    };

    return NextResponse.json({
      devices,
      totalDevices: devices.length,
      activeDevices: devices.filter(d => d.isActive).length,
      lastSync: new Date(),
      memoryStats,
      userId: userId.substring(0, 8) + '...', // Anonymize for logging
    });
  } catch (error) {
    console.error('[API:SyncDevices] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract deviceId from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const deviceId = pathParts[pathParts.length - 1];

    if (!deviceId || deviceId === 'route.ts') {
      return NextResponse.json(
        { error: 'Device ID required' },
        { status: 400 }
      );
    }

    // 1. Remove device
    const deviceRef = db.collection('users').doc(userId).collection('devices').doc(deviceId);
    await deviceRef.delete();

    // 2. Get remaining device preferences for reconciliation
    const devicePrefsRef = db
      .collection('users')
      .doc(userId)
      .collection('devicePreferences');
    
    await devicePrefsRef.doc(deviceId).delete();

    const remainingPrefs = await devicePrefsRef.get();
    const prefMap = new Map();
    
    remainingPrefs.docs.forEach(doc => {
      prefMap.set(doc.id, doc.data());
    });

    // 3. Remerge preferences from remaining devices
    const mergedPreferences = mergeUserPreferences(prefMap);

    // 4. Update merged preferences
    const memoryRef = db.collection('users').doc(userId).collection('memory');
    await memoryRef.doc('preferences').set(
      {
        data: mergedPreferences,
        deviceCount: prefMap.size,
        lastUpdated: new Date(),
        source: 'merged',
        removedDevice: deviceId,
      },
      { merge: true }
    );

    // 5. Log device removal
    await db
      .collection('users')
      .doc(userId)
      .collection('syncEvents')
      .add({
        type: 'device_removed',
        timestamp: new Date(),
        removedDeviceId: deviceId,
        remainingDeviceCount: prefMap.size,
      });

    console.log('[API:SyncDevices] Device removed:', {
      userId: userId.substring(0, 8),
      deviceId: deviceId.substring(0, 12),
      remainingDevices: prefMap.size,
    });

    return NextResponse.json({
      success: true,
      removedDeviceId: deviceId,
      remainingDevices: prefMap.size,
      mergedPreferences,
    });
  } catch (error) {
    console.error('[API:SyncDevices] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Failed to remove device' },
      { status: 500 }
    );
  }
}
