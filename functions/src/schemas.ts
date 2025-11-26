/**
 * Schemas and types for Cloud Functions
 * Mirrors the main app schemas for type safety
 */

// Message format for conversation history
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

// User memory records
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
  similarity?: number; // Used during search results
}

// User context
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

// RAG Index entry
export interface RAGIndex {
  id: string;
  userId: string;
  memoryId: string;
  embedding: number[];
  summary: string;
  featureType: string;
  createdAt: number;
}

// Interaction event
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

// Zapier webhook config
export interface ZapierWebhook {
  id: string;
  userId: string;
  webhookUrl: string;
  triggerEvents: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// Slack integration config
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

// Extracted fact - key-value knowledge base for preventing hallucinations
export interface ExtractedFact {
  id?: string;
  type: 'decision' | 'action_item' | 'blocker' | 'project' | 'verification';
  content: string;
  confidence: number; // 0-1 confidence score
  extractedAt: number;
  expiresAt?: number; // For conversation-level facts (30 days)
  conversationId?: string;
  scope: 'conversation' | 'user'; // conversation-level vs persistent user facts
  createdAt?: number;
}
