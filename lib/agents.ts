import { supabase } from '@/lib/supabaseClient';

export interface PublicAgent {
    id: string;
    name: string;
    description: string;
    creator_name: string;
    usage_count: number;
    capabilities: string[];
    avatar_url?: string;
}

/**
 * Fetches a public agent by ID with strict data filtering.
 * SECURITY: Prevents leaking system_prompt and api_keys.
 */
export async function getPublicAgent(id: string): Promise<PublicAgent | null> {
    // Validate ID format (assuming UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !uuidRegex.test(id)) {
        console.error(`[AgentSecurity] Invalid agent ID format: ${id}`);
        return null;
    }

    const { data, error } = await supabase
        .from('agents')
        .select('id, name, description, usage_count, user_id, avatar_url, capabilities')
        .eq('id', id)
        .single();

    if (error || !data) {
        console.error(`[AgentSecurity] Failed to fetch public agent ${id}:`, error?.message);
        return null;
    }

    // TODO: Implement actual creator name lookup from profiles table
    // For now, return a generic name to avoid exposing user_id
    const creatorName = 'Community Creator';

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        creator_name: creatorName,
        usage_count: data.usage_count || 0,
        capabilities: data.capabilities || [],
        avatar_url: data.avatar_url
    };
}

/**
 * Fetches top agents for Sitemap generation
 */
export async function getTopPublicAgents(limit = 100) {
    const { data } = await supabase
        .from('agents')
        .select('id, updated_at')
        .order('usage_count', { ascending: false })
        .limit(limit);

    return data || [];
}
