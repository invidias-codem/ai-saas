// lib/subscription/interaction-tracker.ts
// Tracks free-tier interactions and triggers nudge at threshold.

import { supabaseAdmin } from "@/lib/supabaseClient";

const NUDGE_THRESHOLD = 20;

export interface TrackingResult {
  count: number;
  shouldNudge: boolean;
}

export async function trackFreeInteraction(userId: string): Promise<TrackingResult> {
  if (!supabaseAdmin) return { count: 0, shouldNudge: false };

  // Atomically increment and return new count via RPC
  const { data, error } = await supabaseAdmin.rpc("increment_free_interaction_count", {
    target_user_id: userId,
  });

  if (error || data === null) {
    console.error("[InteractionTracker] Failed to increment:", error);
    return { count: 0, shouldNudge: false };
  }

  const count = data as number;
  const shouldNudge = count > 0 && count % NUDGE_THRESHOLD === 0;

  return { count, shouldNudge };
}
