import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { auditEnterprise } from '@/lib/security/auditLog';
import { startUcolSpan } from '@/lib/ucol/observability/span';
import { exportTaskTraceToOpik } from '@/lib/telemetry/opikExporter';
import { join } from 'path';

export const dynamic = 'force-dynamic';

interface PromoteRequestBody {
  decision: 'approve' | 'reject';
  artifacts?: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const taskId = params.taskId;
  const auth = await authenticatePartner(req, 'stream:read');
  if (!auth.ok) return auth.response;

  const { workspaceId, userId } = auth.context;
  const body = (await req.json().catch(() => null)) as PromoteRequestBody | null;
  if (!body || !['approve', 'reject'].includes(body.decision)) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: 'decision must be approve or reject' } },
      { status: 400 },
    );
  }

  const span = startUcolSpan({
    name: 'task.promote',
    'task.id': taskId,
    'task.workspace_id': workspaceId,
    'task.decision': body.decision,
  });

  const createdAtMs = Date.now();

  try {
    const { data: task, error: taskError } = await supabaseAdmin!
      .from('agent_tasks')
      .select('id, status, result, workspace_id, user_id, task_type, metadata')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      span.end({ status: 'not_found' });
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Task not found' } },
        { status: 404 },
      );
    }

    if (task.workspace_id !== workspaceId) {
      span.end({ status: 'forbidden' });
      return NextResponse.json(
        { error: { code: 'forbidden', message: 'Task does not belong to workspace' } },
        { status: 403 },
      );
    }

    if (task.status !== 'pending_approval') {
      return NextResponse.json(
        { error: { code: 'invalid_status', message: `Task is not pending approval: ${task.status}` } },
        { status: 409 },
      );
    }

    let promotionState: any = null;
    try {
      promotionState = task.result ? JSON.parse(task.result) : null;
    } catch {
      promotionState = null;
    }

    if (body.decision === 'reject') {
      const { error: updateError } = await supabaseAdmin!
        .from('agent_tasks')
        .update({
          status: 'failed',
          error: 'promotion rejected by operator',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (updateError) {
        throw updateError;
      }

      void auditEnterprise(
        'agent.task.pending_approval',
        userId,
        { taskId, taskType: task.task_type, decision: 'reject' },
        {
          orgId: (task.metadata as any)?.orgId,
          actorId: userId,
          eventType: 'task.promotion_rejected',
          traceId: span.traceId,
          decision: 'DENY',
          payload: { taskId, sessionId: promotionState?.sessionId },
        }
      );

      span.end({ status: 'rejected' });
      void exportTaskTraceToOpik({
        traceId: span.traceId,
        workspaceId,
        orgId: (task.metadata as any)?.orgId ?? '',
        taskType: task.task_type,
        memoryNodeIds: [],
        executionSteps: 0,
        interceptedCount: 0,
        durationMs: Date.now() - createdAtMs,
      });

      return NextResponse.json({
        id: taskId,
        status: 'failed',
        message: 'Promotion rejected by operator.',
      });
    }

    if (!promotionState || !Array.isArray(promotionState.artifacts)) {
      return NextResponse.json(
        { error: { code: 'invalid_promotion_state', message: 'No artifacts available for approval.' } },
        { status: 400 },
      );
    }

    const approvedPaths = (body.artifacts || promotionState.artifacts.map((a: any) => a.relativePath)).filter(
      (p: string) => promotionState.artifacts.some((a: any) => a.relativePath === p),
    );

    if (approvedPaths.length === 0) {
      return NextResponse.json(
        { error: { code: 'invalid_artifacts', message: 'No valid artifacts selected for approval.' } },
        { status: 400 },
      );
    }

    const { mkdir, writeFile } = await import('fs/promises');
    const { dirname } = await import('path');
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? '/tmp/workspace';

    for (const relPath of approvedPaths) {
      const meta = promotionState.artifacts.find((a: any) => a.relativePath === relPath);
      if (!meta) continue;

      const destPath = join(workspaceRoot, relPath);
      await mkdir(dirname(destPath), { recursive: true });

      let content: Buffer;
      if (typeof meta.absPath === 'string' && meta.absPath.startsWith('https://')) {
        const res = await fetch(meta.absPath);
        content = Buffer.from(await res.arrayBuffer());
      } else {
        const { readFile } = await import('fs/promises');
        content = await readFile(meta.absPath);
      }

      await writeFile(destPath, content, { mode: 0o644 });
    }

    const { data: approval, error: approvalError } = await supabaseAdmin!
      .from('agent_approvals')
      .insert({
        task_id: taskId,
        workspace_id: workspaceId,
        user_id: userId,
        approved_paths: approvedPaths,
        all_paths: promotionState.artifacts.map((a: any) => a.relativePath),
        status: 'approved',
        metadata: {
          sessionId: promotionState.sessionId,
          artifactCount: promotionState.artifacts.length,
          approvedCount: approvedPaths.length,
        },
      })
      .select()
      .single();

    if (approvalError || !approval) {
      throw approvalError ?? new Error('Failed to record approval');
    }

    const { error: updateError } = await supabaseAdmin!
      .from('agent_tasks')
      .update({
        status: 'completed',
        result: 'Operator approved artifacts. Approved paths: ' + approvedPaths.join(', '),
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      throw updateError;
    }

    void auditEnterprise(
      'agent.task.pending_approval',
      userId,
      { taskId, taskType: task.task_type, decision: 'approve', approvedCount: approvedPaths.length },
      {
        orgId: (task.metadata as any)?.orgId,
        actorId: userId,
        eventType: 'task.promotion_approved',
        traceId: span.traceId,
        decision: 'ALLOW',
        payload: {
          taskId,
          sessionId: promotionState.sessionId,
          approvedPaths,
          approvalId: approval.id,
        },
      }
    );

    span.end({ status: 'approved' });
    void exportTaskTraceToOpik({
      traceId: span.traceId,
      workspaceId,
      orgId: (task.metadata as any)?.orgId ?? '',
      taskType: task.task_type,
      memoryNodeIds: [],
      executionSteps: 0,
      interceptedCount: 0,
      durationMs: Date.now() - createdAtMs,
    });

    return NextResponse.json({
      id: taskId,
      status: 'completed',
      approvalId: approval.id,
      approvedPaths,
      message: 'Artifacts approved and task completed.',
    });
  } catch (error: any) {
    console.error('[Promote] Error:', error);
    span.end({ error: error.message });
    return NextResponse.json(
      { error: { code: 'server_error', message: 'Promotion failed.' } },
      { status: 500 },
    );
  }
}
