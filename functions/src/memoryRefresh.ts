import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

/**
 * Extend the TTL of a specific fact by 90 days
 * Used when user clicks "Keep this memory" to prevent deletion
 */
export async function extendFactTTL(
  userId: string,
  factId: string,
  extendDays: number = 90
): Promise<{ success: boolean; newExpiresAt?: number; message: string }> {
  try {
    const factRef = db.collection('users').doc(userId).collection('facts').doc(factId);
    const factDoc = await factRef.get();

    if (!factDoc.exists) {
      return {
        success: false,
        message: 'Fact not found',
      };
    }

    const factData = factDoc.data();

    // Only conversation-level facts can expire; user-level facts persist indefinitely
    if (factData?.scope !== 'conversation') {
      return {
        success: false,
        message: 'User-level facts do not expire',
      };
    }

    const extendMs = extendDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const newExpiresAt = now + extendMs;

    await factRef.update({
      expiresAt: newExpiresAt,
      lastExtendedAt: now,
    });

    functions.logger.debug(
      `Extended fact ${factId} for user ${userId} to ${new Date(newExpiresAt).toISOString()}`
    );

    return {
      success: true,
      newExpiresAt,
      message: `Memory extended by ${extendDays} days`,
    };
  } catch (error) {
    functions.logger.error(`Error extending fact TTL:`, error);
    return {
      success: false,
      message: 'Error extending memory',
    };
  }
}

/**
 * Delete a specific fact from user's memory
 */
export async function deleteFact(
  userId: string,
  factId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const factRef = db.collection('users').doc(userId).collection('facts').doc(factId);
    const factDoc = await factRef.get();

    if (!factDoc.exists) {
      return {
        success: false,
        message: 'Fact not found',
      };
    }

    await factRef.delete();

    functions.logger.debug(`Deleted fact ${factId} for user ${userId}`);

    return {
      success: true,
      message: 'Memory deleted successfully',
    };
  } catch (error) {
    functions.logger.error(`Error deleting fact:`, error);
    return {
      success: false,
      message: 'Error deleting memory',
    };
  }
}

/**
 * Soft delete a fact (mark as deleted instead of removing)
 * Useful for auditing and recovery
 */
export async function softDeleteFact(
  userId: string,
  factId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const factRef = db.collection('users').doc(userId).collection('facts').doc(factId);
    const factDoc = await factRef.get();

    if (!factDoc.exists) {
      return {
        success: false,
        message: 'Fact not found',
      };
    }

    await factRef.update({
      isDeleted: true,
      deletedAt: Date.now(),
    });

    functions.logger.debug(`Soft-deleted fact ${factId} for user ${userId}`);

    return {
      success: true,
      message: 'Memory deleted successfully',
    };
  } catch (error) {
    functions.logger.error(`Error soft-deleting fact:`, error);
    return {
      success: false,
      message: 'Error deleting memory',
    };
  }
}
