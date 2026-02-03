import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Scheduled Cloud Function to clean up expired conversation-level facts
 * Runs daily at midnight UTC
 * Removes facts where expiresAt < now() and scope = "conversation"
 */
export const scheduleFactCleanup = functions.pubsub
  .schedule("0 0 * * *") // Daily at midnight UTC
  .timeZone("UTC")
  .onRun(async () => {
    try {
      const now = Date.now();
      let totalCleaned = 0;

      // Get all users with facts
      const usersSnapshot = await db.collection("users").get();

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        const factsRef = db
          .collection("users")
          .doc(userId)
          .collection("facts");

        // Find all conversation-level facts that have expired
        const expiredSnapshot = await factsRef
          .where("expiresAt", "<=", now)
          .where("scope", "==", "conversation")
          .get();

        if (expiredSnapshot.empty) {
          continue;
        }

        // Delete expired facts in batches (max 500 per write)
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of expiredSnapshot.docs) {
          batch.delete(doc.ref);
          batchCount++;
          totalCleaned++;

          if (batchCount === 500) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }

        functions.logger.info(
          `Cleaned up ${expiredSnapshot.size} expired facts for user ${userId}`
        );
      }

      functions.logger.info(`Daily cleanup completed. Total facts removed: ${totalCleaned}`);
      return { success: true, cleanedCount: totalCleaned };
    } catch (error) {
      functions.logger.error("Error during scheduled fact cleanup:", error);
      throw error;
    }
  });
