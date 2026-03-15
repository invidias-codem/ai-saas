/**
 * Message Merge & Deduplication Logic
 * 
 * Handles merging and deduplicating messages from multiple devices
 * Ensures chronological order and no message loss
 */

export interface SyncMessage {
  id: string;                // Unique message identifier
  text: string;              // Message content
  role: "user" | "bot";      // Sender type
  timestamp: number;         // Unix timestamp (ms)
  deviceId: string;          // Origin device
  synced?: boolean;          // Whether uploaded to cloud
}

/**
 * Generate a deterministic message ID
 * Same message on different devices gets same ID (for deduplication)
 */
export function generateMessageId(
  text: string,
  timestamp: number,
  role: "user" | "bot"
): string {
  // Create a simple hash from message content
  let hash = 0;
  const str = `${text}${role}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Format: timestamp-role-hash
  return `${timestamp}-${role}-${Math.abs(hash).toString(16)}`;
}

/**
 * Convert session messages to sync messages with IDs
 */
export function toSyncMessages(
  sessionMessages: Array<{ text: string; role: "user" | "bot"; timestamp: number }>,
  deviceId: string
): SyncMessage[] {
  return sessionMessages.map(msg => ({
    id: generateMessageId(msg.text, msg.timestamp, msg.role),
    text: msg.text,
    role: msg.role,
    timestamp: msg.timestamp,
    deviceId,
    synced: false,
  }));
}

/**
 * Merge messages from multiple devices
 * Deduplicates by message ID and returns chronologically ordered
 */
export function mergeMessages(
  ...deviceMessages: SyncMessage[][]
): SyncMessage[] {
  if (deviceMessages.length === 0) return [];

  // Use Map to deduplicate by ID
  const merged = new Map<string, SyncMessage>();

  // Flatten all messages and deduplicate
  for (const messages of deviceMessages) {
    for (const msg of messages) {
      const existing = merged.get(msg.id);
      
      // Keep newest version (or any if timestamps equal)
      if (!existing || msg.timestamp > existing.timestamp) {
        merged.set(msg.id, msg);
      }
    }
  }

  // Convert to array and sort chronologically
  return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Detect duplicate messages (potential conflicts)
 */
export function findDuplicates(messages: SyncMessage[]): Array<{
  messageId: string;
  count: number;
  devices: string[];
}> {
  const idMap = new Map<string, Array<SyncMessage>>();

  // Group messages by ID
  for (const msg of messages) {
    if (!idMap.has(msg.id)) {
      idMap.set(msg.id, []);
    }
    idMap.get(msg.id)!.push(msg);
  }

  // Find duplicates
  const duplicates = [];
  for (const [id, msgs] of idMap.entries()) {
    if (msgs.length > 1) {
      duplicates.push({
        messageId: id,
        count: msgs.length,
        devices: [...new Set(msgs.map(m => m.deviceId))],
      });
    }
  }

  return duplicates;
}

/**
 * Get messages unique to each device
 */
export function getDeviceDifferences(
  device1Messages: SyncMessage[],
  device2Messages: SyncMessage[]
): {
  onlyDevice1: SyncMessage[];
  onlyDevice2: SyncMessage[];
  common: SyncMessage[];
} {
  const ids1 = new Set(device1Messages.map(m => m.id));
  const ids2 = new Set(device2Messages.map(m => m.id));

  const onlyDevice1 = device1Messages.filter(m => !ids2.has(m.id));
  const onlyDevice2 = device2Messages.filter(m => !ids1.has(m.id));
  const common = device1Messages.filter(m => ids2.has(m.id));

  return { onlyDevice1, onlyDevice2, common };
}

/**
 * Get sync summary
 */
export function getSyncSummary(messages: SyncMessage[]): {
  total: number;
  userMessages: number;
  botMessages: number;
  devices: Set<string>;
  timeSpan: { start: number; end: number } | null;
} {
  const devices = new Set(messages.map(m => m.deviceId));
  const userCount = messages.filter(m => m.role === 'user').length;
  const botCount = messages.filter(m => m.role === 'bot').length;

  const timestamps = messages.map(m => m.timestamp).sort((a, b) => a - b);
  const timeSpan = timestamps.length > 0
    ? { start: timestamps[0], end: timestamps[timestamps.length - 1] }
    : null;

  return {
    total: messages.length,
    userMessages: userCount,
    botMessages: botCount,
    devices,
    timeSpan,
  };
}

/**
 * Validate merged messages
 */
export function validateMergedMessages(messages: SyncMessage[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for out-of-order messages
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].timestamp < messages[i - 1].timestamp) {
      errors.push(`Message ${i} is out of order (timestamp regression)`);
    }
  }

  // Check for missing IDs
  for (let i = 0; i < messages.length; i++) {
    if (!messages[i].id) {
      errors.push(`Message ${i} has no ID`);
    }
  }

  // Check for duplicates
  const ids = new Set<string>();
  for (const msg of messages) {
    if (ids.has(msg.id)) {
      errors.push(`Duplicate message ID: ${msg.id}`);
    }
    ids.add(msg.id);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format merge summary for display
 */
export function formatMergeSummary(
  before: SyncMessage[],
  after: SyncMessage[]
): string {
  const summary = getSyncSummary(after);
  const added = after.length - before.length;

  return `Synced: ${after.length} messages (${added > 0 ? '+' : ''}${added} new) from ${summary.devices.size} device(s)`;
}
