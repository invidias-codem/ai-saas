// lib/telemetry.ts
// Non-blocking telemetry logger for Lattice OS funnel metrics.
// Uses Vercel's waitUntil() to fire Supabase inserts asynchronously —
// adds 0ms to critical path latency.

import { supabaseAdmin } from "@/lib/supabaseClient";

export type TelemetryEventType =
  | "delta_detected"
  | "plg_nudge_shown"
  | "stripe_checkout_initiated"
  | "stripe_checkout_completed"
  | "debate_round_completed"
  | "debate_loop_accepted"
  | "bluesky_draft_created"
  | "bluesky_draft_approved"
  | "bluesky_draft_rejected"
  | "landing_variant_viewed";

export interface TelemetryPayload {
  eventType: TelemetryEventType;
  userId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Logs a telemetry event asynchronously.
 * Never blocks the critical path — errors are silently swallowed.
 */
export function logEvent(payload: TelemetryPayload): void {
  const { eventType, userId, workspaceId, metadata = {} } = payload;

  // If we're not in a Vercel environment with waitUntil, fall back to fire-and-forget
  const fireAsync = async () => {
    try {
      if (!supabaseAdmin) return;
      await supabaseAdmin.from("telemetry_events").insert({
        event_type: eventType,
        user_id: userId,
        workspace_id: workspaceId,
        metadata,
      });
    } catch (err) {
      // Silently swallow — telemetry must never crash the app
      console.error("[telemetry:error]", err);
    }
  };

  // Use waitUntil if available (Vercel serverless), otherwise fire-and-forget
  if (typeof (globalThis as any).waitUntil === "function") {
    (globalThis as any).waitUntil(fireAsync());
  } else {
    fireAsync().catch(() => {});
  }
}
