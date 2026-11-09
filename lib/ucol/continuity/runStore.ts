/**
 * Read-only, owner-scoped run repository for the gated continuity shell.
 * A future Trigger.dev worker owns creation, checkpoint writes and finalization
 * in ONE transaction with the append-only event. Do not claim durable
 * execution until that worker and the replay protocol are qualified.
 */
import { supabaseAdmin } from '@/lib/supabaseClient';

export interface ConversationRunListItem {
  id: string;
  conversation_id: string;
  workspace_id: string | null;
  status: string;
  phase: string;
  engine: string;
  control_generation: number;
  last_event_sequence: number;
  result_ref: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function listOwnerConversationRuns(
  conversationId: string,
  userId: string,
): Promise<ConversationRunListItem[] | null> {
  if (!supabaseAdmin) throw new Error('continuity_store_unavailable');
  if (!conversationId || !userId) throw new Error('missing_owner_scope');

  // Never read by conversation ID alone with service_role.
  const { data: conversation, error: ownershipError } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownershipError) throw new Error('continuity_owner_lookup_failed');
  if (!conversation) return null;

  const { data, error } = await supabaseAdmin
    .from('conversation_runs')
    .select('id,conversation_id,workspace_id,status,phase,engine,control_generation,last_event_sequence,result_ref,error_code,created_at,updated_at,started_at,completed_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error('continuity_run_lookup_failed');
  return (data ?? []) as ConversationRunListItem[];
}
