-- =============================================================================
-- Slack Channel Auto-Indexing Tables
-- Purpose: Track which channels are opted-in and rate limit indexed messages
-- =============================================================================

-- Table: slack_indexed_channels
-- Tracks which Slack channels have been opted-in for auto-indexing
CREATE TABLE IF NOT EXISTS slack_indexed_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_slack_user TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(team_id, channel_id)
);

-- Table: slack_indexed_messages
-- Tracks individual indexed messages for rate limiting and deduplication
CREATE TABLE IF NOT EXISTS slack_indexed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_ts TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(team_id, channel_id, message_ts)
);

-- Table: slack_indexer_logs
-- Audit log for indexer operations
CREATE TABLE IF NOT EXISTS slack_indexer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT,
  channel_id TEXT,
  action TEXT NOT NULL, -- 'index_run', 'error', 'rate_limited'
  messages_indexed INTEGER DEFAULT 0,
  messages_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_slack_indexed_channels_team ON slack_indexed_channels(team_id);
CREATE INDEX IF NOT EXISTS idx_slack_indexed_channels_enabled ON slack_indexed_channels(enabled);
CREATE INDEX IF NOT EXISTS idx_slack_indexed_channels_team_channel ON slack_indexed_channels(team_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_slack_indexed_messages_team ON slack_indexed_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_slack_indexed_messages_created ON slack_indexed_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_slack_indexed_messages_team_created ON slack_indexed_messages(team_id, created_at);

CREATE INDEX IF NOT EXISTS idx_slack_indexer_logs_created ON slack_indexer_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_slack_indexer_logs_team ON slack_indexer_logs(team_id);

-- Row Level Security
ALTER TABLE slack_indexed_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_indexed_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_indexer_logs ENABLE ROW LEVEL SECURITY;

-- Policies (service role only - no user access)
CREATE POLICY "Service role can manage indexed channels"
  ON slack_indexed_channels
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage indexed messages"
  ON slack_indexed_messages
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage indexer logs"
  ON slack_indexer_logs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_slack_indexed_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_slack_indexed_channels_updated_at
  BEFORE UPDATE ON slack_indexed_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_slack_indexed_channels_updated_at();

-- Comments for documentation
COMMENT ON TABLE slack_indexed_channels IS 'Tracks Slack channels opted-in for auto-indexing';
COMMENT ON TABLE slack_indexed_messages IS 'Tracks indexed messages for rate limiting and deduplication';
COMMENT ON TABLE slack_indexer_logs IS 'Audit log for channel indexer operations';

COMMENT ON COLUMN slack_indexed_channels.team_id IS 'Slack workspace team ID';
COMMENT ON COLUMN slack_indexed_channels.channel_id IS 'Slack channel ID (C...  format)';
COMMENT ON COLUMN slack_indexed_channels.enabled IS 'Whether auto-indexing is active for this channel';

COMMENT ON COLUMN slack_indexed_messages.message_ts IS 'Slack message timestamp (unique per channel)';
COMMENT ON COLUMN slack_indexed_messages.created_at IS 'When this message was indexed';
