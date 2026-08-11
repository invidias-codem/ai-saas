import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { withMetering } from '@/lib/api/partnerUsage';
import { startUcolSpan } from '@/lib/ucol/observability/span';
import { resolveProviderForMode } from '@/lib/ucol/routing/providerResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import type { UcolRequestPacket } from '@/lib/ucol/routing/types';
import type { AgentMode } from '@/lib/llm/types';
import {
  AgentTaskTypeSchema,
  CreateAgentTaskSchema,
  type AgentTaskType,
  type CreateAgentTask,
  type AgentTaskStatus,
  type AgentTaskRecord,
} from '@/lib/ucol/agentTaskSchema';
import { waitUntil } from '@vercel/functions';
import { SPAN_ATTRS } from '@/lib/ucol/observability/span';
import { auditEnterprise } from '@/lib/security/auditLog';
import { getOrgAccess, type OrgAccess } from '@/lib/security/orgAccess';
import { assembleDynamicContext } from '@/lib/ucol/contextAssembler';
import { exportTaskTraceToOpik } from '@/lib/telemetry/opikExporter';

export const dynamic = 'force-dynamic';

function taskTypeToMode(taskType: AgentTaskType): AgentMode {
  switch (taskType) {
    case 'reasoning':
      return 'reasoning';
    case 'generation':
      return 'quality';
    case 'evaluation':
      return 'agentic';
    case 'transformation':
      return 'fast';
    case 'blog_post':
      return 'quality';
    default:
      return 'fast';
  }
}

function tierToMode(tier: 'fast' | 'balanced' | 'deep' | undefined): AgentMode | undefined {
  if (!tier) return undefined;
  switch (tier) {
    case 'fast':
      return 'fast';
    case 'balanced':
      return 'quality';
    case 'deep':
      return 'reasoning';
    default:
      return undefined;
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req, 'stream:read');
  if (!auth.ok) {
    const internalBlog = req.headers.get('x-cron-blog') === '1';
    const secret = req.headers.get('authorization')?.replace('Bearer ', '')?.trim();
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    if (internalBlog && secret && cronSecret && secret === cronSecret) {
      const body = await req.json().catch(() => ({}));
      const parsed = CreateAgentTaskSchema.safeParse({
        task_type: 'blog_post',
        input: body?.input ?? 'weekly blog post: write about Lattice OS progress and relevant AI news',
        context: body?.context ?? { source: 'vercel-cron', schedule: 'weekly' },
      });
      if (!parsed.success) {
        return NextResponse.json({ error: 'Validation Error', details: parsed.error.flatten() }, { status: 400 });
      }
      const task = parsed.data;
      const taskId = randomUUID();
      const systemWorkspaceId = process.env.SYSTEM_WORKSPACE_ID || '00000000-0000-0000-0000-000000000000';
      const userId = `partner_ws_${systemWorkspaceId}`;
      const now = new Date().toISOString();
      const createdAtMs = Date.now();
      const effectiveMode = taskTypeToMode(task.task_type);

      if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
      }
      const { error: insertError } = await supabaseAdmin.from('agent_tasks').insert({
        id: taskId,
        user_id: userId,
        workspace_id: systemWorkspaceId,
        task_type: task.task_type,
        input: task.input,
        context: task.context ?? null,
        routing_tier: task.routing_tier ?? null,
        model_preference: task.model_preference ?? null,
        status: 'queued',
        created_at: now,
        updated_at: now,
      });
      if (insertError) {
        return NextResponse.json({ error: 'Failed to create task', details: insertError.message }, { status: 500 });
      }

      return withMetering({ keyId: 'cron-blog', workspaceId: systemWorkspaceId, endpoint: '/api/v1/tasks', method: 'POST' }, async () => {
        const controller = new AbortController();
        const signal = controller.signal;
        const disconnected = new Promise<void>((_, reject) => {
          req.signal?.addEventListener?.('abort', () => {
            controller.abort();
            reject(new Error('client_disconnected'));
          }, { once: true });
        });
        await runAgentTask({
          taskId,
          userId,
          workspaceId: systemWorkspaceId,
          taskType: task.task_type,
          input: task.input,
          context: task.context,
          routingTier: task.routing_tier,
          modelPreference: task.model_preference,
          effectiveMode,
          signal,
          orgContext: undefined,
          actorUserId: 'system',
          createdAtMs,
        });
        return {
          result: NextResponse.json({ task_id: taskId, status: 'queued', created_at: now }),
          statusCode: 202,
        };
      });
    }
    return auth.response;
  }

  const controller = new AbortController();
  const signal = controller.signal;
  const disconnected = new Promise<void>((_, reject) => {
    req.signal?.addEventListener?.('abort', () => {
      controller.abort();
      reject(new Error('client_disconnected'));
    }, { once: true });
  });

  return withMetering(
    {
      keyId: auth.context.keyId,
      workspaceId: auth.context.workspaceId,
      endpoint: '/api/v1/tasks',
      method: 'POST',
    },
    async () => {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return { result: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }), statusCode: 400 };
      }

      const parsed = CreateAgentTaskSchema.safeParse(body);
      if (!parsed.success) {
        return {
          result: NextResponse.json({ error: 'Validation Error', details: parsed.error.flatten() }, { status: 400 }),
          statusCode: 400,
        };
      }

      const task = parsed.data;
      const taskId = randomUUID();
      const userId = `partner_ws_${auth.context.workspaceId}`;
      const workspaceId = auth.context.workspaceId;
      const now = new Date().toISOString();
      const createdAtMs = Date.now();

      let orgAccess: OrgAccess | null = null;
      if (supabaseAdmin) {
        const { data: ws } = await supabaseAdmin
          .from('workspaces')
          .select('org_id')
          .eq('id', workspaceId)
          .maybeSingle();

        if (ws?.org_id) {
          orgAccess = await getOrgAccess(ws.org_id, auth.context.userId).catch(() => null);
        }
      }

      const orgContext = orgAccess
        ? { orgId: orgAccess.orgId, userId: orgAccess.userId, role: orgAccess.role, permissions: orgAccess.permissions as string[] }
        : undefined;

      const explicitMode = tierToMode(task.routing_tier);
      const effectiveMode = explicitMode ?? taskTypeToMode(task.task_type);

      if (!supabaseAdmin) {
        return { result: NextResponse.json({ error: 'Backend not configured' }, { status: 500 }), statusCode: 500 };
      }

      const { error: insertError } = await supabaseAdmin.from('agent_tasks').insert({
        id: taskId,
        user_id: userId,
        workspace_id: workspaceId,
        task_type: task.task_type,
        input: task.input,
        context: task.context ?? null,
        routing_tier: task.routing_tier ?? null,
        model_preference: task.model_preference ?? null,
        status: 'queued',
        created_at: now,
        updated_at: now,
      });

      if (insertError) {
        return {
          result: NextResponse.json({ error: 'Failed to create task', details: insertError.message }, { status: 500 }),
          statusCode: 500,
        };
      }

      waitUntil(runAgentTask({
        taskId,
        userId,
        workspaceId,
        taskType: task.task_type,
        input: task.input,
        context: task.context,
        routingTier: task.routing_tier,
        modelPreference: task.model_preference,
        effectiveMode,
        signal,
        orgContext,
        actorUserId: auth.context.userId,
        createdAtMs,
      }));

      return {
        result: NextResponse.json({
          task_id: taskId,
          status: 'queued',
          created_at: now,
        }),
        statusCode: 202,
      };
    }
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req, 'memory:read');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('task_id');

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  let query = supabaseAdmin
    .from('agent_tasks')
    .select('id,task_type,input,status,result,error,created_at,updated_at,completed_at')
    .eq('user_id', `partner_ws_${auth.context.workspaceId}`);

  if (taskId) {
    query = query.eq('id', taskId);
  } else {
    query = query.order('created_at', { ascending: false }).limit(20);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tasks: data ?? [],
    total: (data ?? []).length,
  });
}

async function runAgentTask(input: {
  taskId: string;
  userId: string;
  workspaceId: string;
  taskType: AgentTaskType;
  input: string;
  context?: string;
  routingTier?: string;
  modelPreference?: string;
  effectiveMode: AgentMode;
  signal?: AbortSignal;
  orgContext?: { orgId: string; userId: string; permissions: string[] };
  actorUserId: string;
  createdAtMs: number;
}) {
  const { taskId, userId, workspaceId, taskType, input: taskInput, context, routingTier, modelPreference, effectiveMode, signal, orgContext, actorUserId, createdAtMs } = input;

  const span = startUcolSpan({
    name: 'agent_task.execute',
    userId,
    metadata: { taskId, taskType, surface: 'agent-task' },
  });

  span.setAttribute(SPAN_ATTRS.taskType, taskType);
  span.setAttribute(SPAN_ATTRS.surface, 'background-agent');
  if (routingTier) span.setAttribute(SPAN_ATTRS.routingTier, routingTier);
  if (orgContext?.orgId) span.setAttribute('org.id', orgContext.orgId);

  try {
    await supabaseAdmin!
      .from('agent_tasks')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', taskId);

    const requestPacket: UcolRequestPacket = {
      requestId: taskId,
      userId,
      workspaceId,
      surface: 'background-agent',
      rawInput: taskInput,
      trustContext: {
        canUseExternalActions: Boolean(orgContext?.permissions.includes('external_actions:use')),
        canUseSensitiveTools: Boolean(orgContext?.permissions.includes('sensitive_tools:use')),
        requestSourceTrust: 'system_generated',
      },
      createdAt: new Date().toISOString(),
    };

    const routingDecision = buildInitialRoutingDecision({
      request: requestPacket,
      context: {
        workspaceId,
        operatingProfileId: undefined,
        conversationId: undefined,
        surface: 'background-agent',
        preWorkspace: false,
        workspaceBacked: true,
        operatingProfileResolved: false,
        allowedMemoryScopes: ['conversation', 'workspace', 'user'],
      } as any,
      agentMode: effectiveMode,
      signals: {
        hasAttachments: false,
        messageHistoryCount: 0,
        profile: null,
      },
    });

    const resolved = resolveProviderForMode({
      mode: effectiveMode,
      hasAttachments: false,
    });

    span.setAttribute(SPAN_ATTRS.providerId, resolved.providerId);
    span.setAttribute(SPAN_ATTRS.modelId, resolved.execution.modelId);
    if (modelPreference) span.setAttribute(SPAN_ATTRS.requestedModel, modelPreference);

    const dynamicContextResult = orgContext
      ? await assembleDynamicContext({
          orgContext,
          workspaceId,
          taskPrompt: taskInput,
          tokenBudget: 3500,
        })
      : { context: context ?? null, memoryNodeIds: [] };

    const dynamicSystemPrompt = dynamicContextResult.context;
    const memoryNodeIds = dynamicContextResult.memoryNodeIds;

    if (dynamicSystemPrompt) {
      span.addEvent('context.assembled', {
        'context.budget': 3500,
        'context.hasOrg': Boolean(orgContext),
        'context.memoryNodeIds': memoryNodeIds,
      });
    }

    const agentContext = {
      userId,
      sessionId: `task-${taskId}`,
      workspaceId,
      history: [],
      enableTelemetry: true,
      orgContext,
      onStep: (step: any) => {
        span.addEvent(`agent.step.${step.stepNumber ?? 'x'}`, {
          thought: String(step.thought ?? '').slice(0, 200),
        });
      },
    };

    const useBlogExecution = taskType === 'blog_post';
    const useAgenticExecution = taskType === 'evaluation';

    if (useBlogExecution) {
      const { runReActLoop } = await import('@/lib/agents/core/reactLoop');
      const { ToolRegistry } = await import('@/lib/agents/core/registry');
      const { ghCommitsTool } = await import('@/lib/agents/tools/ghCommits');
      const { createBlogPrTool } = await import('@/lib/agents/tools/createBlogPr');
      const { webSearchTool } = await import('@/lib/agents/tools/webSearch');
      const { readFileTool } = await import('@/lib/agents/tools/harnessTools');
      const { searchCodebaseTool } = await import('@/lib/agents/tools/searchCodebase');

      const registry = new ToolRegistry();
      registry.register(ghCommitsTool);
      registry.register(createBlogPrTool);
      registry.register(webSearchTool);
      registry.register(readFileTool);
      registry.register(searchCodebaseTool);

      const blogPrompt = [
        'You are the Lattice OS Blog Writer.',
        'Your goal is to write a weekly blog post draft about Lattice OS progress and relevant AI news.',
        'Use gh_commits to get recent high-signal commits.',
        'Use web_search to find relevant external AI news.',
        'Use read_file to inspect vision.md and existing blog posts for tone.',
        'Use search_codebase to find shipped features, sprint progress, or changelogs.',
        'When you have enough context, call create_blog_pr with the final MDX post and metadata.',
        'Return the create_blog_pr result exactly, including prUrl and prNumber.',
      ].join('\n');

      const blogAgentContext = {
        ...agentContext,
        sessionId: `blog-${taskId}`,
        rootSpan: span,
      };

      const reactResult = await runReActLoop(blogPrompt, blogAgentContext, registry, resolved.execution.modelId);

      const isSuccess = reactResult.status === 'success';
      await supabaseAdmin!
        .from('agent_tasks')
        .update({
          status: isSuccess ? 'completed' : 'failed',
          result: reactResult.answer,
          error: isSuccess ? null : reactResult.answer,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      span.end({ responseLength: reactResult.answer.length });
      void exportTaskTraceToOpik({
        traceId: span.traceId,
        workspaceId,
        orgId: orgContext?.orgId ?? '',
        taskType,
        memoryNodeIds: [],
        executionSteps: reactResult.trajectory?.length ?? 0,
        interceptedCount: 0,
        durationMs: Date.now() - createdAtMs,
      });
      void auditEnterprise(
        isSuccess ? 'agent.task.completed' : 'agent.task.failed',
        userId,
        { taskId, taskType, routingTier, modelPreference, responseLength: reactResult.answer.length, reactStatus: reactResult.status, ...(isSuccess ? {} : { error: reactResult.answer }) },
        {
          orgId: orgContext?.orgId,
          actorId: actorUserId,
          eventType: isSuccess ? 'task.completed' : 'task.failed',
          traceId: span.traceId,
          decision: isSuccess ? 'ALLOW' : 'DENY',
          payload: { reactStatus: reactResult.status, ...(isSuccess ? {} : { reason: reactResult.answer }) },
        }
      );

      return;
    }

    if (useAgenticExecution) {
      const providerEnv = process.env.MODEL_PROVIDER || process.env.NEXT_PUBLIC_MODEL_PROVIDER;
      if (!providerEnv) {
        const message = 'MODEL_PROVIDER is not set; cannot start agentic execution.';
        span.addEvent('agent.config_error', { message });
        await supabaseAdmin!
          .from('agent_tasks')
          .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
          .eq('id', taskId);

        void auditEnterprise(
          'agent.task.failed',
          userId,
          { taskId, taskType, routingTier, modelPreference, error: message },
          {
            orgId: orgContext?.orgId,
            actorId: actorUserId,
            eventType: 'task.failed',
            traceId: span.traceId,
            decision: 'DENY',
            payload: { reason: message, providerEnv: '' },
          }
        );

        return;
      }
      try {
        const { runReActLoop } = await import('@/lib/agents/core/reactLoop');
        const { ToolRegistry } = await import('@/lib/agents/core/registry');
        const { dealSentinelTool } = await import('@/lib/agents/tools/dealSentinel');
        const { webSearchTool } = await import('@/lib/agents/tools/webSearch');
        const { researchWriterTool } = await import('@/lib/agents/tools/researchWriter');
        const { novelWriterTool } = await import('@/lib/agents/tools/novelWriter');
        const { searchCodebaseTool } = await import('@/lib/agents/tools/searchCodebase');
        const { readFileTool, writeFileTool, patchFileTool } = await import('@/lib/agents/tools/harnessTools');
        const { executeCommandTool } = await import('@/lib/agents/tools/executionTools');
        const { discoverDocumentsTool, extractTextTool, summarizeRepoTool, semanticSearchTool } = await import('@/lib/agents/tools/intelligenceTools');

        const registry = new ToolRegistry();
        registry.register(dealSentinelTool);
        registry.register(webSearchTool);
        registry.register(researchWriterTool);
        registry.register(novelWriterTool);
        registry.register(searchCodebaseTool);
        registry.register(readFileTool);
        registry.register(writeFileTool);
        registry.register(patchFileTool);
        registry.register(executeCommandTool);
        registry.register(discoverDocumentsTool);
        registry.register(extractTextTool);
        registry.register(summarizeRepoTool);
        registry.register(semanticSearchTool);

        const { ghMockTool, dbSelectMockTool } = await import('@/lib/agents/tools/ghMockTool');
        registry.register(ghMockTool);
        registry.register(dbSelectMockTool);

        await registry.registerAutoGeneratedDatabaseTools([
          'workspace_memories',
          'organization_members',
          'audit_log',
        ]);

        const reactResult = await runReActLoop(taskInput, agentContext, registry, resolved.execution.modelId);

        const isSuccess = reactResult.status === 'success';
        await supabaseAdmin!
          .from('agent_tasks')
          .update({
            status: isSuccess ? 'completed' : 'failed',
            result: reactResult.answer,
            error: isSuccess ? null : reactResult.answer,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', taskId);

        span.end({ responseLength: reactResult.answer.length });
        void exportTaskTraceToOpik({
          traceId: span.traceId,
          workspaceId,
          orgId: orgContext?.orgId ?? '',
          taskType,
          memoryNodeIds,
          executionSteps: reactResult.trajectory?.length ?? 0,
          interceptedCount: 0,
          durationMs: Date.now() - createdAtMs,
        });
        void auditEnterprise(
          isSuccess ? 'agent.task.completed' : 'agent.task.failed',
          userId,
          {
            taskId,
            taskType,
            routingTier,
            modelPreference,
            responseLength: reactResult.answer.length,
            reactStatus: reactResult.status,
            ...(isSuccess ? {} : { error: reactResult.answer }),
          },
          {
            orgId: orgContext?.orgId,
            actorId: actorUserId,
            eventType: isSuccess ? 'task.completed' : 'task.failed',
            traceId: span.traceId,
            decision: isSuccess ? 'ALLOW' : 'DENY',
            payload: {
              reactStatus: reactResult.status,
              ...(isSuccess ? {} : { reason: reactResult.answer }),
            },
          }
        );

        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        span.fail(message);
        await supabaseAdmin!
          .from('agent_tasks')
          .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
          .eq('id', taskId);

        void auditEnterprise(
          'agent.task.failed',
          userId,
          { taskId, taskType, error: message },
          {
            orgId: orgContext?.orgId,
            actorId: actorUserId,
            eventType: 'task.failed',
            traceId: span.traceId,
            decision: 'DENY',
            payload: { error: message },
          }
        );
        throw err;
      }
    }

    const messages = [
      { role: 'user' as const, text: taskInput },
      ...(dynamicSystemPrompt ? [{ role: 'system' as const, text: dynamicSystemPrompt }] : []),
    ];

    const result = await resolved.execution.provider.generateStream(messages, undefined, {
      model: modelPreference ?? resolved.execution.modelId,
      temperature: 0.2,
      maxTokens: 4096,
      signal,
    });

    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let stepNumber = 1;
    let cancelled = false;

    if (signal) {
      signal.addEventListener('abort', () => {
        cancelled = true;
        reader.cancel().catch(() => {});
      }, { once: true });
    }

    while (!cancelled) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      span.addEvent(`agent.step.${stepNumber}`, {
        [SPAN_ATTRS.chunkLength]: chunk.length,
        [SPAN_ATTRS.tokenCount]: Math.max(1, Math.ceil(chunk.length / 4)),
      });
      stepNumber += 1;
    }

    span.setAttribute(SPAN_ATTRS.agentStepNumber, stepNumber);
    if (cancelled) {
      span.addEvent('agent.cancelled', { [SPAN_ATTRS.agentStepNumber]: stepNumber });
      span.fail('client_disconnected');
      await supabaseAdmin!
        .from('agent_tasks')
        .update({ status: 'failed', error: 'client_disconnected', updated_at: new Date().toISOString() })
        .eq('id', taskId);

      void auditEnterprise(
        'agent.task.cancelled',
        userId,
        { taskId, taskType, routingTier, modelPreference },
        {
          orgId: orgContext?.orgId,
          actorId: actorUserId,
          eventType: 'task.cancelled',
          traceId: span.traceId,
          decision: 'DENY',
          payload: { reason: 'client_disconnected', stepNumber },
        }
      );

      void exportTaskTraceToOpik({
        traceId: span.traceId,
        workspaceId,
        orgId: orgContext?.orgId ?? '',
        taskType,
        memoryNodeIds,
        executionSteps: Number(stepNumber),
        interceptedCount: 0,
        durationMs: Date.now() - createdAtMs,
      });

      return;
    }

    span.end({ responseLength: fullText.length });
    await supabaseAdmin!
      .from('agent_tasks')
      .update({
        status: 'completed',
        result: fullText,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    void exportTaskTraceToOpik({
      traceId: span.traceId,
      workspaceId,
      orgId: orgContext?.orgId ?? '',
      taskType,
      memoryNodeIds,
      executionSteps: Number(stepNumber),
      interceptedCount: 0,
      durationMs: Date.now() - createdAtMs,
    });
    void auditEnterprise(
      'agent.task.completed',
      userId,
      { taskId, taskType, routingTier, modelPreference, responseLength: fullText.length },
      {
        orgId: orgContext?.orgId,
        actorId: actorUserId,
        eventType: 'task.completed',
        traceId: span.traceId,
        decision: 'ALLOW',
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    span.fail(message);

    await supabaseAdmin!
      .from('agent_tasks')
      .update({
        status: 'failed',
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    void auditEnterprise(
      'agent.task.failed',
      userId,
      { taskId, taskType, error: message },
      {
        orgId: orgContext?.orgId,
        actorId: actorUserId,
        eventType: 'task.failed',
        traceId: span.traceId,
        decision: 'DENY',
      }
    );
  }
}
