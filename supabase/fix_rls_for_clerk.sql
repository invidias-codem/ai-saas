-- Fix RLS for Service Role Access
-- The app uses Clerk for auth, not Supabase Auth, so auth.uid() is always NULL
-- This allows the service role (used by the backend) to bypass RLS

-- Option 1: Create policies that allow service role access
-- The service role key automatically bypasses RLS, but let's ensure it's working

-- First, verify RLS is enabled (it should be from our migration)
-- Then add a permissive policy for authenticated service access

-- For graph_nodes: Allow all operations when using service role
-- Service role bypasses RLS by default, but let's also add "authenticated" bypass

CREATE POLICY "Service role can do anything on nodes" ON graph_nodes
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can do anything on edges" ON graph_edges
  FOR ALL
  USING (true)
  WITH CHECK (true);
