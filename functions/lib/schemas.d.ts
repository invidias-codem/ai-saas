/**
 * Schemas and types for Cloud Functions
 * Mirrors the main app schemas for type safety
 */
export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}
export interface UserMemory {
    id: string;
    userId: string;
    featureType: 'conversation' | 'code' | 'image' | 'music' | 'video';
    title: string;
    summary: string;
    messages: Message[];
    embedding?: number[];
    tags?: string[];
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, any>;
    similarity?: number;
}
export interface UserContext {
    userId: string;
    preferredFeatures?: string[];
    communicationStyle?: string;
    recentTopics?: string[];
    totalInteractions: number;
    totalTokensUsed: number;
    createdAt: number;
    updatedAt: number;
    integrations?: {
        zapierEnabled: boolean;
        zapierToken?: string;
        slackEnabled: boolean;
        slackChannelId?: string;
        slackUserId?: string;
    };
}
export interface RAGIndex {
    id: string;
    userId: string;
    memoryId: string;
    embedding: number[];
    summary: string;
    featureType: string;
    createdAt: number;
}
export interface InteractionEvent {
    id: string;
    userId: string;
    featureType: 'conversation' | 'code' | 'image' | 'music' | 'video';
    action: 'create' | 'retrieve' | 'search' | 'share';
    inputLength: number;
    outputLength: number;
    tokensUsed: number;
    duration: number;
    success: boolean;
    error?: string;
    integrationsTriggered?: string[];
    createdAt: number;
}
export interface ZapierWebhook {
    id: string;
    userId: string;
    webhookUrl: string;
    triggerEvents: string[];
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}
export interface SlackIntegration {
    id: string;
    userId: string;
    slackUserId: string;
    slackChannelId: string;
    accessToken: string;
    botToken: string;
    enableNotifications: boolean;
    notifyOn?: string[];
    createdAt: number;
    updatedAt: number;
}
//# sourceMappingURL=schemas.d.ts.map