"use strict";
/**
 * RAG Memory Service - Handles embeddings and memory storage in Firestore
 * Uses Vertex AI for semantic embeddings and vector search
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
exports.generateEmbedding = generateEmbedding;
exports.storeUserMemory = storeUserMemory;
exports.retrieveRelevantMemories = retrieveRelevantMemories;
exports.formatMemoriesForContext = formatMemoriesForContext;
exports.cleanupOldMemories = cleanupOldMemories;
const admin = __importStar(require("firebase-admin"));
const vertexai_1 = require("@google-cloud/vertexai");
// Initialize Vertex AI
const vertexAI = new vertexai_1.VertexAI({
    project: process.env.GOOGLE_CLOUD_PROJECT || 'genie-ai-1ca85',
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
});
const embeddingModel = vertexAI.getGenerativeModel({
    model: 'text-embedding-004',
});
/**
 * Generate embedding vector for text using Vertex AI
 */
async function generateEmbedding(text) {
    try {
        if (!text || text.trim().length === 0) {
            console.warn('[generateEmbedding] Empty text provided, returning empty embedding');
            return [];
        }
        // embedContent is not defined on the GenerativeModel type in the SDK typings,
        // so cast to any to call embedding-related helpers and handle multiple possible response shapes.
        const modelAny = embeddingModel;
        // Try common embed APIs (embedContent or embed) and normalize the response.
        let response;
        if (typeof modelAny.embedContent === 'function') {
            response = await modelAny.embedContent({
                content: {
                    role: 'user',
                    parts: [{ text }],
                },
            });
        }
        else if (typeof modelAny.embed === 'function') {
            response = await modelAny.embed({ input: text });
        }
        else {
            console.error('[generateEmbedding] No embed method available on model');
            return [];
        }
        // Normalize common response shapes from Vertex AI clients
        const embedding = response?.embedding?.values ||
            response?.data?.[0]?.embedding ||
            response?.embeddings?.[0]?.values ||
            response?.embeddings ||
            [];
        console.log('[generateEmbedding] Generated embedding with', embedding?.length || 0, 'dimensions');
        if (!embedding || embedding.length === 0) {
            console.warn('[generateEmbedding] No embedding returned from API for text:', text.substring(0, 50));
            return [];
        }
        return embedding;
    }
    catch (error) {
        console.error('Error generating embedding:', error);
        throw new Error(`Failed to generate embedding: ${error}`);
    }
}
/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, x, i) => sum + x * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, x) => sum + x * x, 0));
    if (magnitudeA === 0 || magnitudeB === 0)
        return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}
/**
 * Store user memory with embedding in Firestore
 */
async function storeUserMemory(userId, memory) {
    try {
        const db = admin.firestore();
        // Generate summary for embedding
        const summaryText = memory.summary || memory.title;
        console.log('[storeUserMemory] Generating embedding for:', summaryText.substring(0, 50));
        const embedding = await generateEmbedding(summaryText);
        console.log('[storeUserMemory] Embedding generated, dimensions:', embedding?.length || 0);
        // Create memory document
        const memoryData = {
            ...memory,
            id: db.collection('users').doc(userId).collection('memories').doc().id,
            embedding,
        };
        // Filter out undefined values for Firestore compatibility
        const cleanedData = Object.fromEntries(Object.entries(memoryData).filter(([_, value]) => value !== undefined));
        console.log('[storeUserMemory] Cleaned data keys:', Object.keys(cleanedData));
        console.log('[storeUserMemory] Has embedding:', 'embedding' in cleanedData);
        // Store in Firestore
        const memoryRef = db
            .collection('users')
            .doc(userId)
            .collection('memories')
            .doc(memoryData.id);
        await memoryRef.set(cleanedData);
        console.log('[storeUserMemory] Memory stored successfully:', memoryData.id);
        // Also add to RAG index for faster semantic search
        await indexMemoryForRAG(userId, memoryData);
        return memoryData;
    }
    catch (error) {
        console.error('Error storing user memory:', error);
        throw error;
    }
}
/**
 * Index memory in RAG index collection for semantic search
 */
async function indexMemoryForRAG(userId, memory) {
    try {
        const db = admin.firestore();
        const ragIndex = {
            id: `${memory.id}-rag`,
            userId,
            memoryId: memory.id,
            embedding: memory.embedding || [],
            summary: memory.summary,
            featureType: memory.featureType,
            createdAt: Date.now(),
        };
        await db
            .collection('users')
            .doc(userId)
            .collection('ragIndex')
            .doc(ragIndex.id)
            .set(ragIndex);
    }
    catch (error) {
        console.error('Error indexing memory for RAG:', error);
        // Don't throw - RAG indexing failure shouldn't block memory storage
    }
}
/**
 * Retrieve relevant memories for context using semantic search
 */
async function retrieveRelevantMemories(userId, query, featureType, limit = 5) {
    try {
        const db = admin.firestore();
        // Generate embedding for query
        console.log('[retrieveRelevantMemories] Generating embedding for query:', query.substring(0, 50));
        const queryEmbedding = await generateEmbedding(query);
        console.log('[retrieveRelevantMemories] Query embedding dimensions:', queryEmbedding?.length || 0);
        // Fetch all memories for user (Firestore doesn't have native vector search yet)
        let memoryQuery = db
            .collection('users')
            .doc(userId)
            .collection('memories');
        if (featureType) {
            memoryQuery = memoryQuery.where('featureType', '==', featureType);
        }
        const snapshot = await memoryQuery.get();
        console.log('[retrieveRelevantMemories] Found', snapshot.size, 'total memories for user');
        const memories = [];
        const threshold = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.3');
        const useEmbeddings = queryEmbedding && queryEmbedding.length > 0;
        snapshot.forEach((doc) => {
            const memory = doc.data();
            let similarity = 0;
            let matchMethod = 'none';
            // Method 1: Vector similarity (if embeddings available)
            if (useEmbeddings && memory.embedding && memory.embedding.length > 0) {
                similarity = cosineSimilarity(queryEmbedding, memory.embedding);
                matchMethod = 'embedding';
            }
            // Method 2: Fallback to keyword matching
            else {
                const queryLower = query.toLowerCase();
                const titleMatch = memory.title.toLowerCase().includes(queryLower) ? 0.8 : 0;
                const summaryMatch = memory.summary.toLowerCase().includes(queryLower) ? 0.7 : 0;
                const tagsMatch = memory.tags?.some(tag => queryLower.includes(tag.toLowerCase())) ? 0.6 : 0;
                similarity = Math.max(titleMatch, summaryMatch, tagsMatch);
                matchMethod = 'keyword';
            }
            console.log(`[retrieveRelevantMemories] Memory: "${memory.title}" | Similarity: ${similarity.toFixed(4)} | Method: ${matchMethod} | Threshold: ${threshold}`);
            if (similarity >= threshold) {
                memories.push({
                    ...memory,
                    // Store similarity for sorting
                    similarity: similarity,
                });
            }
        });
        console.log('[retrieveRelevantMemories] Memories passing threshold:', memories.length);
        // Sort by similarity and return top results
        return memories
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
    catch (error) {
        console.error('Error retrieving relevant memories:', error);
        return []; // Return empty array if retrieval fails
    }
}
/**
 * Format memories into context string for Gemini prompts
 */
function formatMemoriesForContext(memories) {
    if (memories.length === 0) {
        return '';
    }
    const formattedMemories = memories
        .map((memory) => `**Previous Context** (${memory.featureType}):
Title: ${memory.title}
Summary: ${memory.summary}
Key Points: ${memory.tags?.join(', ') || 'N/A'}`)
        .join('\n\n');
    return `\n\n## User's Previous Interactions\n${formattedMemories}\n---\n`;
}
/**
 * Clean up old memories based on retention policy
 */
async function cleanupOldMemories(userId) {
    try {
        const db = admin.firestore();
        const retentionDays = parseInt(process.env.RAG_MEMORY_RETENTION_DAYS || '90');
        const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        const oldMemories = await db
            .collection('users')
            .doc(userId)
            .collection('memories')
            .where('createdAt', '<', cutoffTime)
            .get();
        let deletedCount = 0;
        const batch = db.batch();
        oldMemories.forEach((doc) => {
            batch.delete(doc.ref);
            deletedCount++;
        });
        await batch.commit();
        return deletedCount;
    }
    catch (error) {
        console.error('Error cleaning up old memories:', error);
        return 0;
    }
}
//# sourceMappingURL=ragMemoryService.js.map