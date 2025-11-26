/**
 * Device Sync Manager
 * 
 * Orchestrates multi-device synchronization
 * - Detects when user logs in on different device
 * - Manages sync sessions per device
 * - Handles conflict resolution and merging
 * - Provides sync status monitoring
 */

import { SyncMessage, mergeMessages } from './messageMerge';
import { getOrCreateDeviceId, getDeviceInfo } from './deviceIdentifier';

export interface SyncSession {
  deviceId: string;
  userId: string;
  messageCount: number;
  lastSyncTime: number;
  lastMessageTime: number;
  isActive: boolean;
}

export interface MultiDeviceStatus {
  isMultiDevice: boolean;
  deviceCount: number;
  currentDevice: string;
  devices: Array<{
    deviceId: string;
    platform: string;
    browser: string;
    lastSeen: number;
    messageCount: number;
  }>;
  pendingSync: number;
}

const SYNC_CONFIG = {
  AUTO_SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
  DEVICE_TIMEOUT: 30 * 60 * 1000,    // 30 minutes inactive = offline
  SYNC_BATCH_SIZE: 50,               // Messages per sync
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF: 5000,               // 5 seconds
};

// In-memory store for sync sessions (per device)
const syncSessions = new Map<string, SyncSession>();

/**
 * Register a device sync session
 * Called when user logs in or page loads
 */
export function registerSyncSession(
  userId: string,
  messageCount: number = 0
): SyncSession {
  const deviceId = getOrCreateDeviceId();
  const deviceInfo = getDeviceInfo();

  const session: SyncSession = {
    deviceId,
    userId,
    messageCount,
    lastSyncTime: Date.now(),
    lastMessageTime: Date.now(),
    isActive: true,
  };

  syncSessions.set(deviceId, session);

  console.log('[DeviceSync] Registered session:', {
    deviceId: deviceId.substring(0, 12),
    userId: userId.substring(0, 8),
    platform: deviceInfo.platform,
    browser: deviceInfo.browser,
  });

  return session;
}

/**
 * Update last activity time for device
 * Called after each message
 */
export function trackMessageSent(messageCount: number): void {
  const deviceId = getOrCreateDeviceId();
  const session = syncSessions.get(deviceId);

  if (session) {
    session.messageCount = messageCount;
    session.lastMessageTime = Date.now();
    session.lastSyncTime = Date.now();
  }
}

/**
 * Detect if user is on multiple devices
 */
export function detectMultiDeviceLogin(userId: string): MultiDeviceStatus {
  const currentDeviceId = getOrCreateDeviceId();
  const currentDeviceInfo = getDeviceInfo();

  // Get all active sessions for this user
  const activeSessions = Array.from(syncSessions.values())
    .filter(s => s.userId === userId && s.isActive)
    .filter(s => Date.now() - s.lastSyncTime < SYNC_CONFIG.DEVICE_TIMEOUT);

  const isMultiDevice = activeSessions.length > 1;

  return {
    isMultiDevice,
    deviceCount: activeSessions.length,
    currentDevice: currentDeviceId,
    devices: activeSessions.map(s => ({
      deviceId: s.deviceId,
      platform: currentDeviceInfo.platform,
      browser: currentDeviceInfo.browser,
      lastSeen: s.lastSyncTime,
      messageCount: s.messageCount,
    })),
    pendingSync: 0, // Will be set by caller if known
  };
}

/**
 * Check if this is a new device for the user
 * Used to trigger initial sync
 */
export function isNewDeviceLogin(userId: string, previousDeviceId?: string): boolean {
  const currentDeviceId = getOrCreateDeviceId();

  if (!previousDeviceId) {
    // No previous device recorded - treat as new
    return true;
  }

  return previousDeviceId !== currentDeviceId;
}

/**
 * Mark session as inactive (user logged out or offline)
 */
export function markSessionInactive(deviceId: string = getOrCreateDeviceId()): void {
  const session = syncSessions.get(deviceId);
  if (session) {
    session.isActive = false;
    console.log('[DeviceSync] Marked session inactive:', deviceId.substring(0, 12));
  }
}

/**
 * Clear old sessions (offline > 30 minutes)
 * Called periodically to clean up stale devices
 */
export function cleanupOldSessions(): number {
  const now = Date.now();
  let removed = 0;

  for (const [deviceId, session] of syncSessions.entries()) {
    if (now - session.lastSyncTime > SYNC_CONFIG.DEVICE_TIMEOUT) {
      syncSessions.delete(deviceId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[DeviceSync] Cleaned up ${removed} old sessions`);
  }

  return removed;
}

/**
 * Get sync status for monitoring/debugging
 */
export function getSyncStatus(): {
  lastSyncTime: number;
  activeSessions: number;
  currentDevice: string;
  isOnline: boolean;
  multiDeviceDetected: boolean;
} {
  const currentDeviceId = getOrCreateDeviceId();
  const currentSession = syncSessions.get(currentDeviceId);

  const activeSessions = Array.from(syncSessions.values()).filter(
    s => Date.now() - s.lastSyncTime < SYNC_CONFIG.DEVICE_TIMEOUT
  ).length;

  return {
    lastSyncTime: currentSession?.lastSyncTime || 0,
    activeSessions,
    currentDevice: currentDeviceId.substring(0, 12),
    isOnline: navigator.onLine || false,
    multiDeviceDetected: activeSessions > 1,
  };
}

/**
 * Format device status for UI display
 */
export function formatSyncStatus(status: MultiDeviceStatus): string {
  if (status.deviceCount === 1) {
    return 'Single device';
  }

  return `Syncing across ${status.deviceCount} devices`;
}

/**
 * Get configuration value
 */
export function getSyncConfig(key: keyof typeof SYNC_CONFIG): number {
  return SYNC_CONFIG[key];
}

/**
 * Update a configuration value (for testing)
 */
export function setSyncConfig(key: keyof typeof SYNC_CONFIG, value: number): void {
  (SYNC_CONFIG as any)[key] = value;
  console.log(`[DeviceSync] Updated config ${key} = ${value}`);
}

/**
 * Clear all sync sessions (factory reset)
 */
export function clearAllSessions(): void {
  syncSessions.clear();
  console.log('[DeviceSync] Cleared all sync sessions');
}

/**
 * Export sync sessions for debugging
 */
export function getDebugInfo(): {
  sessions: SyncSession[];
  config: typeof SYNC_CONFIG;
  currentDevice: string;
} {
  return {
    sessions: Array.from(syncSessions.values()),
    config: SYNC_CONFIG,
    currentDevice: getOrCreateDeviceId(),
  };
}
