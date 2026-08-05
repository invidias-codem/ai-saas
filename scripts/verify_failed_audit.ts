import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const client = createClient(url, key);

const taskId = '2687370e-5e06-4a22-a0cf-98cb012aa107';

(async () => {
  const { data, error } = await client
    .from('audit_log')
    .select('id, actor_id, event_type, harness, decision, trace_id, payload, created_at')
    .eq('trace_id', taskId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('QUERY_ERROR', error.message);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  process.exit(data && data.length > 0 ? 0 : 2);
})();
