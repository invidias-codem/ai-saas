// lib/workspace/delta-detection.ts
// Delta detection pipeline for Data Refinery.
// Compares incoming chunks against active workspace_sources to detect semantic drift.

import { supabaseAdmin } from "@/lib/supabaseClient";
import { generateEmbedding } from "@/lib/ai/embeddings";

export type DeltaVerdict = "NEW" | "UNCHANGED" | "UPDATED";

export interface DeltaResult {
  verdict: DeltaVerdict;
  originUri: string;
  avgSimilarity: number | null;
}

export interface CausalEdgeResult {
  edgeId: string | null;
  eventId: string | null;
}

/**
 * Detects whether incoming content has drifted from currently active content
 * for a given workspace + origin_uri.
 *
 * Uses chunk-by-chunk best-match comparison:
 * For each new chunk, find the most similar active chunk.
 * Average the best-match similarities to get overall drift score.
 */
export async function detectDelta(
  workspaceId: string,
  originUri: string,
  newChunks: { content: string; embedding: number[] | null }[]
): Promise<DeltaResult> {
  if (!supabaseAdmin) {
    return { verdict: "NEW", originUri, avgSimilarity: null };
  }

  // Filter out chunks without embeddings
  const chunksWithEmbeddings = newChunks.filter(
    (c): c is { content: string; embedding: number[] } => c.embedding !== null
  );

  if (chunksWithEmbeddings.length === 0) {
    // Can't compare without embeddings — treat as new
    return { verdict: "NEW", originUri, avgSimilarity: null };
  }

  try {
    const embeddings = chunksWithEmbeddings.map((c) => c.embedding);

    const { data, error } = await supabaseAdmin.rpc("detect_workspace_source_delta", {
      new_embeddings: embeddings,
      target_workspace_id: workspaceId,
      target_origin_uri: originUri,
      similarity_threshold: 0.98,
    });

    if (error) {
      console.error("[DeltaDetection] RPC error:", error);
      return { verdict: "NEW", originUri, avgSimilarity: null };
    }

    return {
      verdict: data as DeltaVerdict,
      originUri,
      avgSimilarity: null, // Could be extended to return from RPC
    };
  } catch (err) {
    console.error("[DeltaDetection] Unexpected error:", err);
    return { verdict: "NEW", originUri, avgSimilarity: null };
  }
}

/**
 * Supersedes old content and creates causal edges + event log entries.
 * Called when delta detection returns UPDATED.
 */
export async function supersedeAndCreateCausalLinks(
  workspaceId: string,
  originUri: string,
  newSourceIds: string[]
): Promise<CausalEdgeResult> {
  if (!supabaseAdmin) {
    return { edgeId: null, eventId: null };
  }

  try {
    // 1. Close out old rows
    const { data: closedCount, error: supersedeError } = await supabaseAdmin.rpc(
      "supersede_workspace_source",
      {
        target_workspace_id: workspaceId,
        target_origin_uri: originUri,
        superseded_at: new Date().toISOString(),
      }
    );

    if (supersedeError) {
      console.error("[DeltaDetection] Supersede failed:", supersedeError);
    }

    // 2. Get the old (now closed) source IDs for causal edge creation
    const { data: oldSources } = await supabaseAdmin
      .from("workspace_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("origin_uri", originUri)
      .not("valid_until", "is", null)
      .order("valid_until", { ascending: false })
      .limit(10);

    let edgeId: string | null = null;
    let eventId: string | null = null;

    if (oldSources && oldSources.length > 0 && newSourceIds.length > 0) {
      // 3. Create causal edge: old sources SUPERSEDES new sources
      // We create edges from each old source to each new source
      const edgeRecords = oldSources.flatMap((old) =>
        newSourceIds.map((newId) => ({
          source_node_id: old.id,
          target_node_id: newId,
          relationship_type: "SUPERSEDES",
          confidence: 1.0,
          causal_strength: 1.0,
          valid_from: new Date().toISOString(),
        }))
      );

      // Insert into knowledge_edges (using workspace_sources IDs as nodes)
      const { data: insertedEdges } = await supabaseAdmin
        .from("knowledge_edges")
        .insert(edgeRecords)
        .select("id");

      if (insertedEdges && insertedEdges.length > 0) {
        edgeId = insertedEdges[0].id;
      }

      // 4. Append to wm_events event log
      const { data: insertedEvent } = await supabaseAdmin
        .from("wm_events")
        .insert({
          entity_id: oldSources[0].id,
          event_type: "OBSOLETED",
          payload: {
            reason: "semantic_drift",
            superseded_by_count: newSourceIds.length,
            closed_count: closedCount ?? oldSources.length,
            workspace_id: workspaceId,
            origin_uri: originUri,
          },
          trust_tier: "CONFIRMED",
          source_model: "delta-engine",
        })
        .select("id");

      if (insertedEvent && insertedEvent.length > 0) {
        eventId = insertedEvent[0].id;
      }
    }

    return { edgeId, eventId };
  } catch (err) {
    console.error("[DeltaDetection] Supersede pipeline failed:", err);
    return { edgeId: null, eventId: null };
  }
}
