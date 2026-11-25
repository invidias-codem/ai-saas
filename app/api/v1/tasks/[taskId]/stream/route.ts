import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { authenticatePartner } from '@/lib/api/partnerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await authenticatePartner(req, 'stream:read');
  if (!auth.ok) return auth.response;
  const { taskId } = await params;
  const { workspaceId } = auth.context;
  const unavailable = () => NextResponse.json({ error: 'Task not found or not accessible' }, { status: 404 });
  const failed = () => NextResponse.json({ error: 'Task stream unavailable' }, { status: 503 });
  if (!workspaceId || !taskId) return unavailable();
  if (!supabaseAdmin) return failed();

  try {
    // Authenticate the specific resource before emitting even an SSE info event.
    const { data: task, error } = await supabaseAdmin
      .from('agent_tasks')
      .select('id,status,result,error,created_at,updated_at,completed_at')
      .eq('id', taskId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) return failed();
    if (!task) return unavailable();

    // Partner tasks use a workspace-derived service principal. Audit rows must
    // carry that identity and the specific task association; a trace alone is
    // not authorization. Legacy unbound audit rows are deliberately omitted.
    const { data: auditRows, error: auditError } = await supabaseAdmin
      .from('audit_log')
      .select('id,event_type,decision,trace_id,payload,created_at')
      .eq('user_id', `partner_ws_${workspaceId}`)
      .eq('metadata->>taskId', taskId)
      .eq('trace_id', `task-${taskId}`)
      .order('created_at', { ascending: true })
      .limit(200);
    if (auditError) return failed();

    // Existing handler performed a single poll. Return a bounded snapshot and
    // close it; subsequent reads must authenticate again rather than hold an
    // indefinitely open connection with stale key authority.
    const events: string[] = [];
    const send = (event: string, data: unknown) => events.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('info', { message: 'stream_started', taskId });
    let promotionState: unknown = undefined;
    if (task.status === 'pending_approval' && task.result) {
      try { promotionState = JSON.parse(task.result); } catch { promotionState = null; }
    }
    send('task.update', {
      id: task.id, status: task.status, result: task.result, error: task.error,
      updated_at: task.updated_at, completed_at: task.completed_at,
      ...(promotionState !== undefined ? { promotionState } : {}),
    });
    for (const row of auditRows ?? []) send('audit.row', row);
    return new Response(events.join(''), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
    });
  } catch {
    return failed();
  }
}
