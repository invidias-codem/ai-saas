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
import { TimelineDiscoveryEngine } from '@/lib/agents/bluesky/TimelineDiscoveryEngine';
import type { EngagementResult } from '@/lib/agents/bluesky/types';
import { requireCronAuth } from '@/lib/security/cronAuth';

export const maxDuration = 300;
const MAX_MENTIONS_PER_RUN = 10;

function incrementReason(bucket: Record<string, number>, key: string | undefined) {
  const normalized = key?.trim() || 'unknown';
  bucket[normalized] = (bucket[normalized] ?? 0) + 1;
}

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: 'BlueskyEngageCron' });
  if (authFailure) return authFailure;

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

  const runId = crypto.randomUUID();
  const startTime = Date.now();
  console.log(JSON.stringify({ runId, event: 'engage_run_start' }));

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
    const { mentions, newCursor } = await poller.poll(runId);

    const toProcess = mentions.slice(0, MAX_MENTIONS_PER_RUN);
    console.log(JSON.stringify({
      runId,
      event: 'engage_mentions_fetched',
      found: mentions.length,
      processing: toProcess.length
    }));

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
      const result = await responder.respond(mention, 'mention', runId);
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

      console.log(JSON.stringify({
        runId,
        event: 'engage_mention_decision',
        uri: mention.uri,
        author: mention.authorHandle,
        action: result.action,
        responded: result.responded,
        liked: result.liked,
        replyIntent: result.replyIntent,
        decisionReason: result.decisionReason,
        skipReason: result.skipReason,
        error: result.error,
      }));

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

    // ── Batch-flush actor engagement deltas (1 upsert per unique actor) ──
    const { flushed: actorsFlushed } = await poller.flushActorBatch(runId);
    console.log(JSON.stringify({ runId, event: 'engage_actor_batch_flushed', actorsFlushed }));

    // ── Timeline discovery: ingest community context for next proactive post run ──
    try {
      const timeline = new TimelineDiscoveryEngine();
      const tlResult = await timeline.run(runId);
      console.log(JSON.stringify({ runId, event: 'engage_timeline_discovery_done', ...tlResult }));
    } catch (tlErr) {
      // Non-fatal: timeline discovery failure must never break the engage cron
      const tlMsg = tlErr instanceof Error ? tlErr.message : String(tlErr);
      console.warn(JSON.stringify({ runId, event: 'engage_timeline_discovery_error', error: tlMsg }));
    }

    if (newCursor) {
      await poller.saveLastCursor(newCursor);
      console.log(JSON.stringify({ runId, event: 'engage_cursor_saved', cursor: newCursor }));
    }

    console.log(JSON.stringify({ runId, event: 'engage_run_complete', summary }));
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ runId, event: 'engage_fatal_error', error: message }));
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
