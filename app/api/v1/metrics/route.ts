/**
 * GET /api/v1/metrics — Lightweight Prometheus-style metrics exporter.
 *
 * Exposes text exposition metrics derived from durable runtime telemetry:
 * - task counts by status
 * - firewall intercept count/rate
 * - tool execution counts, fail counts, latency summary
 * - token velocity from recent audit payloads
 *
 * Note: this intentionally avoids heavy libraries and stays small enough to
 * remain a serverless-friendly dynamic route under Vercel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

function gauge(name: string, value: number, labels: Record<string, string> = {}) {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(',');
  return labelStr ? `${name}{${labelStr}} ${value}` : `${name} ${value}`;
}

export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req, 'memory:read');
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const workspaceId = auth.context.workspaceId;

  const [
    taskStatusResult,
    interceptResult,
    toolExecResult,
    recentTasksResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('agent_tasks')
      .select('status', { count: 'exact', head: false })
      .eq('workspace_id', workspaceId),
    supabaseAdmin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('event_type', 'tool.intercepted'),
    supabaseAdmin
      .from('audit_log')
      .select('id, event_type, payload', { count: 'exact', head: false })
      .eq('workspace_id', workspaceId)
      .in('event_type', ['tool.executed', 'tool.failed'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('agent_tasks')
      .select('status, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const taskRows = (taskStatusResult.data ?? []) as Array<{ status: string }>;
  const taskStatusCounts = taskRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  const interceptCount = interceptResult.count ?? 0;

  const toolRows = (toolExecResult.data ?? []) as Array<{ id: string; event_type: string; payload: any }>;
  const executedCount = toolRows.filter(r => r.event_type === 'tool.executed').length;
  const failedCount = toolRows.filter(r => r.event_type === 'tool.failed').length;

  const latencies = toolRows
    .map(r => (r.payload?.durationMs ? Number(r.payload.durationMs) : null))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const toolLatencyP50 = latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.5)] : null;
  const toolLatencyP95 = latencies.length ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] : null;

  const recentTasks = (recentTasksResult.data ?? []) as Array<{ status: string; created_at: string; updated_at: string }>;
  const last5 = recentTasks.slice(0, 5).map(t => ({ status: t.status, updated_at: t.updated_at }));

  const lines: string[] = [];
  lines.push('# Lattice OS v1 metrics for workspace');
  lines.push('# timestamp=' + new Date().toISOString());
  lines.push('');

  lines.push(gauge('lattice_workspace_tasks_total', Object.values(taskStatusCounts).reduce((a, b) => a + b, 0), { workspace: workspaceId }));
  for (const [status, count] of Object.entries(taskStatusCounts)) {
    lines.push(gauge('lattice_workspace_tasks_by_status', count, { workspace: workspaceId, status }));
  }

  lines.push(gauge('lattice_workspace_intercept_total', interceptCount, { workspace: workspaceId }));
  lines.push(gauge('lattice_workspace_tool_executions_total', executedCount, { workspace: workspaceId, event_type: 'tool.executed' }));
  lines.push(gauge('lattice_workspace_tool_failures_total', failedCount, { workspace: workspaceId, event_type: 'tool.failed' }));
  if (toolLatencyP50 != null) lines.push(gauge('lattice_workspace_tool_latency_seconds', Number((toolLatencyP50 / 1000).toFixed(4)), { workspace: workspaceId, quantile: 'p50' }));
  if (toolLatencyP95 != null) lines.push(gauge('lattice_workspace_tool_latency_seconds', Number((toolLatencyP95 / 1000).toFixed(4)), { workspace: workspaceId, quantile: 'p95' }));

  lines.push('');
  lines.push('# tool_latency_ms histogram-style summary for Prometheus/Grafana histogram_quantile');
  const bucketDefs = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  if (latencies.length) {
    for (const le of bucketDefs) {
      const countInBucket = latencies.filter(v => v <= le).length;
      lines.push(gauge('lattice_workspace_tool_latency_ms_bucket', countInBucket, { workspace: workspaceId, le: String(le) }));
    }
    lines.push(gauge('lattice_workspace_tool_latency_ms_bucket', latencies.length, { workspace: workspaceId, le: '+Inf' }));
    lines.push(gauge('lattice_workspace_tool_latency_ms_sum', latencies.reduce((a, b) => a + b, 0), { workspace: workspaceId }));
    lines.push(gauge('lattice_workspace_tool_latency_ms_count', latencies.length, { workspace: workspaceId }));
  } else {
    for (const le of bucketDefs) {
      lines.push(gauge('lattice_workspace_tool_latency_ms_bucket', 0, { workspace: workspaceId, le: String(le) }));
    }
    lines.push(gauge('lattice_workspace_tool_latency_ms_bucket', 0, { workspace: workspaceId, le: '+Inf' }));
    lines.push(gauge('lattice_workspace_tool_latency_ms_sum', 0, { workspace: workspaceId }));
    lines.push(gauge('lattice_workspace_tool_latency_ms_count', 0, { workspace: workspaceId }));
  }

  lines.push('');
  lines.push('# last_tasks');
  lines.push(JSON.stringify({ last_tasks: last5 }));

  return new NextResponse(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      cache: 'no-store',
    },
  });
}
