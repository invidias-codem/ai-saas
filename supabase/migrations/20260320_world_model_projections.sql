-- T-032: World Model Read Projections (Views & RPC)
-- This implements Command Query Responsibility Segregation (CQRS) from DDIA.
-- Writes go to the append-only log (wm_events). Reads query these optimized views.

-- 1. Node Projection View (Extracts node state from JSONB payload)
CREATE OR REPLACE VIEW wm_nodes_view AS
SELECT 
    entity_id AS id,
    current_payload->>'user_id' AS user_id,
    current_payload->>'name' AS name,
    current_payload->>'type' AS type,
    current_payload->>'description' AS description,
    current_payload->'metadata' AS metadata,
    current_trust_tier AS trust_tier
FROM wm_current_entities
WHERE latest_event_type != 'OBSOLETED' 
  AND current_payload->>'entity_type' = 'node';

-- 2. Edge Projection View (Extracts edge state from JSONB payload)
CREATE OR REPLACE VIEW wm_edges_view AS
SELECT 
    entity_id AS id,
    current_payload->>'user_id' AS user_id,
    current_payload->>'source_node_id' AS source_node_id,
    current_payload->>'target_node_id' AS target_node_id,
    current_payload->>'relation' AS relation,
    (current_payload->>'weight')::numeric AS weight,
    current_trust_tier AS trust_tier
FROM wm_current_entities
WHERE latest_event_type != 'OBSOLETED' 
  AND current_payload->>'entity_type' = 'edge';

-- 3. Vector Search RPC (Joins the legacy vector index with the new Event Sourced truth)
-- Note: pgvector embeddings don't live in JSONB well, so we treat the old graph_nodes 
-- table strictly as a read-optimized vector index going forward.
CREATE OR REPLACE FUNCTION match_wm_nodes (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  similarity float,
  trust_tier trust_tier
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id::uuid,
    v.name,
    v.type,
    v.description,
    1 - (gn.embedding <=> query_embedding) AS similarity,
    v.trust_tier
  FROM wm_nodes_view v
  JOIN graph_nodes gn ON gn.id = v.id::uuid
  WHERE v.user_id = p_user_id::text
    AND 1 - (gn.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- 4. RPC for 1-hop traversal using the new Event Sourced Projections
CREATE OR REPLACE FUNCTION get_wm_related_entities(p_central_node_id uuid)
RETURNS TABLE (
    relation text,
    direction text,
    node_id uuid,
    node_name text,
    node_type text,
    node_description text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- Outgoing Edges
    SELECT 
        e.relation,
        'forward'::text AS direction,
        n.id::uuid AS node_id,
        n.name,
        n.type,
        n.description
    FROM wm_edges_view e
    JOIN wm_nodes_view n ON n.id::uuid = e.target_node_id::uuid
    WHERE e.source_node_id::uuid = p_central_node_id
    
    UNION ALL
    
    -- Incoming Edges
    SELECT 
        e.relation,
        'backward'::text AS direction,
        n.id::uuid AS node_id,
        n.name,
        n.type,
        n.description
    FROM wm_edges_view e
    JOIN wm_nodes_view n ON n.id::uuid = e.source_node_id::uuid
    WHERE e.target_node_id::uuid = p_central_node_id;
END;
$$;
