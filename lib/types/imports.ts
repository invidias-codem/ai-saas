export type SupportedPlatform = 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'manus' | 'other';
export type Role = 'user' | 'assistant' | 'system';

export interface GenieUniversalImport {
    version: "1.0";
    source: SupportedPlatform;
    exportedAt: string; // ISO 8601
    conversations: ImportedConversation[];
    memories?: ImportedMemory[];
    userPreferences?: ImportedPreferences[];
    // Extracted knowledge from analysis
    extractedFacts?: ExtractedFact[];
    detectedTopics?: string[];
    communicationProfile?: CommunicationProfile;
}

export interface ExtractedFact {
    type: 'fact' | 'preference' | 'decision' | 'action_item' | 'personal_info';
    content: string;
    confidence: number;
    sourceConversationId?: string;
    sourceMessageIndex?: number;
    extractedAt: string;
}

export interface CommunicationProfile {
    style: 'casual' | 'professional' | 'technical' | 'balanced';
    preferredDepth: 'brief' | 'balanced' | 'detailed';
    avgMessageLength: number;
    topTopics: string[];
    sentimentTrend: number; // -1 to 1
}

export interface ImportedConversation {
    externalId?: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: ImportedMessage[];
    metadata?: Record<string, any>;
}

export interface ImportedMessage {
    role: Role;
    content: string;
    timestamp: string;
    attachments?: {
        type: 'image' | 'file' | 'code_snippet';
        url?: string;
        content?: string;
        mimeType?: string;
    }[];
    metadata?: {
        timestampUnknown?: boolean;
        [key: string]: any;
    };
}

export interface ImportedMemory {
    type: 'fact' | 'preference' | 'summary';
    content: string;
    createdAt: string;
}

export interface ImportedPreferences {
    communicationStyle?: string;
    customInstructions?: string;
}

// Database record type for the 'imports' table
export interface ImportJob {
    id: string; // UUID
    user_id: string;
    source_platform: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
    file_name?: string;
    file_size_bytes?: number;
    total_conversations: number;
    processed_conversations: number;
    imported_memories: number;
    error_log?: any[];
    metadata?: Record<string, any>;
    started_at: string;
    completed_at?: string;
}

export interface PlatformParser {
    platform: SupportedPlatform;
    /**
     * strict validation to check if the provided data matches the platform's export format.
     * Used for auto-detection.
     */
    validateFormat(data: unknown): boolean;
    /**
     * Parse the platform-specific export data into the Genie Universal Import Format.
     */
    parse(data: unknown): GenieUniversalImport;
}

export interface PreviewableParser extends PlatformParser {
    preview(data: unknown): {
        valid: boolean;
        platform: string;
        counts: {
            conversations: number;
            messages: number;
        };
    };
}

export interface MemoryExtractableParser extends PlatformParser {
    extractMemories(data: unknown): {
        facts: ExtractedFact[];
        preferences: ImportedPreferences;
        profile: CommunicationProfile;
    };
}
