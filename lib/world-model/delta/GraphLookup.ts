import { ExtractedClaim, ClaimVerdict } from "./types";
import { generateEmbedding } from "@/lib/memory/embedding";
import { supabase } from "@/lib/supabaseClient";

/**
 * GraphLookup — event-sourced read path.
 *
 * All claim verification now queries the event-sourced projections
 * (wm_nodes_view / wm_edges_view) and the get_causal_chain RPC, NOT the
 * legacy knowledge_nodes / knowledge_edges tables. The legacy tables are
 * retired to vector-search targets only.
 */

/** Row shape returned by wm_nodes_view semantic match (via match_wm_nodes). */
interface MatchedNode {
  id: string;
  name: string;
  type: string;
  description?: string;
  similarity: number;
  trust_tier?: string;
  valid_until?: string | null;
}

export class GraphLookup {
  async lookupClaim(claim: ExtractedClaim): Promise<{
    verdict: ClaimVerdict;
    graphEdgeId?: string;
    contradictsNodeId?: string;
    confidence: number;
    explanation: string;
  }> {
    try {
      const claimEmbedding = claim.embedding ?? await generateEmbedding(claim.text);
      if (!claimEmbedding || claimEmbedding.length === 0) {
        return {
          verdict: 'UNVERIFIED',
          confidence: 0,
          explanation: "Could not generate embedding for claim.",
        };
      }

      // Semantic search against the event-sourced node projection.
      // match_wm_nodes is the CQRS projection RPC (see 20260320 projections).
      const { data: matchedNodes, error } = await supabase.rpc('match_wm_nodes', {
        query_embedding: claimEmbedding,
        match_threshold: 0.4,
        match_count: 5,
        // Delta audit is system-level; pass null user id (projection handles it).
        p_user_id: null,
      }) as { data: MatchedNode[] | null; error: { message?: string } | null };

      if (error) {
        console.error('[GraphLookup] match_wm_nodes RPC error:', error);
        return { verdict: 'UNVERIFIED', confidence: 0, explanation: "Graph lookup error." };
      }

      if (!matchedNodes || matchedNodes.length === 0) {
        return {
          verdict: 'UNVERIFIED',
          confidence: 0,
          explanation: "No relevant knowledge found in the graph.",
        };
      }

      const best = matchedNodes[0];
      const similarity = best.similarity ?? 0;

      // OUTDATED check against the event-sourced projection's temporal validity
      if (similarity > 0.75 && best.valid_until && new Date(best.valid_until) < new Date()) {
        return {
          verdict: 'OUTDATED',
          confidence: similarity,
          explanation: `Claim matched a knowledge node that expired on ${best.valid_until}.`,
        };
      }

      // Detect contradictions via the event-sourced edge projection.
      const { data: edges } = await supabase
        .from('wm_edges_view')
        .select('id, source_node_id, target_node_id, relation, relationship_type, causal_strength, confidence, valid_until')
        .or(`source_node_id.eq.${best.id},target_node_id.eq.${best.id}`)
        .limit(10) as { data: any[] | null; error: { message?: string } | null };

      const contradictingEdge = (edges ?? []).find(
        (e) => e.relationship_type === 'CONTRADICTS'
      );

      if (similarity > 0.92) {
        if (contradictingEdge) {
          return {
            verdict: 'CONTRADICTED',
            graphEdgeId: contradictingEdge.id,
            contradictsNodeId: contradictingEdge.target_node_id,
            confidence: similarity,
            explanation: `Claim directly contradicts a known graph relationship (edge ${contradictingEdge.id}).`,
          };
        }
        return {
          verdict: 'CONFIRMED',
          confidence: similarity,
          explanation: `Matches known fact with high confidence (${(similarity * 100).toFixed(1)}%).`,
        };
      }

      if (similarity > 0.75) {
        return {
          verdict: 'SUPPORTED',
          confidence: similarity,
          explanation: `Consistent with known facts, not exact match (${(similarity * 100).toFixed(1)}%).`,
        };
      }

      return {
        verdict: 'UNVERIFIED',
        confidence: similarity,
        explanation: `Low similarity to existing knowledge (${(similarity * 100).toFixed(1)}%).`,
      };

    } catch (err) {
      console.error('[GraphLookup] lookupClaim error:', err);
      return {
        verdict: 'UNVERIFIED',
        confidence: 0,
        explanation: "Unexpected error during graph lookup.",
      };
    }
  }

  /**
   * Offload causal traversal to Postgres. Delegates to the get_causal_chain
   * RPC rather than doing in-memory BFS — the DB owns cycle-pruning now.
   */
  async getCausalChain(rootNodeId: string, maxDepth = 3, minCausalStrength = 0.0): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_causal_chain', {
      p_root_node_id: rootNodeId,
      p_max_depth: maxDepth,
      p_min_causal_strength: minCausalStrength,
    });
    if (error) {
      console.error('[GraphLookup] get_causal_chain RPC error:', error);
      return [];
    }
    return data ?? [];
  }
}

export const graphLookup = new GraphLookup();