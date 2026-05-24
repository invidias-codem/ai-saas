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
exports.listMemories = listMemories;
exports.storeMemory = storeMemory;
exports.deleteCodeChunks = deleteCodeChunks;
exports.storeMemoriesBulk = storeMemoriesBulk;
exports.searchMemories = searchMemories;
exports.getMemoryStats = getMemoryStats;
exports.getMemoryCount = getMemoryCount;
exports.deleteMemory = deleteMemory;
exports.updateMemory = updateMemory;
const supabaseClient_1 = require("@/lib/supabaseClient");
const embedding_1 = require("@/lib/memory/embedding");
function buildEmbeddingColumnPatch(embeddingResult) {
    const now = new Date().toISOString();
    return embeddingResult.dimension === 768
        ? {
            embedding: embeddingResult.vector,
            embedding_768: embeddingResult.vector,
            embedding_provider: embeddingResult.provider,
            embedding_model: embeddingResult.model,
            embedding_updated_at: now,
        }
        : {
            embedding_3072: embeddingResult.vector,
            embedding_provider: embeddingResult.provider,
            embedding_model: embeddingResult.model,
            embedding_updated_at: now,
        };
}
function getMemoryRpcName(dimension) {
    return dimension === 768 ? 'match_memories_768' : 'match_memories_3072';
}
/**
 * Lists memories for a user with pagination.
 */
async function listMemories(userId, limit = 20, offset = 0) {
    try {
        const { safeDecompress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
        const { data, error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error)
            throw error;
        return data.map((item) => ({
            id: item.id,
            userId: userId,
            content: safeDecompress(item.content),
            type: item.type,
            metadata: item.metadata,
            createdAt: item.created_at
        }));
    }
    catch (error) {
        console.error('Error listing memories:', error);
        return [];
    }
}
/**
 * Stores a new memory in Supabase with provider/dimension-aware embeddings.
 */
async function storeMemory(userId, content, type, metadata = {}, options = {}) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
        console.warn('[MemoryStore] Skipping memory_bank insert without userId', {
            type,
            scope: options.scope || 'conversation',
            workspaceId: options.workspaceId ?? null,
            source: metadata?.source ?? null,
            featureType: metadata?.featureType ?? null,
            title: metadata?.title ?? null,
        });
        return null;
    }
    try {
        const embeddingResult = await (0, embedding_1.generateEmbeddingWithMetadata)(content);
        const { compress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
        const compressedContent = compress(content);
        const scope = options.scope || 'conversation';
        const normalizedMetadata = {
            ...metadata,
            ...(scope === 'workspace' && options.workspaceId
                ? { workspaceId: options.workspaceId, scopeHint: 'workspace', scopeLocked: true, allowUserPromotion: false }
                : {}),
        };
        const { data, error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .insert({
            user_id: normalizedUserId,
            content: compressedContent,
            type,
            scope,
            metadata: normalizedMetadata,
            ...buildEmbeddingColumnPatch(embeddingResult),
        })
            .select('id')
            .single();
        if (error) {
            console.error('Supabase error storing memory:', error);
            throw error;
        }
        return data.id;
    }
    catch (error) {
        console.error('Failed to store memory:', error);
        return null;
    }
}
/**
 * Helper to generate embeddings concurrently with a concurrency limit.
 */
async function getEmbeddingsConcurrent(contents, concurrencyLimit = 15) {
    const results = new Array(contents.length);
    let index = 0;
    async function worker() {
        while (index < contents.length) {
            const currentIndex = index++;
            try {
                results[currentIndex] = await (0, embedding_1.generateEmbeddingWithMetadata)(contents[currentIndex]);
            }
            catch (err) {
                console.error(`[VectorStore] Failed to generate embedding for index ${currentIndex}:`, err);
                throw err;
            }
        }
    }
    const workers = [];
    for (let i = 0; i < Math.min(concurrencyLimit, contents.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}
/**
 * Deletes stale code chunks for a specific file and workspace.
 */
async function deleteCodeChunks(filePath, workspaceId) {
    try {
        const { error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .delete()
            .eq('type', 'code_chunk')
            .eq('metadata->>workspaceId', workspaceId)
            .eq('metadata->>path', filePath);
        if (error)
            throw error;
        return true;
    }
    catch (error) {
        console.error('[VectorStore] Error deleting stale code chunks:', error);
        return false;
    }
}
/**
 * Stores multiple memories in bulk, batching them into blocks of 100.
 * Generates embeddings concurrently with a limit of 15 concurrent calls.
 */
async function storeMemoriesBulk(userId, memories, options = {}) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (!normalizedUserId) {
        console.warn('[MemoryStoreBulk] Skipping bulk insert without userId');
        return [];
    }
    if (memories.length === 0) {
        return [];
    }
    const { compress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
    const insertedIds = [];
    // Process in batches of 100 memories
    const BATCH_SIZE = 100;
    for (let i = 0; i < memories.length; i += BATCH_SIZE) {
        const batch = memories.slice(i, i + BATCH_SIZE);
        // 1. Generate embeddings concurrently (max 15 in parallel)
        const contents = batch.map(m => m.content);
        const embeddings = await getEmbeddingsConcurrent(contents, 15);
        // 2. Prepare bulk insert payload
        const scope = options.scope || 'conversation';
        const insertPayload = await Promise.all(batch.map(async (m, index) => {
            const compressedContent = compress(m.content);
            const embeddingResult = embeddings[index];
            const normalizedMetadata = {
                ...m.metadata,
                ...(scope === 'workspace' && options.workspaceId
                    ? { workspaceId: options.workspaceId, scopeHint: 'workspace', scopeLocked: true, allowUserPromotion: false }
                    : {}),
            };
            return {
                user_id: normalizedUserId,
                content: compressedContent,
                type: m.type,
                scope,
                metadata: normalizedMetadata,
                ...buildEmbeddingColumnPatch(embeddingResult),
            };
        }));
        // 3. Bulk insert to Supabase
        const { data, error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .insert(insertPayload)
            .select('id');
        if (error) {
            console.error('[MemoryStoreBulk] Supabase bulk insert error:', error);
            throw error;
        }
        if (data) {
            data.forEach((row) => insertedIds.push(row.id));
        }
    }
    return insertedIds;
}
/**
 * Searches for relevant memories using dimension-aware vector similarity RPCs.
 */
async function searchMemories(userId, query, limit = 5, featureType, metadataFilter = {}) {
    try {
        const embeddingResult = await (0, embedding_1.generateEmbeddingWithMetadata)(query);
        const { safeDecompress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
        const rpcName = getMemoryRpcName(embeddingResult.dimension);
        console.info('[VectorStore] Using retrieval lane', {
            rpcName,
            provider: embeddingResult.provider,
            model: embeddingResult.model,
            dimension: embeddingResult.dimension,
        });
        const { data, error } = await supabaseClient_1.supabase.rpc(rpcName, {
            query_embedding: embeddingResult.vector,
            match_threshold: 0.5,
            match_count: limit,
            filter_user_id: userId,
            filter_feature_type: featureType || null,
            metadata_filter: metadataFilter
        });
        if (error) {
            console.error('Supabase search error:', error);
            throw error;
        }
        return data.map((item) => ({
            id: item.id,
            userId: userId,
            content: safeDecompress(item.content),
            type: item.type,
            metadata: item.metadata,
            similarity: item.similarity,
            createdAt: item.created_at
        }));
    }
    catch (error) {
        console.error('Error searching memories:', error);
        return [];
    }
}
async function getMemoryStats(userId) {
    try {
        const { count, error: countError } = await supabaseClient_1.supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        if (countError)
            throw countError;
        const { data: lastMemory } = await supabaseClient_1.supabase
            .from('memory_bank')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        return {
            totalMemories: count || 0,
            lastInteractionDate: lastMemory ? new Date(lastMemory.created_at) : undefined
        };
    }
    catch (error) {
        console.error('Error getting memory stats:', error);
        return { totalMemories: 0, lastInteractionDate: undefined };
    }
}
async function getMemoryCount(userId) {
    try {
        const { count, error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);
        if (error)
            throw error;
        return count || 0;
    }
    catch (error) {
        console.error('Error getting memory count:', error);
        return 0;
    }
}
async function deleteMemory(memoryId, userId) {
    try {
        const { error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .delete()
            .eq('id', memoryId)
            .eq('user_id', userId);
        if (error)
            throw error;
        return true;
    }
    catch (error) {
        console.error('Error deleting memory:', error);
        return false;
    }
}
const MAX_MEMORY_CONTENT_LENGTH = 50000;
async function updateMemory(memoryId, userId, newContent) {
    if (!newContent || newContent.trim().length === 0) {
        console.error('Cannot update memory with empty content');
        return false;
    }
    if (newContent.length > MAX_MEMORY_CONTENT_LENGTH) {
        console.error(`Memory content exceeds maximum length of ${MAX_MEMORY_CONTENT_LENGTH}`);
        return false;
    }
    try {
        const { compress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
        const compressedContent = compress(newContent);
        const embeddingResult = await (0, embedding_1.generateEmbeddingWithMetadata)(newContent);
        const { error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .update({
            content: compressedContent,
            ...buildEmbeddingColumnPatch(embeddingResult),
        })
            .eq('id', memoryId)
            .eq('user_id', userId);
        if (error)
            throw error;
        return true;
    }
    catch (error) {
        console.error('Error updating memory:', error);
        return false;
    }
}
