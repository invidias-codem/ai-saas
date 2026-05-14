/**
 * Memory Promotion Logic
 *
 * Handles promoting high-confidence facts from conversation scope to user scope.
 * This enables Genie to learn lasting personality traits and personal info.
 */

import { supabase } from '@/lib/supabaseClient';

export type MemoryScope = 'conversation' | 'user' | 'workspace';
export type ExtractedFactType = 'skill' | 'preference' | 'goal' | 'personal' | 'project' | 'tool';

export interface PromotableMemory {
    id: string;
    content: string;
    type: string;
    confidence: number;
    scope: MemoryScope;
    source_conversation_id: string;
    metadata?: Record<string, any> | null;
}

const PERSONAL_INFO_PATTERNS = [
    /my name is\s+(\w+)/i,
    /i('m| am)\s+(a|an)\s+(\w+)/i,
    /i work (at|for|as)\s+/i,
    /i live in\s+/i,
    /my (favorite|preferred|go-to)/i,
    /i (always|usually|typically|often)\s+/i,
    /i('ve| have) been\s+/i,
    /call me\s+(\w+)/i,
];

const USER_PROMOTABLE_FACT_TYPES: ExtractedFactType[] = ['personal', 'preference'];
const USER_REVIEWABLE_FACT_TYPES: ExtractedFactType[] = ['skill', 'goal'];

function normalizeMemoryMetadata(metadata: Record<string, any> | null | undefined) {
    return metadata && typeof metadata === 'object' ? metadata : {};
}

function isExtractedFactType(type: string): type is ExtractedFactType {
    return ['skill', 'preference', 'goal', 'personal', 'project', 'tool'].includes(type);
}

function isDurableUserMemoryType(type: string): boolean {
    if (isExtractedFactType(type)) {
        return USER_PROMOTABLE_FACT_TYPES.includes(type) || USER_REVIEWABLE_FACT_TYPES.includes(type);
    }

    return ['personal_info', 'preference', 'user_fact'].includes(type);
}

function isWorkspaceCandidateType(type: string): boolean {
    return type === 'project' || type === 'tool';
}

/**
 * Check if a memory should be promoted to user scope
 */
export function shouldPromoteMemory(memory: PromotableMemory): boolean {
    if (memory.scope === 'user' || memory.scope === 'workspace') return false;
    if (memory.confidence < 0.9) return false;

    const metadata = normalizeMemoryMetadata(memory.metadata);
    if (metadata.scopeLocked === true) return false;
    if (metadata.allowUserPromotion === false) return false;
    if (metadata.scopeHint === 'workspace') return false;

    if (isExtractedFactType(memory.type)) {
        if (USER_PROMOTABLE_FACT_TYPES.includes(memory.type)) return true;
        if (USER_REVIEWABLE_FACT_TYPES.includes(memory.type)) {
            return PERSONAL_INFO_PATTERNS.some((pattern) => pattern.test(memory.content));
        }
        return false;
    }

    if (isDurableUserMemoryType(memory.type)) return true;

    for (const pattern of PERSONAL_INFO_PATTERNS) {
        if (pattern.test(memory.content)) return true;
    }

    return false;
}

export function determineMemoryScopeForFact(args: {
    type: ExtractedFactType;
    confidence: number;
    workspaceId?: string | null;
}): MemoryScope {
    const { type, confidence, workspaceId } = args;

    if (type === 'personal' && confidence >= 0.9) return 'user';
    if (type === 'preference' && confidence >= 0.9) return 'user';

    if (workspaceId && isWorkspaceCandidateType(type) && confidence >= 0.85) {
        return 'workspace';
    }

    return 'conversation';
}

/**
 * Promote a memory from conversation scope to user scope
 */
export async function promoteToUserScope(
    userId: string,
    memoryId: string
): Promise<boolean> {
    try {
        const { data: memory, error: fetchError } = await supabase
            .from('memory_bank')
            .select('metadata')
            .eq('id', memoryId)
            .eq('user_id', userId)
            .single();

        if (fetchError) {
            console.error('[MemoryPromotion] Error fetching memory before promotion:', fetchError);
            return false;
        }

        const existingMetadata = normalizeMemoryMetadata(memory?.metadata);
        const { error } = await supabase
            .from('memory_bank')
            .update({
                scope: 'user',
                promoted_at: new Date().toISOString(),
                metadata: {
                    ...existingMetadata,
                    promotedFrom: 'conversation',
                    promotedTo: 'user',
                    promotionSource: 'memoryPromotion',
                }
            })
            .eq('id', memoryId)
            .eq('user_id', userId);

        if (error) {
            console.error('[MemoryPromotion] Error promoting memory:', error);
            return false;
        }

        console.log(`[MemoryPromotion] Promoted memory ${memoryId} to user scope`);
        return true;
    } catch (err) {
        console.error('[MemoryPromotion] Exception:', err);
        return false;
    }
}

/**
 * Process all memories from a conversation and promote eligible ones
 */
export async function processConversationForPromotion(
    userId: string,
    conversationId: string
): Promise<{ promoted: number; checked: number }> {
    try {
        const { data: memories, error } = await supabase
            .from('memory_bank')
            .select('*')
            .eq('user_id', userId)
            .eq('source_conversation_id', conversationId)
            .eq('scope', 'conversation');

        if (error || !memories) {
            console.error('[MemoryPromotion] Error fetching memories:', error);
            return { promoted: 0, checked: 0 };
        }

        let promoted = 0;
        for (const memory of memories) {
            if (shouldPromoteMemory(memory)) {
                const success = await promoteToUserScope(userId, memory.id);
                if (success) promoted++;
            }
        }

        console.log(`[MemoryPromotion] Processed ${memories.length} memories, promoted ${promoted}`);
        return { promoted, checked: memories.length };
    } catch (err) {
        console.error('[MemoryPromotion] Exception processing conversation:', err);
        return { promoted: 0, checked: 0 };
    }
}

/**
 * Get user profile memories (user-scoped facts that persist across chats)
 */
export async function getUserProfile(userId: string): Promise<PromotableMemory[]> {
    try {
        const { data, error } = await supabase
            .from('memory_bank')
            .select('*')
            .eq('user_id', userId)
            .eq('scope', 'user')
            .order('confidence', { ascending: false })
            .limit(20);

        if (error) {
            console.error('[MemoryPromotion] Error fetching user profile:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[MemoryPromotion] Exception:', err);
        return [];
    }
}

/**
 * Format user profile for prompt injection
 */
export function formatUserProfileForPrompt(memories: PromotableMemory[] | null): string {
    if (!memories || memories.length === 0) return '';

    let result = '\n## About This User (Personality Profile)\n';
    result += 'The following facts have been learned from past conversations:\n\n';

    for (const mem of memories) {
        const confidence = Math.round(mem.confidence * 100);
        result += `- ${mem.content} (${confidence}% confident)\n`;
    }

    result += '\nUse this context to personalize your responses.\n';
    return result;
}

/**
 * Get conversation-specific memories (isolated to one chat)
 */
export async function getConversationMemories(
    userId: string,
    conversationId: string
): Promise<PromotableMemory[]> {
    try {
        const { data, error } = await supabase
            .from('memory_bank')
            .select('*')
            .eq('user_id', userId)
            .eq('source_conversation_id', conversationId)
            .eq('scope', 'conversation')
            .order('updated_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('[MemoryPromotion] Error fetching conversation memories:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[MemoryPromotion] Exception:', err);
        return [];
    }
}
