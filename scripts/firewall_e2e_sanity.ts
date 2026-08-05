import { createClient } from '@supabase/supabase-js';
import { interceptTool } from '@/lib/ucol/contextFirewall';
import { auditEnterprise } from '@/lib/security/auditLog';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const client = createClient(url, key);

const orgId = '00000000-0000-0000-0000-000000000002';
const userId = 'test-user';
const sessionId = 'e2e-sanity-' + Date.now();
const orgContext = { orgId, userId, permissions: [] };

(async () => {
  const result = interceptTool({ harness: 'gh', command: ['gh', 'issue', 'list'], args: [], orgContext });
  console.log('INTERCEPTION', JSON.stringify(result, null, 2));

  if (result.decision === 'deny') {
    auditEnterprise(
      'tool.intercepted',
      userId,
      { harness: 'gh', input: { args: ['issue', 'list'] }, reason: result.reason ?? 'tool_intercepted' },
      {
        orgId: orgContext.orgId,
        actorId: userId,
        eventType: 'tool.intercepted',
        harness: 'gh',
        decision: 'DENY',
        traceId: sessionId,
        payload: { input: { args: ['issue', 'list'] }, reason: result.reason ?? 'tool_intercepted' },
      }
    );

    await new Promise((r) => setTimeout(r, 1000));

    const { data, error } = await client
      .from('audit_log')
      .select('id, org_id, actor_id, event_type, harness, decision, trace_id, payload, created_at')
      .eq('event_type', 'tool.intercepted')
      .eq('trace_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('QUERY_ERROR', error.message);
      process.exit(1);
    }
    console.log('AUDIT_ROW', JSON.stringify(data, null, 2));
    process.exit(data && data.length === 1 ? 0 : 2);
  } else {
    console.error('Expected deny, got', result.decision);
    process.exit(1);
  }
})();
