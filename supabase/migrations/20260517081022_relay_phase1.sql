-- Phase 1 Relay Tables

CREATE TABLE IF NOT EXISTS relay_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT,
    task_description TEXT NOT NULL,
    response_summary TEXT NOT NULL,
    raw_trajectory JSONB,
    reward_score DOUBLE PRECISION DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Full text search index on the summary for semantic recall
ALTER TABLE relay_sessions ADD COLUMN fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(response_summary, ''))) STORED;
CREATE INDEX relay_sessions_fts_idx ON relay_sessions USING GIN (fts);
CREATE INDEX relay_sessions_user_id_idx ON relay_sessions(user_id);


CREATE TABLE IF NOT EXISTS relay_skills (
    id TEXT PRIMARY KEY, -- the snake_case unique id
    version INTEGER DEFAULT 1,
    trigger_pattern TEXT NOT NULL,
    trigger_embedding_768 vector(768),
    trigger_embedding_3072 vector(3072),
    confidence_threshold DOUBLE PRECISION DEFAULT 0.8,
    requires_approval BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX relay_skills_trigger_embedding_768_idx ON relay_skills USING hnsw (trigger_embedding_768 vector_cosine_ops);
-- Note: hnsw index not supported for >2000 dimensions. For 3072, we'll use exact match or ivfflat if needed later.


CREATE TABLE IF NOT EXISTS relay_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    requires_approval BOOLEAN DEFAULT true,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, executing, success, failure
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX relay_commands_device_id_status_idx ON relay_commands(device_id, status);


-- RLS Setup
ALTER TABLE relay_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own relay sessions"
    ON relay_sessions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read relay skills"
    ON relay_skills FOR SELECT
    USING (true);

CREATE POLICY "Users can manage their own relay commands"
    ON relay_commands FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RPC for finding skills
CREATE OR REPLACE FUNCTION match_relay_skills_768(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id TEXT,
    trigger_pattern TEXT,
    confidence_threshold DOUBLE PRECISION,
    requires_approval BOOLEAN,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rs.id,
        rs.trigger_pattern,
        rs.confidence_threshold,
        rs.requires_approval,
        1 - (rs.trigger_embedding_768 <=> query_embedding) AS similarity
    FROM relay_skills rs
    WHERE 1 - (rs.trigger_embedding_768 <=> query_embedding) > match_threshold
    ORDER BY rs.trigger_embedding_768 <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_relay_skills_3072(
    query_embedding vector(3072),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id TEXT,
    trigger_pattern TEXT,
    confidence_threshold DOUBLE PRECISION,
    requires_approval BOOLEAN,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rs.id,
        rs.trigger_pattern,
        rs.confidence_threshold,
        rs.requires_approval,
        1 - (rs.trigger_embedding_3072 <=> query_embedding) AS similarity
    FROM relay_skills rs
    WHERE 1 - (rs.trigger_embedding_3072 <=> query_embedding) > match_threshold
    ORDER BY rs.trigger_embedding_3072 <=> query_embedding
    LIMIT match_count;
END;
$$;
