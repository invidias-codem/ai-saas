import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { authenticatePartner } from '@/lib/api/partnerAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const auth = await authenticatePartner(req, 'stream:read');
  if (!auth.ok) return auth.response;

  const { taskId } = await params;
  const workspaceId = auth.context.workspaceId;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: Record<string, any>) => {
        const chunk = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      try {
        if (!supabaseAdmin) {
          send('error', { message: 'Backend not configured' });
          controller.close();
          return;
        }

        const admin = supabaseAdmin;
        let seenStatus: string | null = null;
        let seenUpdatedAt: string | null = null;
        let seenAuditIds = new Set<string>();
        let closed = false;

        const close = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };

        req.signal?.addEventListener?.('abort', close, { once: true });

        send('info', { message: 'stream_started', taskId });

        const poll = async () => {
          if (closed) return;

          const { data: task } = await admin
            .from('agent_tasks')
            .select('id,status,result,error,created_at,updated_at,completed_at')
            .eq('id', taskId)
            .maybeSingle();

          if (task) {
            if (seenStatus !== task.status || seenUpdatedAt !== task.updated_at) {
              seenStatus = task.status;
              seenUpdatedAt = task.updated_at;
              const payload: any = {
                id: task.id,
                status: task.status,
                result: task.result,
                error: task.error,
                updated_at: task.updated_at,
                completed_at: task.completed_at,
              };

              if (task.status === 'pending_approval' && task.result) {
                try {
                  payload.promotionState = JSON.parse(task.result);
                } catch {
                  payload.promotionState = null;
                }
              }

              send('task.update', payload);
            }
          }

          const { data: auditRows } = await admin
            .from('audit_log')
            .select('id,event_type,decision,trace_id,payload,created_at')
            .eq('trace_id', `task-${taskId}`)
            .order('created_at', { ascending: true });

          for (const row of auditRows ?? []) {
            if (!seenAuditIds.has(row.id)) {
              seenAuditIds.add(row.id);
              send('audit.row', {
                id: row.id,
                event_type: row.event_type,
                decision: row.decision,
                trace_id: row.trace_id,
                payload: row.payload,
                created_at: row.created_at,
              });
            }
          }

          if (task && ['completed', 'failed'].includes(task.status)) {
            close();
            return;
          }
        };

        await poll();
      } catch (e: any) {
        send('error', { message: e?.message ?? 'stream failed' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}
