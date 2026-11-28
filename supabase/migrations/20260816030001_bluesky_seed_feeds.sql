-- Seed initial Bluesky target feeds
-- These are high-signal technical feeds relevant to Lattice OS positioning

INSERT INTO bluesky_feeds (feed_uri, feed_type, label, priority, is_active) VALUES
    ('at://did:plc:35tjkzodwibcia7lce5cufsx/app.bsky.feed.generator/aaahp6tktnk4i', 'feed', 'AI Infrastructure', 10, true),
    ('at://did:plc:35tjkzodwibcia7lce5cufsx/app.bsky.feed/generator/aaahp6tktnk4i', 'feed', 'Web Development', 8, true),
    ('at://did:plc:35tjkzodwibcia7lce5cufsx/app.bsky.feed/generator/aaahp6tktnk4i', 'feed', 'Multi-Model AI', 7, true)
ON CONFLICT (feed_uri) DO NOTHING;
