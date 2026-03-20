import { supabase } from '../supabaseClient';
import { generateEmbedding } from './embedding';

export type NodeType = 'person' | 'project' | 'technology' | 'organization' | 'concept' | 'event' | 'location' | 'other';
export type WMEventType = 'ASSERTED' | 'CONTRADICTED' | 'OBSOLETED' | 'MERGED';
export type TrustTier = 'AXIOM' | 'CONFIRMED' | 'SUPPORTED' | 'UNVERIFIED';

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
 * Emits an immutable event to the World Model event log (wm_events).
 * This is the Step 1 DDIA implementation for Event Sourcing.
 */
export async function emitWorldModelEvent(
    entityId: string,
    eventType: WMEventType,
    payload: any,
    sourceModel: string = 'system',
    trustTier: TrustTier = 'UNVERIFIED',
    contextVersionId?: string
): Promise<boolean> {
    try {
        const { error } = await supabase.from('wm_events').insert({
            entity_id: entityId,
            event_type: eventType,
            payload,
            source_model: sourceModel,
            trust_tier: trustTier,
            context_version_id: contextVersionId || null
        });

        if (error) {
            console.error('[WorldModel] Failed to emit event:', error);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[WorldModel] Exception emitting event:', err);
        return false;
    }
}

/**
 * Adds or updates a node in the knowledge graph.
 */
export async function addNode(
    userId: string,
    name: string,
    type: NodeType,
    description?: string,
    metadata: any = {},
    sourceModel: string = 'system',
    trustTier: TrustTier = 'UNVERIFIED'
): Promise<string | null> {
    try {
        // 1. Generate embedding for semantic search
        const embedding = await generateEmbedding(`${name}: ${description || ''}`);

        // 2. Legacy Projection Update (graph_nodes)
        // TODO (T-032): Once wm_current_entities view supports vector search, remove this direct upsert.
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

        if (error) throw error;

        // 3. Emit immutable event to the World Model Event Log
        await emitWorldModelEvent(
            data.id,
            'ASSERTED',
            {
                entity_type: 'node',
                user_id: userId,
                name,
                type,
                description,
                metadata
            },
            sourceModel,
            trustTier
        );

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
    weight: number = 1.0,
    sourceModel: string = 'system',
    trustTier: TrustTier = 'UNVERIFIED'
): Promise<string | null> {
    try {
        // Legacy Projection Update
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

        if (error) throw error;

        // Emit immutable event
        await emitWorldModelEvent(
            data.id,
            'ASSERTED',
            {
                entity_type: 'edge',
                user_id: userId,
                source_node_id: sourceId,
                target_node_id: targetId,
                relation,
                weight
            },
            sourceModel,
            trustTier
        );

        return data.id;
    } catch (error) {
        console.error('Failed to add edge:', error);
        return null;
    }
}

/**
 * Strengthens an existing edge or creates a new one.
 * Deprecates direct UPDATE on nodes; emits an ASSERTED event with the new weight instead.
 */
export async function strengthenEdge(
    userId: string,
    sourceId: string,
    targetId: string,
    relation: string,
    sourceModel: string = 'system',
    trustTier: TrustTier = 'UNVERIFIED'
): Promise<string | null> {
    try {
        const { data: existing, error: fetchError } = await supabase
            .from('graph_edges')
            .select('id, weight')
            .eq('user_id', userId)
            .eq('source_node_id', sourceId)
            .eq('target_node_id', targetId)
            .eq('relation', relation)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[GraphStore] Error checking edge:', fetchError);
        }

        if (existing) {
            const newWeight = Math.min(10.0, (existing.weight || 1.0) + 0.5);
            
            // 1. Emit immutable event reflecting the new state (Event Sourcing)
            await emitWorldModelEvent(
                existing.id,
                'ASSERTED',
                {
                    entity_type: 'edge',
                    user_id: userId,
                    source_node_id: sourceId,
                    target_node_id: targetId,
                    relation,
                    weight: newWeight
                },
                sourceModel,
                trustTier
            );

            // 2. Legacy projection update (to keep current reads working)
            const { error: updateError } = await supabase
                .from('graph_edges')
                .update({ weight: newWeight, updated_at: new Date().toISOString() })
                .eq('id', existing.id);

            if (updateError) {
                console.error('[GraphStore] Error strengthening edge projection:', updateError);
                return null;
            }
            return existing.id;
        } else {
            return addEdge(userId, sourceId, targetId, relation, 1.0, sourceModel, trustTier);
        }
    } catch (error) {
        console.error('[GraphStore] Failed to strengthen edge:', error);
        return null;
    }
}

/**
 * Invalidates a node or edge (Event Sourcing alternative to DELETE).
 */
export async function invalidateEntity(
    entityId: string,
    entityType: 'node' | 'edge',
    sourceModel: string = 'system',
    trustTier: TrustTier = 'UNVERIFIED'
): Promise<boolean> {
    // We emit an OBSOLETED event. The Materialized View (wm_current_entities) 
    // will see this as the latest event and logically delete it from read queries.
    const success = await emitWorldModelEvent(
        entityId,
        'OBSOLETED',
        { entity_type: entityType, deleted: true },
        sourceModel,
        trustTier
    );

    // If we wanted to keep the legacy projection in sync, we could hard-delete from 
    // graph_nodes or graph_edges here, but ideally we stop doing that.
    // For now, we do hard-delete on legacy tables just so it's fully gone from legacy reads.
    if (success) {
        const table = entityType === 'node' ? 'graph_nodes' : 'graph_edges';
        await supabase.from(table).delete().eq('id', entityId);
    }

    return success;
}

/**
 * Finds nodes related to a specific entity name using semantic search + edge traversal.
 * Note: Still uses legacy `match_nodes` and `graph_edges` until the Materialized View
 * is fully mapped for embeddings.
 */
export async function findRelatedEntities(
    userId: string,
    entityName: string
): Promise<{ centralNode: GraphNode | null; relatedNodes: any[] }> {
    try {
        const embedding = await generateEmbedding(entityName);

        // 1. Semantic Match using the new Event Sourced view (via RPC)
        const { data: similarNodes, error } = await supabase.rpc('match_wm_nodes', {
            query_embedding: embedding,
            match_threshold: 0.85, 
            match_count: 1,
            p_user_id: userId
        });

        if (error) throw error;
        if (!similarNodes || similarNodes.length === 0) return { centralNode: null, relatedNodes: [] };

        const centralNode = similarNodes[0];

        // 2. Traverse 1-hop using the new Event Sourced view (via RPC)
        const { data: interactions, error: traverseError } = await supabase.rpc('get_wm_related_entities', {
            p_central_node_id: centralNode.id
        });

        if (traverseError) {
            console.error('Error fetching event sourced edges:', traverseError);
            return { centralNode, relatedNodes: [] };
        }

        // Format the RPC output to match the legacy format expected by formatGraphContext
        const formattedRelatedNodes = (interactions || []).map((rel: any) => ({
            relation: rel.relation,
            direction: rel.direction,
            node: {
                name: rel.node_name,
                type: rel.node_type,
                description: rel.node_description
            }
        }));

        return { centralNode, relatedNodes: formattedRelatedNodes };
    } catch (error) {
        console.error('Error finding related entities:', error);
        return { centralNode: null, relatedNodes: [] };
    }
}

export function formatGraphContext(graphData: { centralNode: GraphNode | null; relatedNodes: any[] }): string {
    if (!graphData.centralNode || graphData.relatedNodes.length === 0) return '';
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
