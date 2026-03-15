/**
 * RAG Memory Service - Handles embeddings and memory storage in Firestore
 * Uses Vertex AI for semantic embeddings and vector search
 */
import { UserMemory } from './schemas';
/**
 * Generate embedding vector for text using Vertex AI
 */
export declare function generateEmbedding(text: string): Promise<number[]>;
/**
 * Store user memory with embedding in Firestore
 */
export declare function storeUserMemory(userId: string, memory: Omit<UserMemory, 'id' | 'embedding'>): Promise<UserMemory>;
/**
 * Retrieve relevant memories for context using semantic search
 */
export declare function retrieveRelevantMemories(userId: string, query: string, featureType?: string, limit?: number): Promise<UserMemory[]>;
/**
 * Format memories into context string for Gemini prompts
 */
export declare function formatMemoriesForContext(memories: UserMemory[]): string;
/**
 * Clean up old memories based on retention policy
 */
export declare function cleanupOldMemories(userId: string): Promise<number>;
//# sourceMappingURL=ragMemoryService.d.ts.map