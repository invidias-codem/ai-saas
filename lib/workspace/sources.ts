// lib/workspace/sources.ts
// Direct database access for workspace source retrieval.
// Used by internal tooling; bypasses the HTTP route layer.

import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbedding } from '@/lib/ai/embeddings';

export interface WorkspaceSourceResult {
  id: string;
  source_type: string;
  title?: string;
  origin_uri?: string;
  content: string;
  metadata?: Record<string, any>;
  similarity?: number;
  created_at?: string;
}

export async function queryWorkspaceSources(params: {
  workspaceId: string;
  userId: string;
  query: string;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<WorkspaceSourceResult[]> {
  const { workspaceId, userId, query, matchCount = 12, matchThreshold = 0.7 } = params;

  if (!supabaseAdmin) return [];

  // Access check: ensure the user owns or belongs to this workspace.
  const { data: workspaceData, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (workspaceError || !workspaceData) {
    return [];
  }

  const queryEmbedding = await generateEmbedding(query, userId);

  const rpcResult = supabaseAdmin.rpc('match_workspace_sources', {
    query_embedding: queryEmbedding,
    target_workspace_id: workspaceId,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_source_types: null,
  }) as any;

  const data = rpcResult.data;
  const error = rpcResult.error;

  if (error) {
    console.error('[WorkspaceSources] RPC error:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    source_type: row.source_type,
    title: row.title,
    origin_uri: row.origin_uri,
    content: row.content,
    metadata: row.metadata,
    similarity: row.similarity,
    created_at: row.created_at,
  }));
}
