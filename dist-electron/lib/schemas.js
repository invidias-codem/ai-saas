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
exports.extractedFactSchema = exports.slackIntegrationSchema = exports.zapierWebhookSchema = exports.interactionEventSchema = exports.ragIndexSchema = exports.userContextSchema = exports.userMemorySchema = exports.messageSchema = exports.promptSchema = void 0;
// lib/schemas.ts
const z = __importStar(require("zod"));
exports.promptSchema = z.object({
    prompt: z.string().min(1, "Prompt is required")
});
// ============================================
// RAG MEMORY SCHEMAS & TYPES
// ============================================
/**
 * Message format for conversation history
 */
exports.messageSchema = z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    timestamp: z.number().optional(),
});
/**
 * User memory records - stores individual interactions/conversations
 */
exports.userMemorySchema = z.object({
    id: z.string(),
    userId: z.string(),
    featureType: z.enum(["conversation", "code", "image", "music", "video"]),
    title: z.string(),
    summary: z.string(),
    messages: z.array(exports.messageSchema),
    embedding: z.array(z.number()).optional(), // Vector embedding for semantic search
    tags: z.array(z.string()).optional(), // Keywords for filtering
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z.record(z.any()).optional(), // Feature-specific metadata
});
/**
 * User context - aggregated profile and preferences
 */
exports.userContextSchema = z.object({
    userId: z.string(),
    preferredFeatures: z.array(z.string()).optional(),
    communicationStyle: z.string().optional(), // e.g., "technical", "casual", "formal"
    recentTopics: z.array(z.string()).optional(),
    totalInteractions: z.number().default(0),
    totalTokensUsed: z.number().default(0),
    createdAt: z.number(),
    updatedAt: z.number(),
    integrations: z.object({
        zapierEnabled: z.boolean().default(false),
        zapierToken: z.string().optional(),
        slackEnabled: z.boolean().default(false),
        slackChannelId: z.string().optional(),
        slackUserId: z.string().optional(),
    }).optional(),
});
/**
 * RAG Index entry - semantic search index for memory retrieval
 */
exports.ragIndexSchema = z.object({
    id: z.string(),
    userId: z.string(),
    memoryId: z.string(), // Reference to UserMemory document
    embedding: z.array(z.number()),
    summary: z.string(),
    featureType: z.string(),
    createdAt: z.number(),
});
/**
 * Interaction event - analytics and audit trail
 */
exports.interactionEventSchema = z.object({
    id: z.string(),
    userId: z.string(),
    featureType: z.enum(["conversation", "code", "image", "music", "video"]),
    action: z.enum(["create", "retrieve", "search", "share"]),
    inputLength: z.number(),
    outputLength: z.number(),
    tokensUsed: z.number(),
    duration: z.number(), // milliseconds
    success: z.boolean(),
    error: z.string().optional(),
    integrationsTriggered: z.array(z.string()).optional(), // e.g., ["zapier", "slack"]
    createdAt: z.number(),
});
/**
 * Zapier webhook config
 */
exports.zapierWebhookSchema = z.object({
    id: z.string(),
    userId: z.string(),
    webhookUrl: z.string().url(),
    triggerEvents: z.array(z.string()), // e.g., ["memory.created", "interaction.completed"]
    enabled: z.boolean().default(true),
    createdAt: z.number(),
    updatedAt: z.number(),
});
/**
 * Slack integration config
 */
exports.slackIntegrationSchema = z.object({
    id: z.string(),
    userId: z.string(),
    slackUserId: z.string(),
    slackChannelId: z.string(),
    accessToken: z.string(),
    botToken: z.string(),
    enableNotifications: z.boolean().default(true),
    notifyOn: z.array(z.string()).optional(), // e.g., ["memory.created", "usage_limit_warning"]
    createdAt: z.number(),
    updatedAt: z.number(),
});
/**
 * Extracted fact - key-value knowledge base for preventing hallucinations
 */
exports.extractedFactSchema = z.object({
    id: z.string().optional(),
    type: z.enum(["decision", "action_item", "blocker", "project", "verification"]),
    content: z.string(),
    confidence: z.number().min(0).max(1), // 0-1 confidence score
    extractedAt: z.number(),
    expiresAt: z.number().optional(), // For conversation-level facts (30 days)
    conversationId: z.string().optional(),
    scope: z.enum(["conversation", "user"]), // conversation-level vs persistent user facts
    createdAt: z.number().optional(),
});
