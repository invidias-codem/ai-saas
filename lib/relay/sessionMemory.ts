import { supabase } from '@/lib/supabaseClient';
import type { RelaySession } from './types';

/**
 * Records a completed Relay session (trajectory) into episodic memory.
 */
export async function recordSession(session: RelaySession): Promise<string | null> {
    const { data, error } = await supabase
        .from('relay_sessions')
        .insert({
            user_id: session.userId,
            device_id: session.deviceId,
            task_description: session.taskDescription,
            response_summary: session.responseSummary,
            raw_trajectory: session.rawTrajectory,
            reward_score: session.rewardScore || 0.0
        })
        .select('id')
        .single();

    if (error) {
        console.error('[SessionMemory] Failed to record session:', error);
        return null;
    }

    return data?.id || null;
}

/**
 * Retrieves past session summaries relevant to the current task using Full Text Search.
 * Returns ONLY the compressed summaries to prevent context window bloat.
 */
export async function recallRelevantSessions(userId: string, taskDescription: string, limit: number = 3): Promise<string[]> {
    // We convert the task description to a websearch query format for FTS
    // A more sophisticated approach would extract keywords, but this works for basic matching
    const query = taskDescription.trim().split(/\s+/).join(' | ');

    const { data, error } = await supabase
        .from('relay_sessions')
        .select('response_summary')
        .eq('user_id', userId)
        .textSearch('fts', query)
        .order('reward_score', { ascending: false }) // Prioritize highly successful past sessions
        .limit(limit);

    if (error) {
        console.error('[SessionMemory] FTS recall failed:', error);
        return [];
    }

    return data?.map(row => row.response_summary) || [];
}
