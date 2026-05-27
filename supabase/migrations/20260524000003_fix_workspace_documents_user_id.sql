-- Change user_id from UUID to TEXT to support Clerk's user_xxx IDs
ALTER TABLE workspace_documents ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
