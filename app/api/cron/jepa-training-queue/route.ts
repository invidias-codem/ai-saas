/**
 * Cron: JEPA Training Queue Enricher
 *
 * Pulls high-divergence divergence events and enqueues them into
 * `jepa_training_queue` for offline MBRL refinement.
 *
 * Configured via vercel.json crons.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: 'JepaTrainingQueueCron' });
  if (authFailure) return authFailure;

  const startTime = Date.now();
  console.log('[JepaTrainingQueueCron] Starting enqueue run...');

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, error: 'supabase-admin-not-configured' }, { status: 500 });
    }

    const minDivergence = Number(process.env.JEPA_TRAINING_QUEUE_MIN_DIVERGENCE ?? '0.7');
    const batchSize = Number(process.env.JEPA_TRAINING_QUEUE_BATCH_SIZE ?? '50');
    const olderThanMinutes = Number(process.env.JEPA_TRAINING_QUEUE_OLDER_THAN_MINUTES ?? '60');

    const { data: enqueued, error: enqueueError } = await supabaseAdmin.rpc('enqueue_high_divergence_events', {
      min_divergence: minDivergence,
      batch_size: batchSize,
      older_than_minutes: olderThanMinutes,
    });

    if (enqueueError) {
      console.error('[JepaTrainingQueueCron] enqueue failed:', enqueueError.message);
      return NextResponse.json({ success: false, error: 'enqueue-failed', detail: enqueueError.message }, { status: 500 });
    }

    const enqueuedCount = Array.isArray(enqueued) ? enqueued.length : 0;
    const summary = {
      enqueuedCount,
      minDivergence,
      batchSize,
      olderThanMinutes,
      durationMs: Date.now() - startTime,
    };

    console.log('[JepaTrainingQueueCron] Complete:', summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error('[JepaTrainingQueueCron] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
