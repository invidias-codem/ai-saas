"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleFactCleanup = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Scheduled Cloud Function to clean up expired conversation-level facts
 * Runs daily at midnight UTC
 * Removes facts where expiresAt < now() and scope = "conversation"
 */
exports.scheduleFactCleanup = functions.pubsub
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
            functions.logger.info(`Cleaned up ${expiredSnapshot.size} expired facts for user ${userId}`);
        }
        functions.logger.info(`Daily cleanup completed. Total facts removed: ${totalCleaned}`);
        return { success: true, cleanedCount: totalCleaned };
    }
    catch (error) {
        functions.logger.error("Error during scheduled fact cleanup:", error);
        throw error;
    }
});
//# sourceMappingURL=scheduleFactCleanup.js.map