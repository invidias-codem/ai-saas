-- ============================================================
-- Delta Detection RPC for Data Refinery
-- Measures semantic drift between incoming chunks and currently active chunks
-- ============================================================

-- Type for delta detection result
CREATE TYPE workspace_source_delta_verdict AS ENUM (
    'NEW',        -- No active rows found for this workspace/origin
    'UNCHANGED',  -- All chunks match active content above threshold
    'UPDATED'     -- Content has drifted below threshold
);

-- Main delta detection function
-- Uses chunk-by-chunk best-match comparison for accuracy:
-- For each new chunk, find the most similar active chunk.
-- Average the best-match similarities to get overall drift score.
CREATE OR REPLACE FUNCTION detect_workspace_source_delta(
    new_embeddings     vector(1536)[],
    target_workspace_id uuid,
    target_origin_uri   text,
    similarity_threshold float DEFAULT 0.98
)
RETURNS workspace_source_delta_verdict
LANGUAGE plpgsql
AS $$
DECLARE
    active_count int;
    best_matches float[];
    best_similarity float;
    avg_similarity float;
    i int;
    j int;
    v vector(1536);
    similarities float[];
    max_sim float;
BEGIN
    -- Count active rows for this workspace/origin
    SELECT count(*) INTO active_count
    FROM public.workspace_sources
    WHERE workspace_id = target_workspace_id
      AND origin_uri = target_origin_uri
      AND valid_until IS NULL;

    -- No active rows = NEW
    IF active_count = 0 THEN
        RETURN 'NEW'::workspace_source_delta_verdict;
    END IF;

    -- For each new chunk, find the best-matching active chunk
    FOR i IN 1..array_length(new_embeddings, 1) LOOP
        v := new_embeddings[i];

        -- Collect similarities to all active chunks for this new chunk
        SELECT ARRAY(
            SELECT 1 - (ws.embedding <=> v)
            FROM public.workspace_sources ws
            WHERE ws.workspace_id = target_workspace_id
              AND ws.origin_uri = target_origin_uri
              AND ws.valid_until IS NULL
        ) INTO similarities;

        -- Find the best match for this chunk
        max_sim := 0;
        IF similarities IS NOT NULL THEN
            FOR j IN 1..array_length(similarities, 1) LOOP
                IF similarities[j] > max_sim THEN
                    max_sim := similarities[j];
                END IF;
            END LOOP;
        END IF;

        best_matches := array_append(best_matches, max_sim);
    END LOOP;

    -- Calculate average of best-match similarities
    IF array_length(best_matches, 1) > 0 THEN
        SELECT avg(x) INTO avg_similarity
        FROM unnest(best_matches) AS x;
    ELSE
        avg_similarity := 0;
    END IF;

    -- Verdict based on threshold
    IF avg_similarity >= similarity_threshold THEN
        RETURN 'UNCHANGED'::workspace_source_delta_verdict;
    ELSE
        RETURN 'UPDATED'::workspace_source_delta_verdict;
    END IF;
END;
$$;
