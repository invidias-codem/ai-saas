/**
 * User initialization trigger - Creates memory collections on user signup
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { UserContext } from './schemas';

/**
 * Firestore trigger: Initialize user context and memory collections on new user
 */
export const initializeUserMemory = functions.firestore
  .document('users/{userId}')
  .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const db = admin.firestore();

    try {
      // Initialize user context document
      const userContext: UserContext = {
        userId,
        preferredFeatures: [],
        recentTopics: [],
        totalInteractions: 0,
        totalTokensUsed: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        integrations: {
          zapierEnabled: false,
          slackEnabled: false,
        },
      };

      await db
        .collection('users')
        .doc(userId)
        .collection('context')
        .doc('profile')
        .set(userContext);

      // Create empty subcollections to enable indexing
      await db
        .collection('users')
        .doc(userId)
        .collection('memories')
        .doc('_placeholder')
        .set({
          placeholder: true,
          createdAt: Date.now(),
        });

      await db
        .collection('users')
        .doc(userId)
        .collection('ragIndex')
        .doc('_placeholder')
        .set({
          placeholder: true,
          createdAt: Date.now(),
        });

      await db
        .collection('users')
        .doc(userId)
        .collection('interactions')
        .doc('_placeholder')
        .set({
          placeholder: true,
          createdAt: Date.now(),
        });

      console.log(`Initialized memory collections for user: ${userId}`);
    } catch (error) {
      console.error(`Error initializing user memory for ${userId}:`, error);
      throw error;
    }
  });

/**
 * Update user context when interactions occur
 */
export async function updateUserContext(
  userId: string,
  tokensUsed: number,
  featureType: string,
  topics?: string[]
): Promise<void> {
  try {
    const db = admin.firestore();
    const contextRef = db
      .collection('users')
      .doc(userId)
      .collection('context')
      .doc('profile');

    await contextRef.update({
      totalInteractions: admin.firestore.FieldValue.increment(1),
      totalTokensUsed: admin.firestore.FieldValue.increment(tokensUsed),
      updatedAt: Date.now(),
      [`preferredFeatures.${featureType}`]: admin.firestore.FieldValue.increment(1),
      ...(topics && {
        recentTopics: admin.firestore.FieldValue.arrayUnion(...topics),
      }),
    });
  } catch (error) {
    console.error('Error updating user context:', error);
    // Don't throw - context update shouldn't block main flow
  }
}
