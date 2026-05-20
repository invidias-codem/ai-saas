export interface ChatMessage {
  role: string;
  text?: string;
  parts?: any[];
  [key: string]: any;
}

export interface TokenBudget {
  totalMax: number;        // Total maximum context window allowed for the LLM call
  system: number;          // Tokens allocated/reserved for the system instructions
  history: number;         // Tokens allocated/reserved for message history
  retrieved: number;       // Tokens allocated for retrieved context (facts, RAG, research, etc.)
  currentQuery: number;    // Tokens estimated for the current/new user query
  available: number;       // Tokens remaining/unassigned
}

export type ContextSectionKey =
  | 'userContextPrompt'
  | 'userProfileContext'
  | 'factContext'
  | 'graphContext'
  | 'searchContext'
  | 'memoryContext';

export interface SectionAllocation {
  key: ContextSectionKey;
  label: string;
  text: string;
  priority: number;         // Higher means more important (greedy packing order)
  estimatedTokens: number;
  allocatedTokens: number;
  required?: boolean;
}

export interface ContextAllocationResult {
  allocatedSections: SectionAllocation[];
  omittedSections: SectionAllocation[];
  totalAllocatedTokens: number;
  packedContext: string;
}

export interface ContextCompactionResult {
  originalText: string;
  compactedText: string;
  originalTokens: number;
  compactedTokens: number;
  method: 'truncate' | 'summary' | 'outline' | 'none';
  wasCompacted: boolean;
}

export type PreparedContextSections = {
  userContextPrompt?: string;
  userProfileContext?: string;
  factContext?: string;
  graphContext?: string;
  searchContext?: string;
  memoryContext?: string;
};
