-- Allow documents to exist outside of a specific workspace (personal/global scope)
ALTER TABLE workspace_documents ALTER COLUMN workspace_id DROP NOT NULL;
