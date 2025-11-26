/**
 * Sync Devices API Route
 * 
 * GET /api/sync/devices
 * Returns list of all devices user has logged in from
 */

import { auth } from '@clerk/nextjs/server';
import * as admin from 'firebase-admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const firebaseApp = !admin.apps.length ? admin.initializeApp() : admin.app();
const db = admin.firestore();

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query devices collection for this user
    const devicesRef = db.collection('users').doc(userId).collection('devices');
    const snapshot = await devicesRef.orderBy('lastSeen', 'desc').get();

    const devices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      lastSeen: doc.data().lastSeen || Date.now(),
      messageCount: doc.data().messageCount || 0,
      isActive: Date.now() - (doc.data().lastSeen || 0) < 30 * 60 * 1000, // 30 min timeout
    }));

    return NextResponse.json({
      devices,
      totalDevices: devices.length,
      lastSync: Date.now(),
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
