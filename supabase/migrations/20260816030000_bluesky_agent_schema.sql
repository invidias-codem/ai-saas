-- ============================================================
-- Bluesky Engagement Agent Schema
-- ============================================================

-- 1. Cursor state: tracks latest processed post per feed
CREATE TABLE IF NOT EXISTS bluesky_cursors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_uri        TEXT NOT NULL UNIQUE,        -- AT-URI of the feed/list being polled
    last_cursor     TEXT,                        -- AT Protocol cursor for pagination
    last_post_cid  TEXT,                        -- CID of last processed post (dedup)
    last_post_at    TIMESTAMPTZ,                 -- Timestamp of last processed post
    poll_count      INTEGER DEFAULT 0,           -- Total polls executed
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_cursors_feed_uri
    ON bluesky_cursors (feed_uri);

-- 2. Session caching: store AT Protocol JWT tokens
CREATE TABLE IF NOT EXISTS bluesky_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    did             TEXT NOT NULL UNIQUE,        -- Bluesky DID (did:plc:...)
    handle          TEXT NOT NULL,               -- Bluesky handle
    access_jwt      TEXT NOT NULL,               -- Short-lived access token
    refresh_jwt     TEXT NOT NULL,               -- Long-lived refresh token
    expires_at      TIMESTAMPTZ NOT NULL,        -- Access token expiry
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_sessions_did
    ON bluesky_sessions (did);

-- 3. Reply queue: human-in-the-loop approval
CREATE TABLE IF NOT EXISTS bluesky_reply_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'posted', 'failed')),
    -- Source post
    source_uri      TEXT NOT NULL,               -- AT-URI of the post being replied to
    source_cid      TEXT NOT NULL,               -- CID of the post being replied to
    source_author   TEXT NOT NULL,               -- Handle of the original author
    source_text     TEXT NOT NULL,               -- Original post text
    -- Drafted reply
    reply_text      TEXT NOT NULL,               -- Drafted reply text
    reply_uri       TEXT,                        -- AT-URI of the posted reply (after posting)
    -- Context
    extracted_claims JSONB,                      -- Claims extracted from source post
    causal_edges    JSONB,                       -- Causal edges created (CONTRADICTS, DERIVED_FROM)
    confidence      FLOAT,                       -- Extraction confidence
    -- Approval workflow
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     TEXT,                        -- Clerk user_id of reviewer
    error_message   TEXT,                        -- Error if posting failed
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_reply_queue_status
    ON bluesky_reply_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bluesky_reply_queue_source_uri
    ON bluesky_reply_queue (source_uri);

-- 4. Target feeds: configurable list of AT-URIs to poll
CREATE TABLE IF NOT EXISTS bluesky_feeds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_uri        TEXT NOT NULL UNIQUE,        -- AT-URI (feed or list)
    feed_type       TEXT NOT NULL DEFAULT 'feed'
                    CHECK (feed_type IN ('feed', 'list', 'author')),
    label           TEXT,                        -- Human-readable label
    is_active       BOOLEAN DEFAULT TRUE,
    priority        INTEGER DEFAULT 0,           -- Higher = polled first
    last_polled_at  TIMESTAMPTZ,
    post_count      INTEGER DEFAULT 0,           -- Total posts ingested
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_feeds_active_priority
    ON bluesky_feeds (is_active, priority DESC);

-- ============================================================
-- Trigger: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION touch_bluesky_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bluesky_cursors_updated_at ON bluesky_cursors;
CREATE TRIGGER trg_bluesky_cursors_updated_at
    BEFORE UPDATE ON bluesky_cursors FOR EACH ROW
    EXECUTE FUNCTION touch_bluesky_updated_at();

DROP TRIGGER IF EXISTS trg_bluesky_sessions_updated_at ON bluesky_sessions;
CREATE TRIGGER trg_bluesky_sessions_updated_at
    BEFORE UPDATE ON bluesky_sessions FOR EACH ROW
    EXECUTE FUNCTION touch_bluesky_updated_at();

DROP TRIGGER IF EXISTS trg_bluesky_reply_queue_updated_at ON bluesky_reply_queue;
CREATE TRIGGER trg_bluesky_reply_queue_updated_at
    BEFORE UPDATE ON bluesky_reply_queue FOR EACH ROW
    EXECUTE FUNCTION touch_bluesky_updated_at();

DROP TRIGGER IF EXISTS trg_bluesky_feeds_updated_at ON bluesky_feeds;
CREATE TRIGGER trg_bluesky_feeds_updated_at
    BEFORE UPDATE ON bluesky_feeds FOR EACH ROW
    EXECUTE FUNCTION touch_bluesky_updated_at();

-- ============================================================
-- RLS: service-role only
-- ============================================================
ALTER TABLE bluesky_cursors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bluesky_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bluesky_reply_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE bluesky_feeds       ENABLE ROW LEVEL SECURITY;
