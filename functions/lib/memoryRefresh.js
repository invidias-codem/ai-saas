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
exports.extendFactTTL = extendFactTTL;
exports.deleteFact = deleteFact;
exports.softDeleteFact = softDeleteFact;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
/**
 * Extend the TTL of a specific fact by 90 days
 * Used when user clicks "Keep this memory" to prevent deletion
 */
async function extendFactTTL(userId, factId, extendDays = 90) {
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
        functions.logger.debug(`Extended fact ${factId} for user ${userId} to ${new Date(newExpiresAt).toISOString()}`);
        return {
            success: true,
            newExpiresAt,
            message: `Memory extended by ${extendDays} days`,
        };
    }
    catch (error) {
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
async function deleteFact(userId, factId) {
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
    }
    catch (error) {
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
async function softDeleteFact(userId, factId) {
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
    }
    catch (error) {
        functions.logger.error(`Error soft-deleting fact:`, error);
        return {
            success: false,
            message: 'Error deleting memory',
        };
    }
}
//# sourceMappingURL=memoryRefresh.js.map