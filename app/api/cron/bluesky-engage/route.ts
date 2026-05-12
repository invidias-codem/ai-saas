/**
 * app/api/cron/bluesky-engage/route.ts
 *
 * Vercel Cron Route — Bluesky Engagement Agent
 *
 * Polls for new Bluesky mentions and routes each one through the full
 * Tech Genie UCOL pipeline: classify → decide → like/reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { MentionPoller } from '@/lib/agents/bluesky/MentionPoller';
import { BlueskyResponder } from '@/lib/agents/bluesky/BlueskyResponder';
import type { EngagementResult } from '@/lib/agents/bluesky/types';

export const maxDuration = 300;
const MAX_MENTIONS_PER_RUN = 10;

function incrementReason(bucket: Record<string, number>, key: string | undefined) {
  const normalized = key?.trim() || 'unknown';
  bucket[normalized] = (bucket[normalized] ?? 0) + 1;
}

export async function GET(req: NextRequest) {
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

  let processed = 0;
  let responded = 0;
  let liked = 0;
  let skipped = 0;
  let factsExtracted = 0;
  const errors: string[] = [];
  const skipReasons: Record<string, number> = {};
  const actionReasons: Record<string, number> = {};

  try {
    const poller = new MentionPoller();
    const mentions = await poller.poll();

    const toProcess = mentions.slice(0, MAX_MENTIONS_PER_RUN);
    console.log(`[BlueskyEngageCron] Found ${mentions.length} mentions, processing ${toProcess.length}`);

    if (toProcess.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        responded: 0,
        liked: 0,
        skipped: 0,
        factsExtracted: 0,
        errors: [],
        skipReasons: {},
        actionReasons: {},
        durationMs: Date.now() - startTime,
      });
    }

    const responder = new BlueskyResponder();
    const results: EngagementResult[] = [];

    for (const mention of toProcess) {
      const result = await responder.respond(mention);
      results.push(result);
      processed++;

      incrementReason(actionReasons, result.action);

      if (result.responded) {
        responded++;
        factsExtracted += result.factsExtracted;
      } else if (result.liked) {
        liked++;
      } else {
        skipped++;
        incrementReason(skipReasons, result.skipReason ?? result.error ?? result.decisionReason);
      }

      console.log('[BlueskyEngageCron] Mention decision:', {
        uri: mention.uri,
        author: mention.authorHandle,
        action: result.action,
        responded: result.responded,
        liked: result.liked,
        replyIntent: result.replyIntent,
        decisionReason: result.decisionReason,
        skipReason: result.skipReason,
        error: result.error,
      });

      if (result.error && result.error !== 'rate_limited') {
        errors.push(`${mention.uri}: ${result.error}`);
      }
    }

    const summary = {
      success: true,
      processed,
      responded,
      liked,
      skipped,
      factsExtracted,
      errors,
      skipReasons,
      actionReasons,
      results,
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
        liked,
        skipped,
        factsExtracted,
        errors: [message],
        skipReasons,
        actionReasons,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
