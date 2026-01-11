-- Move tables from private schema to public schema
-- Run this in your Supabase SQL Editor

-- Step 1: Move the tables to public schema
ALTER TABLE IF EXISTS conversations SET SCHEMA public;
ALTER TABLE IF EXISTS messages SET SCHEMA public;
ALTER TABLE IF EXISTS memories SET SCHEMA public;

-- Step 2: If the above doesn't work, you may need to specify the current schema
-- Replace 'your_schema_name' with the actual schema name where tables were created
-- ALTER TABLE your_schema_name.conversations SET SCHEMA public;
-- ALTER TABLE your_schema_name.messages SET SCHEMA public;
-- ALTER TABLE your_schema_name.memories SET SCHEMA public;

-- Step 3: Verify the tables are now in public schema
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename IN ('conversations', 'messages', 'memories')
ORDER BY schemaname, tablename;

-- Step 4: Reload the schema cache
NOTIFY pgrst, 'reload schema';
