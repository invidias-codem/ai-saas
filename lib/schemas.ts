// lib/schemas.ts
import * as z from "zod";

export const promptSchema = z.object({
    prompt: z.string().min(1, "Prompt is required")
});

// ============================================
// RAG MEMORY SCHEMAS & TYPES
// ============================================

/**
 * Message format for conversation history
 */
export const messageSchema = z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    timestamp: z.number().optional(),
});

export type Message = z.infer<typeof messageSchema>;

/**
 * User memory records - stores individual interactions/conversations
 */
export const userMemorySchema = z.object({
    id: z.string(),
    userId: z.string(),
    featureType: z.enum(["conversation", "code", "image", "music", "video"]),
    title: z.string(),
    summary: z.string(),
    messages: z.array(messageSchema),
    embedding: z.array(z.number()).optional(), // Vector embedding for semantic search
    tags: z.array(z.string()).optional(), // Keywords for filtering
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z.record(z.any()).optional(), // Feature-specific metadata
});

export type UserMemory = z.infer<typeof userMemorySchema>;

/**
 * User context - aggregated profile and preferences
 */
export const userContextSchema = z.object({
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

export type UserContext = z.infer<typeof userContextSchema>;

/**
 * RAG Index entry - semantic search index for memory retrieval
 */
export const ragIndexSchema = z.object({
    id: z.string(),
    userId: z.string(),
    memoryId: z.string(), // Reference to UserMemory document
    embedding: z.array(z.number()),
    summary: z.string(),
    featureType: z.string(),
    createdAt: z.number(),
});

export type RAGIndex = z.infer<typeof ragIndexSchema>;

/**
 * Interaction event - analytics and audit trail
 */
export const interactionEventSchema = z.object({
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

export type InteractionEvent = z.infer<typeof interactionEventSchema>;

/**
 * Zapier webhook config
 */
export const zapierWebhookSchema = z.object({
    id: z.string(),
    userId: z.string(),
    webhookUrl: z.string().url(),
    triggerEvents: z.array(z.string()), // e.g., ["memory.created", "interaction.completed"]
    enabled: z.boolean().default(true),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export type ZapierWebhook = z.infer<typeof zapierWebhookSchema>;

/**
 * Slack integration config
 */
export const slackIntegrationSchema = z.object({
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

export type SlackIntegration = z.infer<typeof slackIntegrationSchema>;

/**
 * Extracted fact - key-value knowledge base for preventing hallucinations
 */
export const extractedFactSchema = z.object({
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

export type ExtractedFact = z.infer<typeof extractedFactSchema>;