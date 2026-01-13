/**
 * Learning Store - Stores and retrieves learning patterns from searches and conversations
 * Enables Genie to learn from past interactions and make better decisions
 */

import { supabase } from '@/lib/supabaseClient';
import { generateEmbedding } from '@/lib/memory/embedding';

// ============================================
// INTERFACES
// ============================================

export interface LearningPattern {
    id?: string;
    user_id: string;
    query_type: 'crypto' | 'weather' | 'news' | 'stock' | 'general';
    query_pattern: string;
    query_embedding?: number[];
    successful_approach: 'api' | 'search' | 'memory';
    result_summary: string;
    confidence: number;
    usage_count: number;
    last_used: Date;
    created_at?: Date;
}

export interface LearnedKnowledge {
    id?: string;
    user_id?: string; // null = global knowledge
    topic: string;
    fact: string;
    fact_embedding?: number[];
    source_type: 'search' | 'api' | 'conversation';
    source_url?: string;
    confidence: number;
    extracted_at: Date;
    expires_at?: Date;
    usage_count: number;
}

// ============================================
// LEARNING PATTERN STORAGE
// ============================================

/**
 * Store a successful query pattern for future reference
 */
export async function storePattern(pattern: Omit<LearningPattern, 'id' | 'created_at'>): Promise<boolean> {
    try {
        // Generate embedding for similarity matching
        const embedding = await generateEmbedding(pattern.query_pattern);

        const { error } = await supabase
            .from('learning_patterns')
            .insert({
                user_id: pattern.user_id,
                query_type: pattern.query_type,
                query_pattern: pattern.query_pattern,
                query_embedding: embedding,
                successful_approach: pattern.successful_approach,
                result_summary: pattern.result_summary,
                confidence: pattern.confidence,
                usage_count: 1,
                last_used: new Date().toISOString()
            });

        if (error) {
            console.error('[LearningStore] Error storing pattern:', error.message);
            return false;
        }

        console.log(`[LearningStore] Stored pattern: ${pattern.query_type} → ${pattern.successful_approach}`);
        return true;
    } catch (err) {
        console.error('[LearningStore] Exception storing pattern:', err);
        return false;
    }
}

/**
 * Find similar patterns from past learning
 */
export async function findSimilarPatterns(
    query: string,
    userId: string,
    threshold: number = 0.7,
    limit: number = 3
): Promise<LearningPattern[]> {
    try {
        const embedding = await generateEmbedding(query);

        // Use RPC for vector similarity search
        const { data, error } = await supabase.rpc('match_learning_patterns', {
            query_embedding: embedding,
            filter_user_id: userId,
            match_threshold: threshold,
            match_count: limit
        });

        if (error) {
            console.warn('[LearningStore] Pattern search error:', error.message);
            return [];
        }

        console.log(`[LearningStore] Found ${data?.length || 0} similar patterns`);
        return data || [];
    } catch (err) {
        console.error('[LearningStore] Exception finding patterns:', err);
        return [];
    }
}

/**
 * Update pattern usage when reused
 */
export async function incrementPatternUsage(patternId: string): Promise<void> {
    try {
        await supabase
            .from('learning_patterns')
            .update({
                usage_count: supabase.rpc('increment_count'),
                last_used: new Date().toISOString()
            })
            .eq('id', patternId);
    } catch (err) {
        console.error('[LearningStore] Error updating pattern usage:', err);
    }
}

// ============================================
// KNOWLEDGE STORAGE
// ============================================

/**
 * Store learned knowledge from search results or conversations
 */
export async function storeKnowledge(knowledge: Omit<LearnedKnowledge, 'id'>): Promise<boolean> {
    try {
        const embedding = await generateEmbedding(`${knowledge.topic}: ${knowledge.fact}`);

        const { error } = await supabase
            .from('learned_knowledge')
            .insert({
                user_id: knowledge.user_id,
                topic: knowledge.topic,
                fact: knowledge.fact,
                fact_embedding: embedding,
                source_type: knowledge.source_type,
                source_url: knowledge.source_url,
                confidence: knowledge.confidence,
                extracted_at: new Date().toISOString(),
                expires_at: knowledge.expires_at?.toISOString(),
                usage_count: 0
            });

        if (error) {
            console.error('[LearningStore] Error storing knowledge:', error.message);
            return false;
        }

        console.log(`[LearningStore] Stored knowledge: ${knowledge.topic}`);
        return true;
    } catch (err) {
        console.error('[LearningStore] Exception storing knowledge:', err);
        return false;
    }
}

/**
 * Search for relevant learned knowledge
 */
export async function searchKnowledge(
    query: string,
    userId?: string,
    threshold: number = 0.7,
    limit: number = 5
): Promise<LearnedKnowledge[]> {
    try {
        const embedding = await generateEmbedding(query);

        const { data, error } = await supabase.rpc('match_learned_knowledge', {
            query_embedding: embedding,
            filter_user_id: userId || null,
            match_threshold: threshold,
            match_count: limit
        });

        if (error) {
            console.warn('[LearningStore] Knowledge search error:', error.message);
            return [];
        }

        // Filter out expired knowledge
        const now = new Date();
        const validKnowledge = (data || []).filter((k: LearnedKnowledge) =>
            !k.expires_at || new Date(k.expires_at) > now
        );

        console.log(`[LearningStore] Found ${validKnowledge.length} relevant knowledge items`);
        return validKnowledge;
    } catch (err) {
        console.error('[LearningStore] Exception searching knowledge:', err);
        return [];
    }
}

/**
 * Increment knowledge usage and update confidence
 */
export async function incrementKnowledgeUsage(knowledgeId: string): Promise<void> {
    try {
        // Get current data
        const { data } = await supabase
            .from('learned_knowledge')
            .select('usage_count, confidence')
            .eq('id', knowledgeId)
            .single();

        if (data) {
            // Increase confidence slightly with each use (max 0.99)
            const newConfidence = Math.min(0.99, data.confidence + 0.02);

            await supabase
                .from('learned_knowledge')
                .update({
                    usage_count: data.usage_count + 1,
                    confidence: newConfidence
                })
                .eq('id', knowledgeId);
        }
    } catch (err) {
        console.error('[LearningStore] Error updating knowledge usage:', err);
    }
}

// ============================================
// DECISION HELPERS
// ============================================

/**
 * Determines the best approach for a query based on past learning
 */
export async function suggestApproach(
    query: string,
    userId: string
): Promise<{ approach: 'api' | 'search' | 'memory' | 'unknown'; confidence: number; reason: string }> {
    try {
        // First check learned knowledge
        const knowledge = await searchKnowledge(query, userId, 0.85, 1);
        if (knowledge.length > 0 && knowledge[0].confidence > 0.8) {
            return {
                approach: 'memory',
                confidence: knowledge[0].confidence,
                reason: `Found high-confidence knowledge: "${knowledge[0].topic}"`
            };
        }

        // Then check patterns
        const patterns = await findSimilarPatterns(query, userId, 0.75, 1);
        if (patterns.length > 0) {
            const pattern = patterns[0];
            return {
                approach: pattern.successful_approach,
                confidence: pattern.confidence,
                reason: `Similar query succeeded with ${pattern.successful_approach} (used ${pattern.usage_count} times)`
            };
        }

        return {
            approach: 'unknown',
            confidence: 0,
            reason: 'No matching patterns or knowledge found'
        };
    } catch (err) {
        console.error('[LearningStore] Error suggesting approach:', err);
        return { approach: 'unknown', confidence: 0, reason: 'Error occurred' };
    }
}

/**
 * Learn from a successful interaction
 */
export async function learnFromSuccess(
    userId: string,
    query: string,
    queryType: LearningPattern['query_type'],
    approach: LearningPattern['successful_approach'],
    resultSummary: string,
    extractedFacts?: Array<{ topic: string; fact: string; sourceUrl?: string; expiresIn?: number }>
): Promise<void> {
    try {
        // Store the pattern
        await storePattern({
            user_id: userId,
            query_type: queryType,
            query_pattern: query,
            successful_approach: approach,
            result_summary: resultSummary,
            confidence: 0.8,
            usage_count: 1,
            last_used: new Date()
        });

        // Store any extracted facts as knowledge
        if (extractedFacts && extractedFacts.length > 0) {
            for (const fact of extractedFacts) {
                await storeKnowledge({
                    user_id: userId,
                    topic: fact.topic,
                    fact: fact.fact,
                    source_type: approach === 'api' ? 'api' : 'search',
                    source_url: fact.sourceUrl,
                    confidence: 0.85,
                    extracted_at: new Date(),
                    expires_at: fact.expiresIn ? new Date(Date.now() + fact.expiresIn * 1000) : undefined,
                    usage_count: 0
                });
            }
        }

        console.log(`[LearningStore] Learned from success: ${queryType} query using ${approach}`);
    } catch (err) {
        console.error('[LearningStore] Error learning from success:', err);
    }
}
