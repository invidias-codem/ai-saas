/**
 * Memory Promotion Logic
 * 
 * Handles promoting high-confidence facts from conversation scope to user scope.
 * This enables Genie to learn lasting personality traits and personal info.
 */

import { supabase } from '@/lib/supabaseClient';

export interface PromotableMemory {
    id: string;
    content: string;
    type: string;
    confidence: number;
    scope: 'conversation' | 'user';
    source_conversation_id: string;
}

// Patterns that indicate personal/lasting information
const PERSONAL_INFO_PATTERNS = [
    /my name is\s+(\w+)/i,
    /i('m| am)\s+(a|an)\s+(\w+)/i,  // "I'm a developer"
    /i work (at|for|as)\s+/i,
    /i live in\s+/i,
    /my (favorite|preferred|go-to)/i,
    /i (always|usually|typically|often)\s+/i,
    /i('ve| have) been\s+/i,
    /call me\s+(\w+)/i,
];

// Types that should always be promoted
const PROMOTABLE_TYPES = ['personal_info', 'preference', 'user_fact'];

/**
 * Check if a memory should be promoted to user scope
 */
export function shouldPromoteMemory(memory: PromotableMemory): boolean {
    // Already user-scoped
    if (memory.scope === 'user') return false;

    // High confidence threshold for auto-promotion
    if (memory.confidence < 0.85) return false;

    // Check if type is promotable
    if (PROMOTABLE_TYPES.includes(memory.type)) return true;

    // Check content patterns
    for (const pattern of PERSONAL_INFO_PATTERNS) {
        if (pattern.test(memory.content)) return true;
    }

    return false;
}

/**
 * Promote a memory from conversation scope to user scope
 */
export async function promoteToUserScope(
    userId: string,
    memoryId: string
): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('memory_bank')
            .update({
                scope: 'user',
                promoted_at: new Date().toISOString(),
                metadata: supabase.rpc('jsonb_set', {
                    target: 'metadata',
                    path: '{promotedFrom}',
                    new_value: '"conversation"'
                })
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
        // Get all conversation-scoped memories from this chat
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
export function formatUserProfileForPrompt(memories: PromotableMemory[]): string {
    if (memories.length === 0) return '';

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
            .order('created_at', { ascending: false })
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
