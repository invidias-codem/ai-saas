import { supabase } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';
import type { MemoryType, MemoryScope } from '@/lib/memory/vectorStore';

export interface InteractionFeedback {
    /** Direct user feedback signal (e.g. 1.0 for thumbs up, -1.0 for thumbs down) */
    explicitFeedback?: number; 
    /** LLM evaluated semantic utility score */
    semanticSentiment?: number; 
    /** Detected toxic loop or explicit user frustration */
    frustrationSignal?: boolean; 
}

/**
 * Calculates the total utility reward (R) for an interaction.
 * Optimizes for high-utility outcomes and actively penalizes addictive loops.
 * 
 * R = F_explicit + S_semantic - C_negative
 */
export function calculateInteractionReward(feedback: InteractionFeedback): number {
    let r = 0.0;
    if (feedback.explicitFeedback !== undefined) {
        r += feedback.explicitFeedback;
    }
    if (feedback.semanticSentiment !== undefined) {
        r += feedback.semanticSentiment;
    }
    if (feedback.frustrationSignal) {
        // Heavy penalty for genuine negative connotation (C_negative)
        r -= 5.0; 
    }
    
    // Bound the reward between -5.0 and 5.0 to maintain stability
    return Math.max(-5.0, Math.min(5.0, r));
}

export interface OptimizationArgs {
    userId: string;
    workspaceId?: string;
    /** The IDs of historical memories that were retrieved and used in the current interaction */
    usedMemoryIds?: string[];
    /** Feedback signals calculated post-interaction */
    feedback: InteractionFeedback;
    /** The "Next Session" new state observations to store */
    newMemories?: Array<{
        content: string;
        type: MemoryType;
        scope: MemoryScope;
        metadata?: any;
    }>;
}

/**
 * The Asynchronous Background Optimizer.
 * Executes post-interaction to:
 * 1. Calculate definitive reward (R)
 * 2. Update historical memory weights via reinforcement
 * 3. Perform semantic deduplication on new observations
 * 4. Apply exponential decay to prune stale "useful-once" context
 */
export async function runBackgroundOptimization(args: OptimizationArgs): Promise<void> {
    const { userId, workspaceId, usedMemoryIds, feedback, newMemories } = args;

    try {
        const reward = calculateInteractionReward(feedback);
        const now = new Date().toISOString();

        // 1. Reinforce historically used memories with the current interaction reward
        if (usedMemoryIds && usedMemoryIds.length > 0) {
            await reinforceMemories(userId, usedMemoryIds, reward, now);
        }

        // 2. Process New Memories (The "Next Session" heuristic & Semantic Deduplication)
        if (newMemories && newMemories.length > 0) {
            // Dynamic Thresholding heuristic could be applied here based on total workspace vectors.
            // For now, using a high static threshold for deduplication.
            const deduplicationThreshold = 0.90; 

            for (const newMem of newMemories) {
                await processNewMemoryWithDeduplication(userId, workspaceId, newMem, reward, now, deduplicationThreshold);
            }
        }

        // 3. Memory Decay
        // Asynchronous non-blocking call to prune stale context
        // In a high-scale production setting, this might be triggered less frequently or via a scheduled job.
        await executeMemoryDecay(userId, now);

    } catch (err) {
        console.error('[BackgroundOptimizer] Optimization process failed:', err);
    }
}

/**
 * Reinforces existing memories by compounding their reward score and updating access timestamps.
 */
async function reinforceMemories(userId: string, memoryIds: string[], rewardDelta: number, accessedAt: string) {
    if (memoryIds.length === 0) return;

    // Fetch current scores
    const { data: currentMemories, error: fetchError } = await supabase
        .from('memory_bank')
        .select('id, reward_score')
        .in('id', memoryIds)
        .eq('user_id', userId);

    if (fetchError || !currentMemories) {
        console.error('[BackgroundOptimizer] Failed to fetch memories for reinforcement:', fetchError);
        return;
    }

    // Ideally, a Supabase RPC could batch update these `reward_score = reward_score + delta`.
    // Doing individual updates for now.
    for (const mem of currentMemories) {
        const newScore = Math.max(0, (mem.reward_score || 1.0) + rewardDelta);
        
        await supabase
            .from('memory_bank')
            .update({
                reward_score: newScore,
                last_accessed_at: accessedAt
            })
            .eq('id', mem.id);
    }
}

/**
 * Dedupes semantically similar memories. If a match is found, it reinforces the match.
 * Otherwise, it inserts a new memory vector.
 */
async function processNewMemoryWithDeduplication(
    userId: string, 
    workspaceId: string | undefined, 
    mem: OptimizationArgs['newMemories'][0], 
    rewardDelta: number, 
    now: string,
    threshold: number
) {
    const embeddingResult = await generateEmbeddingWithMetadata(mem.content);
    const rpcName = embeddingResult.dimension === 768 ? 'match_memories_768' : 'match_memories_3072';

    const { data: existingMemories, error: searchError } = await supabase.rpc(rpcName, {
        query_embedding: embeddingResult.vector,
        match_threshold: threshold,
        match_count: 1,
        filter_user_id: userId,
        filter_feature_type: mem.type
    });

    if (searchError) {
        console.error('[BackgroundOptimizer] Deduplication search failed:', searchError);
        return;
    }

    if (existingMemories && existingMemories.length > 0) {
        // Deduplication Match: reinforce the existing vector instead of duplicating
        const match = existingMemories[0];
        await reinforceMemories(userId, [match.id], rewardDelta, now);
        console.info(`[BackgroundOptimizer] Semantic deduplication triggered. Reinforced memory: ${match.id}`);
    } else {
        // Insert new memory
        const { compress } = await import('@/lib/compression');
        const compressedContent = compress(mem.content);
        const normalizedMetadata = {
            ...mem.metadata,
            ...(mem.scope === 'workspace' && workspaceId
                ? { workspaceId: workspaceId, scopeHint: 'workspace', scopeLocked: true, allowUserPromotion: false }
                : {}),
        };

        const embeddingColumns = embeddingResult.dimension === 768
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

        const baseReward = 1.0 + Math.max(0, rewardDelta);

        const { error: insertError } = await supabase
            .from('memory_bank')
            .insert({
                user_id: userId,
                content: compressedContent,
                type: mem.type,
                scope: mem.scope,
                metadata: normalizedMetadata,
                reward_score: baseReward,
                last_accessed_at: now,
                ...embeddingColumns,
            });

        if (insertError) {
            console.error('[BackgroundOptimizer] Failed to insert deduplicated memory:', insertError);
        }
    }
}

/**
 * Exponential decay on memories unaccessed for more than 30 days.
 */
async function executeMemoryDecay(userId: string, nowStr: string) {
    const staleDate = new Date(nowStr);
    staleDate.setDate(staleDate.getDate() - 30); // 30 days of inactivity

    const { data: staleMemories, error: staleError } = await supabase
        .from('memory_bank')
        .select('id, reward_score')
        .eq('user_id', userId)
        .lt('last_accessed_at', staleDate.toISOString())
        .limit(50); // Decay in chunks to avoid locking/performance issues
        
    if (staleError || !staleMemories || staleMemories.length === 0) {
        return;
    }
    
    for (const mem of staleMemories) {
        // 10% decay
        const decayedScore = Math.max(0.01, (mem.reward_score || 1.0) * 0.9);
        
        await supabase
            .from('memory_bank')
            .update({ reward_score: decayedScore })
            .eq('id', mem.id);
    }
}
