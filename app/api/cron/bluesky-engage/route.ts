/**
 * app/api/cron/bluesky-engage/route.ts
 *
 * Vercel Cron Route — Bluesky Engagement Agent
 *
 * Polls for new Bluesky mentions and routes each one through the full
 * Tech Genie UCOL pipeline: classify → extract facts → generate reply → post.
 *
 * Schedule: every 5 minutes  (cron: "* /5 * * * *" — remove the space)
 * vercel.json entry:
 *   { "path": "/api/cron/bluesky-engage", "schedule": "* /5 * * * *" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { MentionPoller } from '@/lib/agents/bluesky/MentionPoller';
import { BlueskyResponder } from '@/lib/agents/bluesky/BlueskyResponder';
import type { EngagementResult } from '@/lib/agents/bluesky/types';

// Vercel Pro max duration for cron routes
export const maxDuration = 300;

// Max mentions to process per cron run (keeps latency and API spend bounded)
const MAX_MENTIONS_PER_RUN = 10;

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (cronSecret) {
    if (provided !== cronSecret.trim()) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          hint: 'Pass Authorization: Bearer <CRON_SECRET> header or ?secret=<CRON_SECRET>',
        },
        { status: 401 }
      );
    }
  } else {
    console.warn('[BlueskyEngageCron] CRON_SECRET is not set — endpoint is unprotected');
  }

  const startTime = Date.now();
  console.log('[BlueskyEngageCron] Starting engagement run...');

  // ── Counters ──────────────────────────────────────────────────────────────
  let processed = 0;
  let responded = 0;
  let factsExtracted = 0;
  const errors: string[] = [];

  try {
    // ── Poll for new mentions ───────────────────────────────────────────
    const poller = new MentionPoller();
    const mentions = await poller.poll();

    const toProcess = mentions.slice(0, MAX_MENTIONS_PER_RUN);
    console.log(
      `[BlueskyEngageCron] Found ${mentions.length} mentions, processing ${toProcess.length}`
    );

    if (toProcess.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        responded: 0,
        factsExtracted: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      });
    }

    // ── Process each mention ────────────────────────────────────────────
    const responder = new BlueskyResponder();

    // Process sequentially to stay within rate limits and keep Supabase writes predictable
    const results: EngagementResult[] = [];
    for (const mention of toProcess) {
      const result = await responder.respond(mention);
      results.push(result);
      processed++;

      if (result.responded) {
        responded++;
        factsExtracted += result.factsExtracted;
      }

      if (result.error && result.error !== 'rate_limited') {
        errors.push(`${mention.uri}: ${result.error}`);
      }
    }

    const summary = {
      success: true,
      processed,
      responded,
      factsExtracted,
      errors,
      durationMs: Date.now() - startTime,
    };

    console.log('[BlueskyEngageCron] Run complete:', summary);
    return NextResponse.json(summary);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyEngageCron] Fatal error:', message);
    return NextResponse.json(
      {
        success: false,
        processed,
        responded,
        factsExtracted,
        errors: [message],
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
