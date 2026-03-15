
import { supabase } from '../supabaseClient';
import { generateEmbedding } from './embedding';

export type NodeType = 'person' | 'project' | 'technology' | 'organization' | 'concept' | 'event' | 'location' | 'other';

export interface GraphNode {
    id: string;
    userId: string;
    name: string;
    type: NodeType;
    description?: string;
    metadata?: any;
    similarity?: number;
}

export interface GraphEdge {
    id: string;
    sourceId: string;
    targetId: string;
    relation: string;
    weight: number;
}

/**
 * Adds or updates a node in the knowledge graph.
 * If a node with the same name and type exists for the user, it returns the existing ID.
 */
export async function addNode(
    userId: string,
    name: string,
    type: NodeType,
    description?: string,
    metadata: any = {}
): Promise<string | null> {
    try {
        // 1. Generate embedding for semantic search
        const embedding = await generateEmbedding(`${name}: ${description || ''}`);

        // 2. Upsert node (requires UNIQUE constraint on user_id, name, type)
        const { data, error } = await supabase
            .from('graph_nodes')
            .upsert({
                user_id: userId,
                name,
                type,
                description,
                embedding,
                metadata,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, name, type'
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error adding graph node:', error);
            throw error;
        }

        return data.id;
    } catch (error) {
        console.error('Failed to add node:', error);
        return null;
    }
}

/**
 * Adds a directed edge between two nodes.
 */
export async function addEdge(
    userId: string,
    sourceId: string,
    targetId: string,
    relation: string,
    weight: number = 1.0
): Promise<string | null> {
    try {
        const { data, error } = await supabase
            .from('graph_edges')
            .upsert({
                user_id: userId,
                source_node_id: sourceId,
                target_node_id: targetId,
                relation,
                weight
            }, {
                onConflict: 'source_node_id, target_node_id, relation'
            })
            .select('id')
            .single();

        if (error) {
            console.error('Error adding graph edge:', error);
            throw error;
        }

        return data.id;
    } catch (error) {
        console.error('Failed to add edge:', error);
        return null;
    }
}

/**
 * Finds nodes related to a specific entity name using semantic search + edge traversal.
 * This is a two-step process:
 * 1. Find the central node by name/embedding.
 * 2. Find all connected nodes (1-hop).
 */
export async function findRelatedEntities(
    userId: string,
    entityName: string
): Promise<{ centralNode: GraphNode | null; relatedNodes: any[] }> {
    try {
        // 1. Find the central node
        // diverse approach: exact match first, then semantic
        const embedding = await generateEmbedding(entityName);

        // Call the RPC function we created
        const { data: similarNodes, error } = await supabase.rpc('match_nodes', {
            query_embedding: embedding,
            match_threshold: 0.85, // High threshold for "identity" match
            match_count: 1,
            p_user_id: userId
        });

        if (error) throw error;

        if (!similarNodes || similarNodes.length === 0) {
            return { centralNode: null, relatedNodes: [] };
        }

        const centralNode = similarNodes[0];

        // 2. Find connections (Edges) where this node is source or target
        // We need to query graph_edges and join with graph_nodes
        // Supabase JS client doesn't support deep joins easily without knowing foreign keys clearly, 
        // but let's try standard relational query.

        // Outgoing edges
        const { data: outgoing, error: outError } = await supabase
            .from('graph_edges')
            .select('relation, target_node_id, graph_nodes!graph_edges_target_node_id_fkey(name, type, description)')
            .eq('source_node_id', centralNode.id);

        // Incoming edges
        const { data: incoming, error: inError } = await supabase
            .from('graph_edges')
            .select('relation, source_node_id, graph_nodes!graph_edges_source_node_id_fkey(name, type, description)')
            .eq('target_node_id', centralNode.id);

        if (outError) console.error('Error fetching outgoing edges:', outError);
        if (inError) console.error('Error fetching incoming edges:', inError);

        const interactions = [
            ...(outgoing || []).map((edge: any) => ({
                relation: edge.relation,
                direction: 'forward',
                node: edge.graph_nodes
            })),
            ...(incoming || []).map((edge: any) => ({
                relation: edge.relation,
                direction: 'baskward', // passively related to
                node: edge.graph_nodes
            }))
        ];

        return {
            centralNode,
            relatedNodes: interactions
        };

    } catch (error) {
        console.error('Error finding related entities:', error);
        return { centralNode: null, relatedNodes: [] };
    }
}

/**
 * Format graph context for the LLM prompt.
 */
export function formatGraphContext(graphData: { centralNode: GraphNode | null; relatedNodes: any[] }): string {
    if (!graphData.centralNode || graphData.relatedNodes.length === 0) {
        return '';
    }

    const { centralNode, relatedNodes } = graphData;

    let context = `\n## Knowledge Graph Context (Entity: ${centralNode.name})\n`;
    context += `Type: ${centralNode.type}\n`;
    if (centralNode.description) context += `Description: ${centralNode.description}\n`;

    context += `\n**Relationships:**\n`;

    relatedNodes.forEach(rel => {
        if (rel.direction === 'forward') {
            context += `- [${centralNode.name}] --(${rel.relation})--> [${rel.node.name} (${rel.node.type})]\n`;
        } else {
            context += `- [${rel.node.name} (${rel.node.type})] --(${rel.relation})--> [${centralNode.name}]\n`;
        }
    });

    return context + '\n';
}

/**
 * Strengthens an existing edge or creates a new one.
 * If the edge exists, increments weight by 0.5 (capped at 10.0).
 * If not, creates it with weight 1.0.
 */
export async function strengthenEdge(
    userId: string,
    sourceId: string,
    targetId: string,
    relation: string
): Promise<string | null> {
    try {
        // Check if edge exists
        const { data: existing, error: fetchError } = await supabase
            .from('graph_edges')
            .select('id, weight')
            .eq('user_id', userId)
            .eq('source_node_id', sourceId)
            .eq('target_node_id', targetId)
            .eq('relation', relation)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            // PGRST116 = no rows — that's fine, we'll create
            console.error('[GraphStore] Error checking edge:', fetchError);
        }

        if (existing) {
            // Strengthen: increment weight, cap at 10.0
            const newWeight = Math.min(10.0, (existing.weight || 1.0) + 0.5);
            const { error: updateError } = await supabase
                .from('graph_edges')
                .update({ weight: newWeight, updated_at: new Date().toISOString() })
                .eq('id', existing.id);

            if (updateError) {
                console.error('[GraphStore] Error strengthening edge:', updateError);
                return null;
            }
            return existing.id;
        } else {
            // Create new edge
            return addEdge(userId, sourceId, targetId, relation, 1.0);
        }
    } catch (error) {
        console.error('[GraphStore] Failed to strengthen edge:', error);
        return null;
    }
}
