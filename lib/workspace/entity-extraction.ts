// lib/workspace/entity-extraction.ts
// Entity & claim extraction pass for Data Refinery.
// Distills raw text chunks into atomic knowledge_nodes with Zod-enforced schema.

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { generateEmbedding } from "@/lib/ai/embeddings";

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const ExtractedEntitySchema = z.object({
  entity_name: z.string().min(1).max(500),
  entity_type: z.enum(["person", "organization", "product", "concept", "event", "claim", "metric", "document"]),
  attribute: z.string().min(1).max(500),
  value: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1).default(0.8),
  valid_from: z.string().datetime().optional(),
});

const ExtractionResultSchema = z.object({
  entities: z.array(ExtractedEntitySchema).max(20),
  causal_relationships: z.array(z.object({
    source_entity: z.string().min(1),
    target_entity: z.string().min(1),
    relationship_type: z.enum(["CAUSES", "DERIVED_FROM", "CONTRADICTS", "SUPPORTS"]),
    reasoning: z.string().max(500),
  })).max(10),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ─── Gemini Flash Extraction ─────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a knowledge graph extraction engine. Given raw text, distill it into atomic facts as structured JSON.

## Rules
- Extract MAX 20 entities. Be selective — only include concrete, verifiable facts.
- Each entity must have: entity_name, entity_type, attribute, value.
- entity_type must be one of: person, organization, product, concept, event, claim, metric, document
- attribute describes the property being stated (e.g., "pricing", "founding_date", "CEO", "API_limit")
- value is the specific fact (e.g., "$49/month", "2023-01-15", "Jane Doe")
- Include temporal context in valid_from if the text mentions a specific date/time.
- Extract MAX 10 causal relationships between entities (CAUSES, DERIVED_FROM, CONTRADICTS, SUPPORTS).
- confidence: how certain you are in the extraction (0.0-1.0). Default 0.8.

## Output Format
Return a single JSON object:
{
  "entities": [
    {
      "entity_name": "Stripe",
      "entity_type": "organization",
      "attribute": "transaction_fee",
      "value": "2.9% + 30¢",
      "confidence": 0.95,
      "valid_from": "2024-01-15T00:00:00Z"
    }
  ],
  "causal_relationships": [
    {
      "source_entity": "Stripe API limit change",
      "target_entity": "Feature Y deprecation",
      "relationship_type": "CAUSES",
      "reasoning": "The text states that due to new API limits, feature Y is being deprecated."
    }
  ]
}

Output ONLY valid JSON. No markdown fences, no explanation text.`;

export async function extractEntities(rawText: string): Promise<ExtractionResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: { role: "user", parts: [{ text: EXTRACTION_PROMPT }] },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: rawText.slice(0, 15000) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
  });

  const text = result.response?.text()?.trim();
  if (!text) return { entities: [], causal_relationships: [] };

  try {
    // Strip markdown fences if present
    let cleaned = text;
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    const parsed = JSON.parse(cleaned);
    const validated = ExtractionResultSchema.parse(parsed);
    return validated;
  } catch (err) {
    console.error("[EntityExtraction] Failed to parse extraction:", err);
    return { entities: [], causal_relationships: [] };
  }
}

// ─── Knowledge Graph Insertion ──────────────────────────────────────────────

export interface InsertExtractionParams {
  workspaceId: string;
  userId: string;
  sourceChunkId: string;
  sourceChunkContent: string;
  extraction: ExtractionResult;
  originUri?: string | null;
}

export interface InsertExtractionResult {
  nodeIds: string[];
  edgeIds: string[];
}

/**
 * Inserts extracted entities into knowledge_nodes and creates causal edges.
 * - DERIVED_FROM: Links each new node back to its parent workspace_sources chunk
 * - CAUSES/CONTRADICTS/SUPPORTS: Creates higher-order reasoning edges
 */
export async function insertExtractionWithEdges(
  params: InsertExtractionParams
): Promise<InsertExtractionResult> {
  const { workspaceId, userId, sourceChunkId, sourceChunkContent, extraction, originUri } = params;

  if (!supabaseAdmin) {
    return { nodeIds: [], edgeIds: [] };
  }

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];

  try {
    // 1. Insert entities as knowledge_nodes
    const nodeRows = await Promise.all(
      extraction.entities.map(async (entity) => {
        const embedding = await generateEmbedding(
          `${entity.entity_name} ${entity.attribute} ${entity.value}`,
          userId
        ).catch(() => null);

        return {
          user_id: userId,
          content: `${entity.entity_name} ${entity.attribute} ${entity.value}`,
          canonical_name: entity.entity_name.toLowerCase().trim(),
          node_type: entity.entity_type,
          aliases: [entity.entity_name],
          metadata: {
            attribute: entity.attribute,
            value: entity.value,
            workspace_id: workspaceId,
            origin_uri: originUri,
            source_chunk_id: sourceChunkId,
            extraction_confidence: entity.confidence,
            valid_from: entity.valid_from,
          },
          embedding,
        };
      })
    );

    const { data: insertedNodes, error: nodeError } = await supabaseAdmin
      .from("knowledge_nodes")
      .insert(nodeRows)
      .select("id");

    if (nodeError) {
      console.error("[EntityExtraction] Node insert error:", nodeError);
      return { nodeIds: [], edgeIds: [] };
    }

    if (!insertedNodes || insertedNodes.length === 0) {
      return { nodeIds: [], edgeIds: [] };
    }

    for (const node of insertedNodes) {
      nodeIds.push(node.id);
    }

    // 2. Create DERIVED_FROM edges (only if source chunk exists as a node)
    const { data: sourceExists } = await supabaseAdmin
      .from("knowledge_nodes")
      .select("id")
      .eq("id", sourceChunkId)
      .maybeSingle();

    if (sourceExists) {
      const derivedFromEdges = insertedNodes.map((node) => ({
        source_node_id: node.id,
        target_node_id: sourceChunkId,
        weight: 1.0,
        metadata: {
          relationship_subtype: "DERIVED_FROM",
          reason: "Extracted from source chunk",
          workspace_id: workspaceId,
        },
      }));

      const { data: derivedEdges, error: derivedError } = await supabaseAdmin
        .from("knowledge_edges")
        .insert(derivedFromEdges)
        .select("id");

      if (derivedError) {
        console.error("[EntityExtraction] DERIVED_FROM edge insert error:", derivedError);
      } else if (derivedEdges) {
        for (const edge of derivedEdges) {
          edgeIds.push(edge.id);
        }
      }
    }

    // 3. Create higher-order causal edges between extracted entities
    if (extraction.causal_relationships.length > 0 && insertedNodes.length > 0) {
      // Map entity names to node IDs
      const nodeNameToId = new Map<string, string>();
      extraction.entities.forEach((entity, idx) => {
        if (insertedNodes[idx]) {
          nodeNameToId.set(entity.entity_name.toLowerCase().trim(), insertedNodes[idx].id);
        }
      });

      const causalEdges = extraction.causal_relationships
        .map((rel) => {
          const sourceId = nodeNameToId.get(rel.source_entity.toLowerCase().trim());
          const targetId = nodeNameToId.get(rel.target_entity.toLowerCase().trim());
          if (!sourceId || !targetId) return null;

          return {
            source_node_id: sourceId,
            target_node_id: targetId,
            weight: 5.0,
            metadata: {
              relationship_type: rel.relationship_type,
              reason: rel.reasoning,
              workspace_id: workspaceId,
              origin_uri: originUri,
            },
          };
        })
        .filter(Boolean) as { source_node_id: string; target_node_id: string; weight: number; metadata: Record<string, unknown> }[];

      if (causalEdges.length > 0) {
        const { data: causalInserted, error: causalError } = await supabaseAdmin
          .from("knowledge_edges")
          .insert(causalEdges)
          .select("id");

        if (causalError) {
          console.error("[EntityExtraction] Causal edge insert error:", causalError);
        } else if (causalInserted) {
          for (const edge of causalInserted) {
            edgeIds.push(edge.id);
          }
        }
      }
    }

    // 4. Append ASSERTED event to wm_events
    await supabaseAdmin.from("wm_events").insert({
      entity_id: insertedNodes[0].id,
      event_type: "ASSERTED",
      payload: {
        node_count: insertedNodes.length,
        edge_count: edgeIds.length,
        source_chunk_id: sourceChunkId,
        workspace_id: workspaceId,
        origin_uri: originUri,
      },
      trust_tier: "UNVERIFIED",
      source_model: "gemini-2.5-flash",
    });

    return { nodeIds, edgeIds };
  } catch (err) {
    console.error("[EntityExtraction] Insertion pipeline failed:", err);
    return { nodeIds, edgeIds };
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export interface ProcessChunkForKnowledgeGraphParams {
  workspaceId: string;
  userId: string;
  sourceChunkId: string;
  content: string;
  originUri?: string | null;
}

/**
 * Main pipeline: extract entities → insert nodes → create edges.
 * Called after delta detection returns NEW or UPDATED.
 */
export async function processChunkForKnowledgeGraph(
  params: ProcessChunkForKnowledgeGraphParams
): Promise<InsertExtractionResult> {
  const { workspaceId, userId, sourceChunkId, content, originUri } = params;

  // Extract entities
  const extraction = await extractEntities(content);

  if (extraction.entities.length === 0) {
    return { nodeIds: [], edgeIds: [] };
  }

  // Insert with edges
  return insertExtractionWithEdges({
    workspaceId,
    userId,
    sourceChunkId,
    sourceChunkContent: content,
    extraction,
    originUri,
  });
}
