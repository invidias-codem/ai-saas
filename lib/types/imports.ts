export type SupportedPlatform = 'openai' | 'anthropic' | 'gemini' | 'perplexity' | 'manus' | 'genie' | 'other';
export type Role = 'user' | 'assistant' | 'system' | 'tool';

// ─── UDIF Metadata (prep for Universal Data Interchange Format) ───────────────
// When UDIF spec is finalized, UDIFMetadata maps to the canonical schema.
// This allows Genie to act as a UCOL routing node with full context portability.
export interface UDIFMetadata {
  udifVersion?: string;          // e.g. "2.0" when spec ships
  contextId?: string;            // Unique ID for this context unit in UCOL graph
  originModel?: string;          // e.g. "gpt-4o", "claude-3-5-sonnet", "gemini-3.1-flash-lite-preview"
  routingTier?: 'fast' | 'balanced' | 'deep'; // UCOL routing tier hint
  sovereigntyMode?: 'user-owned' | 'platform' | 'shared'; // Data sovereignty flag
  exportedForPortability?: boolean;
}

export interface GenieUniversalImport {
  version: "1.0";
  source: SupportedPlatform;
  exportedAt: string;
  conversations: ImportedConversation[];
  memories?: ImportedMemory[];
  userPreferences?: ImportedPreferences[];
  extractedFacts?: ExtractedFact[];
  detectedTopics?: string[];
  communicationProfile?: CommunicationProfile;
  // UDIF/UCOL prep
  udif?: UDIFMetadata;
}

// ─── Export Direction (Genie → external format) ───────────────────────────────
export interface GenieExportOptions {
  format: 'guif' | 'openai' | 'anthropic' | 'udif-draft';
  includeMemories?: boolean;
  includeFacts?: boolean;
  dateRange?: { from: string; to: string };
  conversationIds?: string[];
}

export interface GenieConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: GenieMessage[];
  sourcePlatform?: string;
  externalId?: string;
}

export interface GenieMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  model?: string;
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
  sentimentTrend: number;
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
  model?: string; // which model generated this (for assistant messages)
  attachments?: {
    type: 'image' | 'file' | 'code_snippet' | 'artifact';
    url?: string;
    content?: string;
    mimeType?: string;
    name?: string;
  }[];
  metadata?: {
    timestampUnknown?: boolean;
    toolName?: string;       // for tool/function call messages
    toolInputs?: unknown;
    isArtifact?: boolean;
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

export interface ImportJob {
  id: string;
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
  validateFormat(data: unknown): boolean;
  parse(data: unknown): GenieUniversalImport;
}

export interface PreviewableParser extends PlatformParser {
  preview(data: unknown): {
    valid: boolean;
    platform: string;
    counts: { conversations: number; messages: number };
  };
}

export interface MemoryExtractableParser extends PlatformParser {
  extractMemories(data: unknown): {
    facts: ExtractedFact[];
    preferences: ImportedPreferences;
    profile: CommunicationProfile;
  };
}
