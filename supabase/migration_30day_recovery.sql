-- 30-Day Soft Delete Recovery Window
-- Adds deleted_at timestamp and automatic purge after 30 days

-- =============================================
-- Add deleted_at column to conversations
-- =============================================

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update existing soft-deleted conversations to have a deleted_at timestamp
UPDATE conversations 
SET deleted_at = updated_at 
WHERE is_deleted = true AND deleted_at IS NULL;

-- =============================================
-- Function to permanently delete expired conversations
-- Call this periodically (e.g., daily cron job)
-- =============================================

CREATE OR REPLACE FUNCTION purge_expired_deleted_conversations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete messages first (due to foreign key)
    DELETE FROM messages 
    WHERE conversation_id IN (
        SELECT id FROM conversations 
        WHERE is_deleted = true 
        AND deleted_at IS NOT NULL 
        AND deleted_at < NOW() - INTERVAL '30 days'
    );
    
    -- Then delete the conversations
    DELETE FROM conversations 
    WHERE is_deleted = true 
    AND deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Purged % expired conversations', deleted_count;
    RETURN deleted_count;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION purge_expired_deleted_conversations TO service_role;

-- =============================================
-- Helper function to get days remaining before purge
-- =============================================

CREATE OR REPLACE FUNCTION get_days_until_purge(p_deleted_at TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_deleted_at IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN GREATEST(0, 30 - EXTRACT(DAY FROM (NOW() - p_deleted_at))::INTEGER);
END;
$$;

-- =============================================
-- Index for efficient purge queries
-- =============================================

CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at 
ON conversations(deleted_at) 
WHERE is_deleted = true;

-- =============================================
-- View for conversations with recovery info
-- =============================================

CREATE OR REPLACE VIEW conversations_with_recovery AS
SELECT 
    *,
    CASE 
        WHEN is_deleted AND deleted_at IS NOT NULL THEN
            GREATEST(0, 30 - EXTRACT(DAY FROM (NOW() - deleted_at))::INTEGER)
        ELSE NULL
    END as days_until_purge
FROM conversations;

-- Grant access
GRANT SELECT ON conversations_with_recovery TO service_role;
