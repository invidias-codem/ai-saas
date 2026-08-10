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

  const [toolResult, taskResult] = await Promise.all([
    AgentToolCorrectnessJudge({
      userQuery: String(metadata.user_query ?? metadata.slack_user ?? ''),
      availableTools,
      toolCalls,
      selectedHarness: metadata.selected_harness,
    }),
    AgentTaskCompletionJudge({
      userQuery: String(metadata.user_query ?? metadata.slack_user ?? ''),
      finalAnswer: String(metadata.final_answer ?? ''),
      trajectorySteps: Number(metadata.execution_steps ?? 0),
      executionErrors: Number(metadata.execution_errors ?? 0),
      harnessSelectionReason: metadata.selection_reason,
    }),
  ]);

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

  for (const row of threads) {
    try {
      const scores = await evaluateThread(row);
      await patchOpikTraceWithScores(row.metadata.trace_id!, scores);
      await markThreadEvaluated(row.id);
      console.log(`[eval] scored trace ${row.metadata.trace_id}:`, JSON.stringify(scores).slice(0, 200));
    } catch (err) {
      console.error(`[eval] failed for ${row.id}:`, err);
    }
  }

  console.log('[eval] run complete');
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
