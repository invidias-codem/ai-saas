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

  try {
    // This optional UI signal must not hold up the chat response.
    const { data, error } = await supabaseAdmin.rpc("increment_free_interaction_count", {
      target_user_id: userId,
    }).abortSignal(AbortSignal.timeout(1_500));

    if (error || data === null) {
      if (['PGRST202', '42P01', '42703'].includes(error?.code ?? '')) {
        console.warn('[InteractionTracker] Subscription schema unavailable; apply targeted subscription repair', { code: error?.code });
      } else {
        console.warn('[InteractionTracker] Optional tracking unavailable', { code: error?.code ?? 'empty_result' });
      }
      return { count: 0, shouldNudge: false };
    }

    if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
      console.warn('[InteractionTracker] Invalid interaction count');
      return { count: 0, shouldNudge: false };
    }
    return { count: data, shouldNudge: data > 0 && data % NUDGE_THRESHOLD === 0 };
  } catch {
    console.warn('[InteractionTracker] Optional tracking request failed');
    return { count: 0, shouldNudge: false };
  }
}
