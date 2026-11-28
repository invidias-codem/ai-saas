import { sanitizeForLog } from '@/lib/security/urlValidator';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';

/**
 * Slack Thread Manager
 *
 * Manages conversation histories for Slack threads in Firestore.
 * This allows the bot to maintain context within a thread.
 */
const THREAD_COLLECTION = 'slackThreadHistories';

/**
 * Represents a single message in a Slack thread history.
 */
export interface SlackThreadMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: FieldValue;
}

/**
 * Retrieves the conversation history for a given thread.
 *
 * @param teamId The Slack team ID.
 * @param threadTs The timestamp of the thread.
 * @returns An array of SlackThreadMessage objects.
 */
export async function getThreadHistory(teamId: string, threadTs: string): Promise<SlackThreadMessage[]> {
  try {
    const docRef = db.collection(THREAD_COLLECTION).doc(`${sanitizeForLog(teamId)}-${threadTs}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      return [];
    }

    const data = doc.data();
    return data?.messages || [];
  } catch (error) {
    logger.error(`[THREAD_MANAGER] Error getting thread history for ${sanitizeForLog(teamId)}-${sanitizeForLog(threadTs)}:`, error);
    return [];
  }
}

/**
 * Adds a message to the conversation history of a thread.
 *
 * @param teamId The Slack team ID.
 * @param threadTs The timestamp of the thread.
 * @param message The message to add.
 */
export async function updateThreadHistory(teamId: string, threadTs: string, message: Omit<SlackThreadMessage, 'timestamp'>): Promise<void> {
  try {
    const docRef = db.collection(THREAD_COLLECTION).doc(`${sanitizeForLog(teamId)}-${threadTs}`);
    const newMessage: SlackThreadMessage = {
      ...message,
      timestamp: new Date() as any, // Firestore arrays cannot contain serverTimestamp()
    };

    await docRef.set(
      {
        messages: FieldValue.arrayUnion(newMessage),
        teamId: teamId,
        threadTs: threadTs,
        lastUpdated: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    logger.error(`[THREAD_MANAGER] Error updating thread history for ${sanitizeForLog(teamId)}-${sanitizeForLog(threadTs)}:`, error);
  }
}
