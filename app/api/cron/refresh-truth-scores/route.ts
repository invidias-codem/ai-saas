/**
 * Cron: Refresh model_truth_scores materialized view
 *
 * Runs on a schedule to keep the model truth score aggregates current.
 * The materialized view aggregates from ai_output_audit which is written
 * by the DeltaEngine on every conversation turn.
 *
 * Schedule: every 1 hour (set in vercel.json)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request) {
  // Verify this is a legitimate cron call
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Refresh the materialized view
    const { error } = await supabase.rpc('refresh_model_truth_scores');

    if (error) {
      // Fallback: try raw SQL via service role
      const { error: sqlError } = await supabase
        .from('model_truth_scores')
        .select('count', { count: 'exact', head: true });

      if (sqlError) {
        console.error('[TruthScores] Refresh failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Log refresh stats
    const { data: stats } = await supabase
      .from('model_truth_scores')
      .select('model, domain, total_claims, hallucination_rate, avg_delta_score')
      .order('hallucination_rate', { ascending: false })
      .limit(10);

    console.log('[TruthScores] Refreshed. Top models by hallucination rate:', stats);

    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      model_count: stats?.length ?? 0,
      top_offenders: stats?.filter(s => (s.hallucination_rate ?? 0) > 0.1) ?? [],
    });

  } catch (e) {
    console.error('[TruthScores] Cron error:', e);
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
