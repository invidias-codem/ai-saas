"use strict";
/**
 * User initialization trigger - Creates memory collections on user signup
 */
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
exports.initializeUserMemory = void 0;
exports.updateUserContext = updateUserContext;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
/**
 * Firestore trigger: Initialize user context and memory collections on new user
 */
exports.initializeUserMemory = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
    const userId = context.params.userId;
    const db = admin.firestore();
    try {
        // Initialize user context document
        const userContext = {
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
    }
    catch (error) {
        console.error(`Error initializing user memory for ${userId}:`, error);
        throw error;
    }
});
/**
 * Update user context when interactions occur
 */
async function updateUserContext(userId, tokensUsed, featureType, topics) {
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
    }
    catch (error) {
        console.error('Error updating user context:', error);
        // Don't throw - context update shouldn't block main flow
    }
}
//# sourceMappingURL=userInitializer.js.map