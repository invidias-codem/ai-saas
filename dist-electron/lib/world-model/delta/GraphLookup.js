"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphLookup = exports.GraphLookup = void 0;
const embedding_1 = require("@/lib/memory/embedding");
const supabaseClient_1 = require("@/lib/supabaseClient");
class GraphLookup {
    async lookupClaim(claim) {
        try {
            // Generate embedding for the claim text if not already present
            const claimEmbedding = claim.embedding ?? await (0, embedding_1.generateEmbedding)(claim.text);
            if (!claimEmbedding || claimEmbedding.length === 0) {
                return {
                    verdict: 'UNVERIFIED',
                    confidence: 0,
                    explanation: "Could not generate embedding for claim.",
                };
            }
            // Semantic search against the knowledge graph via match_nodes RPC
            const { data: matchedNodes, error } = await supabaseClient_1.supabase.rpc('match_nodes', {
                query_embedding: claimEmbedding,
                match_threshold: 0.4, // low threshold — we triage via similarity score below
                match_count: 5,
                // match_nodes may require p_user_id; pass null for system-level delta audit
                p_user_id: null,
            });
            if (error) {
                console.error('[GraphLookup] match_nodes RPC error:', error);
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
            // Check if the best-matching node has expired (OUTDATED)
            if (similarity > 0.75 && best.valid_until && new Date(best.valid_until) < new Date()) {
                return {
                    verdict: 'OUTDATED',
                    confidence: similarity,
                    explanation: `Claim matched a knowledge node that expired on ${best.valid_until}.`,
                };
            }
            // Now look up edges from this node to detect CONTRADICTS relationships
            const { data: edges } = await supabaseClient_1.supabase
                .from('graph_edges')
                .select('id, source_node_id, target_node_id, relation, relationship_type, weight, valid_until')
                .or(`source_node_id.eq.${best.id},target_node_id.eq.${best.id}`)
                .limit(10);
            const contradictingEdge = (edges ?? []).find((e) => e.relationship_type === 'CONTRADICTS');
            // Verdict scoring
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
        }
        catch (err) {
            console.error('[GraphLookup] lookupClaim error:', err);
            return {
                verdict: 'UNVERIFIED',
                confidence: 0,
                explanation: "Unexpected error during graph lookup.",
            };
        }
    }
}
exports.GraphLookup = GraphLookup;
exports.graphLookup = new GraphLookup();
