/**
 * lib/telemetry/evaluation.ts
 *
 * Lightweight signaling helpers for the background evaluation pipeline.
 *
 * This file intentionally does not run judges. It only writes lightweight
 * lifecycle events to Supabase that a separate worker can poll. This keeps
 * webhook paths fast and avoids coupling Slack delivery to evaluation cost.
 */

import { supabaseAdmin } from '@/lib/supabaseClient';

export interface ThreadTerminatedPayload {
  traceId: string;
  channel: string;
  threadTs: string;
  teamId: string;
  workspaceId?: string;
  userId?: string;
}

export async function recordThreadTerminated(params: ThreadTerminatedPayload): Promise<void> {
  try {
    if (!supabaseAdmin) return;

    await supabaseAdmin.from('harness_telemetry_events').insert({
      event_type: 'thread_terminated',
      operation_type: 'slack_event',
      path_accessed: params.channel,
      success: true,
      duration_ms: 0,
      user_id: params.userId || null,
      workspace_id: params.workspaceId || null,
      metadata: {
        trace_id: params.traceId,
        slack_team_id: params.teamId,
        slack_channel: params.channel,
        slack_thread_ts: params.threadTs,
        terminated_at: new Date().toISOString(),
      },
    });
  } catch {
    // Never fail live traffic due to lifecycle-tracking issues.
  }
}
