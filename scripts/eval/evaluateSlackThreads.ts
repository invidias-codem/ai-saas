import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { supabaseAdmin } from "@/lib/supabaseClient";
import { exportTaskTraceToOpik } from "@/lib/telemetry/opikExporter";
import { AgentToolCorrectnessJudge, AgentTaskCompletionJudge } from "@/lib/telemetry/evaluationJudge";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const COOLDOWN_MINUTES = Number(process.env.EVAL_COOLDOWN_MINUTES ?? 5);
const BATCH_LIMIT = Number(process.env.EVAL_BATCH_LIMIT ?? 20);
const OPIK_ENDPOINT = process.env.OPIK_API_ENDPOINT;
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const EVAL_MODEL_VERSION = process.env.EVAL_MODEL_VERSION || 'gpt-4o-mini';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TerminatedThreadRow {
  id: string;
  created_at: string;
  metadata: {
    trace_id?: string;
    slack_team_id?: string;
    slack_channel?: string;
    slack_thread_ts?: string;
    terminated_at?: string;
  };
  workspace_id?: string;
  user_id?: string;
}

interface OpikTrace {
  id: string;
  name?: string;
  metadata?: Record<string, any>;
  tags?: string[];
}

interface MetricEvent {
  event_type: string;
  operation_type: string;
  path_accessed: string | null;
  success: boolean;
  duration_ms: number;
  user_id: string | null;
  workspace_id: string | null;
  metadata: Record<string, any>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cooldownCutoff(): string {
  return new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
}

async function fetchTerminatedThreads(): Promise<TerminatedThreadRow[]> {
  if (!supabaseAdmin) return [];

  const cutoff = cooldownCutoff();
  const { data, error } = await supabaseAdmin
    .from('harness_telemetry_events')
    .select('*')
    .eq('event_type', 'thread_terminated')
    .lt('created_at', cutoff)
    .is('metadata->>evaluated', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error('[eval] failed to fetch terminated threads:', error);
    return [];
  }

  return (data as TerminatedThreadRow[]) || [];
}

async function fetchOpikTrace(traceId: string): Promise<OpikTrace | null> {
  if (!OPIK_ENDPOINT || !OPIK_API_KEY) return null;

  try {
    const res = await fetch(`${OPIK_ENDPOINT}/v1/traces/${encodeURIComponent(traceId)}`, {
      headers: {
        Authorization: `Bearer ${OPIK_API_KEY}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    return (await res.json()) as OpikTrace;
  } catch {
    return null;
  }
}

async function patchOpikTraceWithScores(traceId: string, scores: Record<string, any>): Promise<void> {
  if (!OPIK_ENDPOINT || !OPIK_API_KEY) return;

  try {
    await fetch(`${OPIK_ENDPOINT}/v1/traces/${encodeURIComponent(traceId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPIK_API_KEY}`,
      },
      body: JSON.stringify({
        metadata: {
          evaluation: scores,
        },
      }),
    });
  } catch {
    // never block evaluation on telemetry issues
  }
}

async function markThreadEvaluated(rowId: string): Promise<void> {
  if (!supabaseAdmin) return;

  await supabaseAdmin
    .from('harness_telemetry_events')
    .update({
      metadata: {
        evaluated: true,
        evaluated_at: new Date().toISOString(),
      },
    })
    .eq('id', rowId);
}

/* ------------------------------------------------------------------ */
/*  Metrics batching                                                   */
/* ------------------------------------------------------------------ */

const metricBatch: MetricEvent[] = [];

function recordMetric(event: Omit<MetricEvent, 'event_type'> & { event_type: string }) {
  metricBatch.push({
    event_type: event.event_type,
    operation_type: event.operation_type,
    path_accessed: event.path_accessed,
    success: event.success,
    duration_ms: event.duration_ms,
    user_id: event.user_id ?? null,
    workspace_id: event.workspace_id ?? null,
    metadata: event.metadata,
  });
}

function baseMetric(overrides: Partial<MetricEvent>): MetricEvent {
  return {
    event_type: 'evaluation_metric',
    operation_type: 'background_worker',
    path_accessed: null,
    success: true,
    duration_ms: 0,
    user_id: null,
    workspace_id: null,
    metadata: {},
    ...overrides,
  };
}

async function flushMetrics(): Promise<void> {
  if (!supabaseAdmin || metricBatch.length === 0) return;

  const records = metricBatch.map((m) => ({
    user_id: m.user_id,
    workspace_id: m.workspace_id,
    event_type: m.event_type,
    operation_type: m.operation_type,
    path_accessed: m.path_accessed,
    success: m.success,
    duration_ms: m.duration_ms,
    metadata: m.metadata,
    created_at: new Date().toISOString(),
  }));

  metricBatch.length = 0;

  try {
    await supabaseAdmin.from('harness_telemetry_events').insert(records);
  } catch (error) {
    console.error('[eval] failed to flush metrics:', error);
  }
}

/* ------------------------------------------------------------------ */
/*  Judge runners                                                     */
/* ------------------------------------------------------------------ */

async function evaluateThread(row: TerminatedThreadRow): Promise<Record<string, any>> {
  const traceId = row.metadata.trace_id;
  if (!traceId) return { skipped: true, reason: 'missing_trace_id' };

  const trace = await fetchOpikTrace(traceId);
  if (!trace) return { skipped: true, reason: 'missing_opik_trace', traceId };

  const metadata = trace.metadata || {};
  const availableTools: string[] = Array.isArray(metadata.available_tools) ? metadata.available_tools : [];
  const toolCalls: Array<{ tool: string; arguments: Record<string, any>; success: boolean }> = Array.isArray(metadata.tool_calls)
    ? metadata.tool_calls
    : [];

  const startedAt = Date.now();
  let toolError: { judge: string; message: string; status_code?: number } | null = null;
  let taskError: { judge: string; message: string; status_code?: number } | null = null;

  let toolResult: ReturnType<typeof AgentToolCorrectnessJudge> = { score: 0, reasoning: '', hallucinatedArgs: false, unsupportedTool: false, environmentMismatch: false };
  let taskResult: ReturnType<typeof AgentTaskCompletionJudge> = { score: 0, goalAchieved: false, missingSteps: [], unnecessarySteps: [], notes: '' };

  try {
    toolResult = await AgentToolCorrectnessJudge({
      userQuery: String(metadata.user_query ?? metadata.slack_user ?? ''),
      availableTools,
      toolCalls,
      selectedHarness: metadata.selected_harness,
    });
  } catch (error: any) {
    toolError = {
      judge: 'AgentToolCorrectnessJudge',
      message: error?.message || String(error),
      status_code: error?.statusCode || error?.status || null,
    };
  }

  try {
    taskResult = await AgentTaskCompletionJudge({
      userQuery: String(metadata.user_query ?? metadata.slack_user ?? ''),
      finalAnswer: String(metadata.final_answer ?? ''),
      trajectorySteps: Number(metadata.execution_steps ?? 0),
      executionErrors: Number(metadata.execution_errors ?? 0),
      harnessSelectionReason: metadata.selection_reason,
    });
  } catch (error: any) {
    taskError = {
      judge: 'AgentTaskCompletionJudge',
      message: error?.message || String(error),
      status_code: error?.statusCode || error?.status || null,
    };
  }

  const durationMs = Date.now() - startedAt;
  const terminatedAt = row.metadata.terminated_at ? new Date(row.metadata.terminated_at).getTime() : null;
  const retryLagMs = terminatedAt ? Date.now() - terminatedAt : null;

  if (toolError) {
    recordMetric(baseMetric({
      event_type: 'evaluation_failure',
      operation_type: 'AgentToolCorrectnessJudge',
      path_accessed: row.metadata.slack_channel || null,
      success: false,
      duration_ms: durationMs,
      workspace_id: row.workspaceId || undefined,
      user_id: row.userId || undefined,
      metadata: {
        trace_id: traceId,
        judge_type: 'AgentToolCorrectnessJudge',
        model_version: EVAL_MODEL_VERSION,
        workspace_id: row.workspaceId || undefined,
        error: toolError.message,
        error_status_code: toolError.status_code,
      },
    }));
  }

  if (taskError) {
    recordMetric(baseMetric({
      event_type: 'evaluation_failure',
      operation_type: 'AgentTaskCompletionJudge',
      path_accessed: row.metadata.slack_channel || null,
      success: false,
      duration_ms: durationMs,
      workspace_id: row.workspaceId || undefined,
      user_id: row.userId || undefined,
      metadata: {
        trace_id: traceId,
        judge_type: 'AgentTaskCompletionJudge',
        model_version: EVAL_MODEL_VERSION,
        workspace_id: row.workspaceId || undefined,
        error: taskError.message,
        error_status_code: taskError.status_code,
      },
    }));
  }

  if (retryLagMs !== null) {
    recordMetric(baseMetric({
      event_type: 'evaluation_retry_lag_ms',
      operation_type: 'background_worker',
      path_accessed: row.metadata.slack_channel || null,
      success: true,
      duration_ms: retryLagMs,
      workspace_id: row.workspaceId || undefined,
      user_id: row.userId || undefined,
      metadata: {
        trace_id: traceId,
        judge_type: 'end_to_end',
        model_version: EVAL_MODEL_VERSION,
        workspace_id: row.workspaceId || undefined,
        retry_lag_ms: retryLagMs,
      },
    }));
  }

  const scores = {
    toolCorrectness: toolResult,
    taskCompletion: taskResult,
    evaluatedAt: new Date().toISOString(),
  };

  try {
    void exportTaskTraceToOpik({
      traceId,
      workspaceId: row.workspaceId || row.metadata.slack_channel || 'unknown',
      orgId: '',
      taskType: 'slack_event_eval',
      memoryNodeIds: [],
      executionSteps: Number(metadata.execution_steps ?? 0),
      interceptedCount: 0,
      durationMs: 0,
      metadata: {
        ...metadata,
        evaluation: scores,
      },
      tags: trace.tags ? [...trace.tags, 'evaluated'] : ['evaluated'],
    });
  } catch {
    // swallow
  }

  return scores;
}

/* ------------------------------------------------------------------ */
/*  Main loop                                                         */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`[eval] starting evaluation run; cooldown=${COOLDOWN_MINUTES}m batch=${BATCH_LIMIT}`);

  const threads = await fetchTerminatedThreads();
  console.log(`[eval] found ${threads.length} terminated thread(s)`);

  let processedSuccess = 0;
  let processedFailed = 0;

  for (const row of threads) {
    try {
      const scores = await evaluateThread(row);
      await patchOpikTraceWithScores(row.metadata.trace_id!, scores);
      await markThreadEvaluated(row.id);
      processedSuccess += 1;
      console.log(`[eval] scored trace ${row.metadata.trace_id}:`, JSON.stringify(scores).slice(0, 200));
    } catch (err) {
      processedFailed += 1;
      console.error(`[eval] failed for ${row.id}:`, err);

      recordMetric(baseMetric({
        event_type: 'evaluation_failure',
        operation_type: 'worker_main_loop',
        path_accessed: row.metadata.slack_channel || null,
        success: false,
        duration_ms: 0,
        workspace_id: row.workspaceId || undefined,
        user_id: row.userId || undefined,
        metadata: {
          trace_id: row.metadata.trace_id,
          judge_type: 'worker_main_loop',
          model_version: EVAL_MODEL_VERSION,
          workspace_id: row.workspaceId || undefined,
          error: (err as Error)?.message || String(err),
        },
      }));
    }
  }

  recordMetric(baseMetric({
    event_type: 'evaluation_throughput_total',
    operation_type: 'background_worker',
    path_accessed: null,
    success: true,
    duration_ms: 0,
    metadata: {
      processed_success: processedSuccess,
      processed_failed: processedFailed,
      batch_limit: BATCH_LIMIT,
      cooldown_minutes: COOLDOWN_MINUTES,
      model_version: EVAL_MODEL_VERSION,
    },
  }));

  await flushMetrics();
  console.log('[eval] run complete');
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
