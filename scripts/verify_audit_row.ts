import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const client = createClient(url, key);

(async () => {
  const { data, error } = await client
    .from('audit_log')
    .select('id, org_id, actor_id, event_type, harness, decision, trace_id, payload->>reason AS deny_reason, created_at')
    .eq('event_type', 'tool.intercepted')
    .eq('harness', 'gh')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('QUERY_ERROR', error.message);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  process.exit(data && data.length === 1 ? 0 : 2);
})();
