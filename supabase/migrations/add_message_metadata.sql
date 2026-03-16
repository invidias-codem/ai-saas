-- Add metadata column to messages table to store file attachments and other properties
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN public.messages.metadata IS 'Stores additional message data like file attachments, token counts, etc.';
