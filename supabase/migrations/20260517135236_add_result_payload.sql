ALTER TABLE relay_commands 
ADD COLUMN result_payload JSONB DEFAULT '{}'::jsonb;
