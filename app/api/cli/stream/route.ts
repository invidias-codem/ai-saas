// app/api/cli/stream/route.ts
// Raw SSE stream for the Lattice OS terminal client.
// Reuses UCOL reasoning + tooling, but strips browser middleware.
//
// Auth: Bearer ${LATTICE_CLI_TOKEN}
// Query: ?prompt=...&task_type=...
//
// Event format:
//   event: meta
//   data: {"taskId":"...","traceId":"...","model":"gemini-2.5-flash"}
//
//   event: thought
//   data: {"step":1,"text":"..."}
//
//   event: tool
//   data: {"name":"gh_commits","status":"success","latencyMs":123,"outputSize":456}
//
//   event: error
//   data: {"message":"...","phase":"..."}
//
//   event: done
//   data: {"status":"completed","durationMs":1234,"traceId":"..."}

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { startUcolSpan } from '@/lib/ucol/observability/span';
import { SPAN_ATTRS } from '@/lib/ucol/observability/span';
import { exportTaskTraceToOpik } from '@/lib/telemetry/opikExporter';
import { auditEnterprise } from '@/lib/security/auditLog';
import { runReActLoop } from '@/lib/agents/core/reactLoop';
import { ToolRegistry } from '@/lib/agents/core/registry';
import { ghCommitsTool } from '@/lib/agents/tools/ghCommits';
import { createBlogPrTool } from '@/lib/agents/tools/createBlogPr';
import { webSearchTool } from '@/lib/agents/tools/webSearch';
import { readFileTool } from '@/lib/agents/tools/harnessTools';
import { searchCodebaseTool } from '@/lib/agents/tools/searchCodebase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LATTICE_CLI_TOKEN = process.env.LATTICE_CLI_TOKEN || '';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length).trim();
  return null;
}

export async function GET(req: NextRequest) {
  const provided = getBearerToken(req);
  if (!LATTICE_CLI_TOKEN || !provided || provided !== LATTICE_CLI_TOKEN) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = new URL(req.url);
  const prompt = url.searchParams.get('prompt')?.trim();
  const taskType = url.searchParams.get('task_type')?.trim() || 'blog_post';
  const userId = url.searchParams.get('user_id')?.trim() || 'cli-user';

  if (!prompt) {
    return new NextResponse('Missing prompt', { status: 400 });
  }

  const taskId = randomUUID();
  const traceId = randomUUID();
  const createdAtMs = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      const sendError = (message: string, phase: string) => {
        send('error', { message, phase, timestamp: Date.now() });
        try { controller.close(); } catch { }
      };

      const span = startUcolSpan({
        name: 'cli.stream',
        traceId,
        userId,
        metadata: { taskId, taskType, surface: 'cli-terminal' },
      });
      span.setAttribute(SPAN_ATTRS.taskType, taskType);
      span.setAttribute(SPAN_ATTRS.surface, 'cli-terminal');

      // Insert task row
      if (supabaseAdmin) {
        await supabaseAdmin.from('agent_tasks').insert({
          id: taskId,
          user_id: userId,
          workspace_id: 'cli',
          task_type: taskType,
          input: prompt,
          status: 'queued',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      send('meta', { taskId, traceId, model: 'gemini-2.5-flash', taskType });

      try {
        const registry = new ToolRegistry();
        registry.register(ghCommitsTool);
        registry.register(createBlogPrTool);
        registry.register(webSearchTool);
        registry.register(readFileTool);
        registry.register(searchCodebaseTool);

        const agentContext = {
          userId,
          sessionId: `cli-${taskId}`,
          workspaceId: 'cli',
          history: [],
          enableTelemetry: true,
          rootSpan: span,
          onStep: (step: any) => {
            send('thought', {
              step: step.stepNumber,
              text: String(step.thought ?? '').slice(0, 200),
            });
          },
        };

        // Wrap tool execution to emit child span events
        const originalExecute = registry.executeTool.bind(registry);
        registry.executeTool = async (name: string, input: any, context: any) => {
          const toolStart = Date.now();
          const childSpan = span.startChild({ name: `tool:${name}` });
          try {
            const result = await originalExecute(name, input, context);
            const latencyMs = Date.now() - toolStart;
            const outputSize = typeof result?.data === 'string' ? result.data.length : JSON.stringify(result?.data ?? {}).length;
            send('tool', { name, status: result?.success ? 'success' : 'error', latencyMs, outputSize, error: result?.error });
            childSpan.end({ metadata: { status: result?.success ? 'success' : 'error', latencyMs, outputSize } });
            return result;
          } catch (err: any) {
            const latencyMs = Date.now() - toolStart;
            send('tool', { name, status: 'error', latencyMs, outputSize: 0, error: err.message });
            childSpan.fail(err.message ?? String(err), { latencyMs });
            throw err;
          }
        };

        const reactResult = await runReActLoop(prompt, agentContext, registry, 'gemini-2.5-flash');

        const durationMs = Date.now() - createdAtMs;
        const isSuccess = reactResult.status === 'success';

        if (supabaseAdmin) {
          await supabaseAdmin.from('agent_tasks').update({
            status: isSuccess ? 'completed' : 'failed',
            result: reactResult.answer,
            error: isSuccess ? null : reactResult.answer,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', taskId);
        }

        span.end({ responseLength: reactResult.answer.length });
        void exportTaskTraceToOpik({
          traceId,
          workspaceId: 'cli',
          orgId: '',
          taskType,
          memoryNodeIds: [],
          executionSteps: reactResult.trajectory?.length ?? 0,
          interceptedCount: 0,
          durationMs,
        });
        void auditEnterprise(
          isSuccess ? 'agent.task.completed' : 'agent.task.failed',
          userId,
          { taskId, taskType, responseLength: reactResult.answer.length, reactStatus: reactResult.status, ...(isSuccess ? {} : { error: reactResult.answer }) },
          {
            orgId: undefined,
            actorId: userId,
            eventType: isSuccess ? 'task.completed' : 'task.failed',
            traceId,
            decision: isSuccess ? 'ALLOW' : 'DENY',
            payload: { reactStatus: reactResult.status, ...(isSuccess ? {} : { reason: reactResult.answer }) },
          }
        );

        send('done', { status: isSuccess ? 'completed' : 'failed', durationMs, traceId, result: reactResult.answer });
      } catch (err: any) {
        const message = err.message || 'Stream error';
        span.fail(message);
        sendError(message, 'stream');
      } finally {
        try { controller.close(); } catch { }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
