-- ============================================================
-- Lineage Retrieval RPC: match_workspace_sources_with_lineage
-- Returns workspace_sources + connected knowledge_edges + knowledge_nodes
-- for causal context in Weaver's reasoning.
-- ============================================================

-- Extend knowledge_edges with relationship_type if not already present
ALTER TABLE knowledge_edges
  ADD COLUMN IF NOT EXISTS relationship_type TEXT NOT NULL DEFAULT 'RELATES_TO'
                      CHECK (relationship_type IN (
                        'RELATES_TO', 'CORRELATES_WITH', 'PRECEDES',
                        'CAUSES', 'INHIBITS', 'CONTRADICTS', 'SUPPORTS',
                        'COUNTERFACTUAL_OF', 'IS_A', 'HAS_ATTRIBUTE',
                        'ASSERTED_BY', 'CONTEXT_OF', 'SUPERSEDES', 'DERIVED_FROM'
                      ));

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_rel_type
  ON knowledge_edges (relationship_type);

-- Lineage retrieval function
-- Takes a query embedding, finds closest workspace_sources chunks,
-- and recursively joins knowledge_edges + knowledge_nodes.
CREATE OR REPLACE FUNCTION match_workspace_sources_with_lineage(
    query_embedding  vector(1536),
    target_workspace_id uuid,
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5,
    max_hops int DEFAULT 2
)
RETURNS TABLE (
    -- Source chunk fields
    source_id uuid,
    source_content text,
    source_origin_uri text,
    source_title text,
    source_similarity float,
    source_valid_from timestamptz,
    source_valid_until timestamptz,
    -- Connected node fields (from knowledge_edges)
    connected_node_id uuid,
    connected_node_content text,
    connected_node_type text,
    edge_relationship_type text,
    edge_confidence float,
    -- For 2-hop: secondary connected nodes
    secondary_node_id uuid,
    secondary_node_content text
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Step 1: Find matching workspace_sources chunks
    -- Step 2: Join knowledge_edges to find connected nodes (1-hop)
    -- Step 3: Join again for 2-hop traversal (optional, limited by max_hops)
    RETURN QUERY
    WITH matched_sources AS (
        SELECT
            ws.id AS sid,
            ws.content AS scontent,
            ws.origin_uri AS suri,
            ws.title AS stitle,
            1 - (ws.embedding <=> query_embedding) AS sim,
            ws.valid_from AS svfrom,
            ws.valid_until AS svuntil
        FROM workspace_sources ws
        WHERE ws.workspace_id = target_workspace_id
          AND ws.valid_until IS NULL
          AND 1 - (ws.embedding <=> query_embedding) > match_threshold
        ORDER BY ws.embedding <=> query_embedding ASC
        LIMIT match_count
    ),
    one_hop AS (
        SELECT
            ms.*,
            kn.id AS nid,
            kn.content AS ncontent,
            kn.node_type AS ntype,
            ke.relationship_type AS erel,
            COALESCE((ke.metadata->>'confidence')::float, 0.5) AS econf
        FROM matched_sources ms
        LEFT JOIN knowledge_edges ke ON ke.source_node_id = ms.sid OR ke.target_node_id = ms.sid
        LEFT JOIN knowledge_nodes kn ON kn.id = CASE
            WHEN ke.source_node_id = ms.sid THEN ke.target_node_id
            ELSE ke.source_node_id
        END
        WHERE kn.id IS NOT NULL
    ),
    two_hop AS (
        SELECT
            oh.*,
            kn2.id AS nid2,
            kn2.content AS ncontent2
        FROM one_hop oh
        LEFT JOIN knowledge_edges ke2 ON ke2.source_node_id = oh.nid OR ke2.target_node_id = oh.nid
        LEFT JOIN knowledge_nodes kn2 ON kn2.id = CASE
            WHEN ke2.source_node_id = oh.nid THEN ke2.target_node_id
            ELSE ke2.source_node_id
        END
        WHERE kn2.id IS NOT NULL AND kn2.id != oh.nid AND max_hops >= 2
    )
    SELECT
        oh.sid,
        oh.scontent,
        oh.suri,
        oh.stitle,
        oh.sim,
        oh.svfrom,
        oh.svuntil,
        oh.nid,
        oh.ncontent,
        oh.ntype,
        oh.erel,
        oh.econf,
        th.nid2,
        th.ncontent2
    FROM one_hop oh
    LEFT JOIN two_hop th ON th.sid = oh.sid AND th.nid = oh.nid
    ORDER BY oh.sim DESC, oh.sid;
END;
$$;

-- ============================================================
-- Simplified version: returns JSON for easier client parsing
-- ============================================================
CREATE OR REPLACE FUNCTION match_workspace_sources_with_lineage_json(
    query_embedding  vector(1536),
    target_workspace_id uuid,
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'source_id', sub.sid,
            'content', sub.scontent,
            'origin_uri', sub.suri,
            'similarity', sub.sim,
            'valid_from', sub.svfrom,
            'valid_until', sub.svuntil,
            'knowledge_nodes', COALESCE(sub.nodes, '[]'::jsonb)
        )
    ) INTO result
    FROM (
        SELECT
            ws.id AS sid,
            ws.content AS scontent,
            ws.origin_uri AS suri,
            1 - (ws.embedding <=> query_embedding) AS sim,
            ws.valid_from AS svfrom,
            ws.valid_until AS svuntil,
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'node_id', kn.id,
                        'content', kn.content,
                        'node_type', kn.node_type,
                        'relationship', ke.relationship_type,
                        'confidence', COALESCE((ke.metadata->>'confidence')::float, 0.5)
                    )
                )
                FROM knowledge_edges ke
                JOIN knowledge_nodes kn ON kn.id = ke.target_node_id
                WHERE ke.source_node_id = ws.id
                LIMIT 10
            ) AS nodes
        FROM workspace_sources ws
        WHERE ws.workspace_id = target_workspace_id
          AND ws.valid_until IS NULL
          AND 1 - (ws.embedding <=> query_embedding) > match_threshold
        ORDER BY ws.embedding <=> query_embedding ASC
        LIMIT match_count
    ) sub;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
