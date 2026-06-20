/**
 * Cron: Error Resolution Agent
 *
 * Runs on a schedule (configure in vercel.json) to process pending
 * Vercel error logs and automatically open PRs for resolvable issues.
 *
 * Schedule: every 30 minutes
 * vercel.json:
 *   { "crons": [{ "path": "/api/cron/error-resolution", "schedule": "* /30 * * * *" }] }
 *   (note: remove the space in the schedule — JSDoc parser limitation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runBatchResolution } from '@/lib/ucol/agents/errorResolutionAgent';
import { requireCronAuth } from '@/lib/security/cronAuth';

export const maxDuration = 300; // 5 min (Vercel Pro max for cron)

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: 'ErrorResolutionCron' });
  if (authFailure) return authFailure;

  const cronSecret = process.env.CRON_SECRET;

  // Accept secret via Authorization header (Vercel cron) OR ?secret= query param (manual testing)
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (cronSecret) {
    if (provided !== cronSecret.trim()) {
      return NextResponse.json({
        error: 'Unauthorized',
        debug: {
          cronSecretSet: true,
          providedViaHeader: !!authHeader,
          providedViaQuery: !!querySecret,
          hint: 'Pass ?secret=<CRON_SECRET> in the URL or Authorization: Bearer <secret> header',
        },
      }, { status: 401 });
    }
  } else {
    // CRON_SECRET not configured — warn but allow through so we can verify the agent works
    console.warn('[ErrorResolutionCron] CRON_SECRET is not set — endpoint is unprotected');
  }

  const startTime = Date.now();
  console.log('[ErrorResolutionCron] Starting batch resolution run...');

  try {
    const results = await runBatchResolution({
      limit: 3,        // Cap at 3 per run to control Gemini API spend
      minAgeMinutes: 0, // FAST processing // Only process errors >30 min old (avoids transient noise)
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
