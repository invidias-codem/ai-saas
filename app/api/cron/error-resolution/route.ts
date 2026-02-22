/**
 * Cron: Error Resolution Agent
 *
 * Runs on a schedule (configure in vercel.json) to process pending
 * Vercel error logs and automatically open PRs for resolvable issues.
 *
 * Schedule: every 30 minutes
 * vercel.json:
 *   { "crons": [{ "path": "/api/cron/error-resolution", "schedule": "*/30 * * * *" }] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBatchResolution } from '@/lib/ucol/agents/errorResolutionAgent';

export const maxDuration = 300; // 5 min (Vercel Pro max for cron)

export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  console.log('[ErrorResolutionCron] Starting batch resolution run...');

  try {
    const results = await runBatchResolution({
      limit: 5,
      minAgeMinutes: 5,
    });

    const summary = {
      total: results.length,
      pr_open: results.filter(r => r.status === 'pr_open').length,
      needs_human: results.filter(r => r.status === 'needs_human').length,
      failed: results.filter(r => r.status === 'failed').length,
      prs: results.filter(r => r.prUrl).map(r => ({ url: r.prUrl, category: r.category })),
      durationMs: Date.now() - startTime,
    };

    console.log('[ErrorResolutionCron] Complete:', summary);
    return NextResponse.json({ success: true, ...summary });

  } catch (err: any) {
    console.error('[ErrorResolutionCron] Fatal error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
