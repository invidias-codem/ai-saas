/**
 * lib/telemetry/opikExporter.ts
 *
 * Ships structured task execution summaries to Opik for trace
 * evaluation, regression logging, and dashboard correlation.
 *
 * This is intentionally non-blocking: callers use `void exportTaskTraceToOpik(...)`
 * so telemetry never impacts SSE/TTY response latency.
 */

export interface OpikTracePayload {
  traceId: string;
  workspaceId: string;
  orgId: string;
  taskType: string;
  memoryNodeIds: string[];
  executionSteps: number;
  interceptedCount: number;
  durationMs: number;
}

export async function exportTaskTraceToOpik(payload: OpikTracePayload): Promise<void> {
  const OPIK_ENDPOINT = process.env.OPIK_API_ENDPOINT;
  const OPIK_API_KEY = process.env.OPIK_API_KEY;

  if (!OPIK_ENDPOINT || !OPIK_API_KEY) return;

  try {
    await fetch(`${OPIK_ENDPOINT}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPIK_API_KEY}`,
      },
      body: JSON.stringify({
        id: payload.traceId,
        name: `UCOL Task Exec: ${payload.taskType}`,
        metadata: {
          workspace_id: payload.workspaceId,
          org_id: payload.orgId,
          memory_node_ids: payload.memoryNodeIds,
          execution_steps: payload.executionSteps,
          intercepted_count: payload.interceptedCount,
          duration_ms: payload.durationMs,
        },
        tags: ['lattice-os', payload.taskType],
      }),
    });
  } catch {
    // swallow to preserve stream velocity
  }
}
