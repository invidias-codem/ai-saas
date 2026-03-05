import { ExtractedClaim, ClaimVerdict } from "./types";
import { generateEmbedding } from "@/lib/memory/embedding";
import { searchGraph } from "@/lib/memory/graphStore";

export class GraphLookup {
  async lookupClaim(claim: ExtractedClaim): Promise<{
    verdict: ClaimVerdict;
    graphEdgeId?: string;
    contradictsNodeId?: string;
    confidence: number;
    explanation: string;
  }> {
    try {
      // Generate embedding for the claim text if not already present
      const claimEmbedding = claim.embedding || await generateEmbedding(claim.text);
      if (!claimEmbedding) {
        return {
          verdict: 'UNVERIFIED',
          confidence: 0,
          explanation: "Could not generate embedding for claim."
        };
      }

      // Search for semantically similar nodes/edges in the graph
      // Using a threshold of 0.75 to find potential matches
      const matches = await searchGraph(claimEmbedding, 0.75, 5);

      if (!matches || matches.length === 0) {
        return {
          verdict: 'UNVERIFIED',
          confidence: 0,
          explanation: "No relevant knowledge found in the graph."
        };
      }

      // Analyze the best match
      const bestMatch = matches[0];
      const similarity = bestMatch.similarity;
      const edge = bestMatch.edge; // Assuming searchGraph returns edges or nodes with context
      
      // Determine verdict based on similarity and edge type
      if (similarity > 0.92) {
        if (edge.relationship_type === 'CONTRADICTS') {
          return {
            verdict: 'CONTRADICTED',
            contradictsNodeId: edge.target_id,
            confidence: similarity,
            explanation: `Directly contradicts known fact: ${edge.source_content} CONTRADICTS ${edge.target_content}`
          };
        }
        
        if (edge.valid_until && new Date(edge.valid_until) < new Date()) {
           return {
             verdict: 'OUTDATED',
             graphEdgeId: edge.id,
             confidence: similarity,
             explanation: "This fact was true but is no longer valid."
           };
        }

        return {
          verdict: 'CONFIRMED',
          graphEdgeId: edge.id,
          confidence: similarity,
          explanation: `Matches known fact with high confidence (${(similarity * 100).toFixed(1)}%)`
        };
      } else if (similarity > 0.75) {
        return {
          verdict: 'SUPPORTED',
          graphEdgeId: edge.id,
          confidence: similarity,
          explanation: `Consistent with known facts, though not an exact match (${(similarity * 100).toFixed(1)}%)`
        };
      } else {
        return {
           verdict: 'UNVERIFIED',
           confidence: similarity,
           explanation: "Low similarity to existing knowledge."
        };
      }

    } catch (error) {
      console.error("Error looking up claim in graph:", error);
      return {
        verdict: 'UNVERIFIED',
        confidence: 0,
        explanation: "Error accessing knowledge graph."
      };
    }
  }
}

export const graphLookup = new GraphLookup();
