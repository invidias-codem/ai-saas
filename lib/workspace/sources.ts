// lib/workspace/sources.ts
// Direct database access for workspace source retrieval.
// Used by internal tooling; bypasses the HTTP route layer.

import { supabaseAdmin } from "@/lib/supabaseClient";
import { generateEmbedding } from "@/lib/ai/embeddings";

export interface LineageNode {
  node_id: string;
  content: string;
  node_type: string;
  relationship: string;
  confidence: number;
}

export interface WorkspaceSourceResult {
  id: string;
  source_type: string;
  title?: string;
  origin_uri?: string;
  content: string;
  metadata?: Record<string, any>;
  similarity?: number;
  created_at?: string;
  lineage?: LineageNode[];
}

export interface QueryWorkspaceSourcesParams {
  workspaceId: string;
  userId: string;
  query: string;
  matchCount?: number;
  matchThreshold?: number;
}

/**
 * Queries workspace sources with lineage-enriched results.
 * Uses match_workspace_sources_with_lineage_json RPC to return
 * chunks + connected knowledge_edges + knowledge_nodes.
 *
 * The LLM should treat `content` as the primary citation text
 * and `lineage` as optional metadata for explaining state transitions.
 */
export async function queryWorkspaceSources(
  params: QueryWorkspaceSourcesParams
): Promise<WorkspaceSourceResult[]> {
  const {
    workspaceId,
    userId,
    query,
    matchCount = 5, // Strict limit to protect token window
    matchThreshold = 0.7,
  } = params;

  if (!supabaseAdmin) return [];

  // Access check: ensure the user owns or belongs to this workspace.
  const { data: workspaceData, error: workspaceError } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (workspaceError || !workspaceData) {
    return [];
  }

  const queryEmbedding = await generateEmbedding(query, userId);

  // Use the lineage-enriched RPC
  const { data: lineageJson, error } = await supabaseAdmin.rpc(
    "match_workspace_sources_with_lineage_json",
    {
      query_embedding: queryEmbedding,
      target_workspace_id: workspaceId,
      match_threshold: matchThreshold,
      match_count: matchCount,
    }
  );

  if (error) {
    console.error("[WorkspaceSources] lineage RPC error:", error);
    // Fallback to standard vector search if lineage RPC fails
    return fallbackToStandardSearch(queryEmbedding, workspaceId, matchCount, matchThreshold);
  }

  if (!lineageJson || !Array.isArray(lineageJson)) {
    return [];
  }

  // Flatten the nested JSON structure into WorkspaceSourceResult[]
  // This ensures SudoLang doesn't need to navigate complex JSON during inference
  const results: WorkspaceSourceResult[] = lineageJson.map((entry: any) => {
    const lineage: LineageNode[] = (entry.knowledge_nodes || []).map((node: any) => ({
      node_id: node.node_id,
      content: node.content,
      node_type: node.node_type,
      relationship: node.relationship,
      confidence: node.confidence ?? 0.5,
    }));

    return {
      id: entry.source_id,
      source_type: "url", // Derived from workspace_sources
      title: entry.source_title,
      origin_uri: entry.source_origin_uri,
      content: entry.source_content,
      similarity: entry.similarity,
      created_at: entry.source_valid_from,
      lineage: lineage.length > 0 ? lineage : undefined,
    };
  });

  return results;
}

/**
 * Fallback to standard match_workspace_sources RPC if lineage fails.
 * Ensures backward compatibility.
 */
async function fallbackToStandardSearch(
  queryEmbedding: number[],
  workspaceId: string,
  matchCount: number,
  matchThreshold: number
): Promise<WorkspaceSourceResult[]> {
  if (!supabaseAdmin) return [];

  const rpcResult = supabaseAdmin.rpc("match_workspace_sources", {
    query_embedding: queryEmbedding,
    target_workspace_id: workspaceId,
    match_threshold: matchThreshold,
    match_count: matchCount,
    filter_source_types: null,
  }) as any;

  const data = rpcResult.data;
  const error = rpcResult.error;

  if (error) {
    console.error("[WorkspaceSources] Fallback RPC error:", error);
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
    lineage: undefined, // No lineage in fallback mode
  }));
}
