import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// In-memory cache for embeddings (simple LRU-like cache)
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const MAX_CACHE_SIZE = 100;

/**
 * Generates an embedding vector for the given text.
 * Uses 'embedding-001' model by default.
 * Implements caching to reduce API calls.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY is not set');
        }

        // Check cache first
        const cacheKey = text.substring(0, 500); // Use first 500 chars as key
        const cached = embeddingCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log('[Embedding] Cache hit');
            return cached.embedding;
        }

        // For retrieval tasks, we use the available model
        const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

        const result = await model.embedContent(text);
        const embedding = result.embedding;

        // Store in cache
        if (embeddingCache.size >= MAX_CACHE_SIZE) {
            // Remove oldest entry (simple FIFO)
            const firstKey = embeddingCache.keys().next().value;
            if (firstKey) {
                embeddingCache.delete(firstKey);
            }
        }

        const embeddingValues = embedding.values || [];

        embeddingCache.set(cacheKey, {
            embedding: embeddingValues,
            timestamp: Date.now()
        });

        return embeddingValues;
    } catch (error: any) {
        // Handle rate limits gracefully
        if (error?.status === 429 || error?.toString().includes('429')) {
            console.warn('[Embedding] Rate limited. Returning empty vector.');
            // Return a zero vector as fallback
            return new Array(768).fill(0);
        }
        console.error('Error generating embedding:', error);
        throw error;
    }
}

/**
 * Clear the embedding cache (useful for testing or manual reset)
 */
export function clearEmbeddingCache() {
    embeddingCache.clear();
}
