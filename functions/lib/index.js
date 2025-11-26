"use strict";
/**
 * Firebase Cloud Functions Entry Point
 * Aggregates all Cloud Functions for deployment
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
exports.retrieveFactsForUser = exports.handleSlackInteractivity = exports.handleSlackCommand = exports.handleZapierAuth = exports.handleZapierWebhook = exports.getMemoryStats = exports.handleMemoryUpdate = exports.retrieveMemories = exports.captureConversationMemory = exports.updateUserContext = exports.initializeUserMemory = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Export all Cloud Functions
var userInitializer_1 = require("./userInitializer");
Object.defineProperty(exports, "initializeUserMemory", { enumerable: true, get: function () { return userInitializer_1.initializeUserMemory; } });
Object.defineProperty(exports, "updateUserContext", { enumerable: true, get: function () { return userInitializer_1.updateUserContext; } });
var conversationCapture_1 = require("./conversationCapture");
Object.defineProperty(exports, "captureConversationMemory", { enumerable: true, get: function () { return conversationCapture_1.captureConversationMemory; } });
Object.defineProperty(exports, "retrieveMemories", { enumerable: true, get: function () { return conversationCapture_1.retrieveMemories; } });
Object.defineProperty(exports, "handleMemoryUpdate", { enumerable: true, get: function () { return conversationCapture_1.handleMemoryUpdate; } });
Object.defineProperty(exports, "getMemoryStats", { enumerable: true, get: function () { return conversationCapture_1.getMemoryStats; } });
var zapierIntegration_1 = require("./zapierIntegration");
Object.defineProperty(exports, "handleZapierWebhook", { enumerable: true, get: function () { return zapierIntegration_1.handleZapierWebhook; } });
Object.defineProperty(exports, "handleZapierAuth", { enumerable: true, get: function () { return zapierIntegration_1.handleZapierAuth; } });
var slackIntegration_1 = require("./slackIntegration");
Object.defineProperty(exports, "handleSlackCommand", { enumerable: true, get: function () { return slackIntegration_1.handleSlackCommand; } });
Object.defineProperty(exports, "handleSlackInteractivity", { enumerable: true, get: function () { return slackIntegration_1.handleSlackInteractivity; } });
var factExtractor_1 = require("./factExtractor");
Object.defineProperty(exports, "retrieveFactsForUser", { enumerable: true, get: function () { return factExtractor_1.retrieveFactsForUser; } });
//# sourceMappingURL=index.js.map