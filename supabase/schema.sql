-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES TABLE (Syncs with Clerk ideally, but we'll focus on conversation needs first)
-- For now, we rely on the `user_id` string from Clerk to identify ownership.

-- CONVERSATIONS TABLE
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Clerk User ID
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE
);

-- MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot', 'system')), -- 'bot' corresponds to 'model' or 'assistant' usually, keeping 'bot' as per existing UI
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- indexes for performance
  CONSTRAINT fk_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_is_deleted ON conversations(is_deleted);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- Users can only see their own non-deleted conversations
CREATE POLICY "Users can view their own conversations" 
ON conversations FOR SELECT 
USING (auth.uid()::text = user_id AND is_deleted = FALSE);

-- Note: Depending on how we auth with Supabase from Next.js server, we might use Service Role key 
-- which bypasses RLS, or we pass the user JWT. 
-- For server-side operations with Service Key, RLS is bypassed. 
-- These policies are useful if we ever do client-side Supabase calls.

-- FUNCTION to update 'updated_at' on modifications
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
