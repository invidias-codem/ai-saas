import { NextRequest, NextResponse } from 'next/server';
import { BlueskyPoster } from '@/lib/agents/bluesky/BlueskyPoster';
import {
  logProactiveBlueskyPost,
  planProactiveBlueskyPost,
  type BlueskyTopicLane,
} from '@/lib/agents/bluesky/ProactivePostPlanner';

export const maxDuration = 120;

function parseLane(value: string | null): BlueskyTopicLane | undefined {
  if (value === 'ai' || value === 'memory' || value === 'tech') return value;
  return undefined;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (cronSecret && provided !== cronSecret.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const lane = parseLane(req.nextUrl.searchParams.get('lane'));

  try {
    const plan = await planProactiveBlueskyPost(lane);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        lane: plan.lane,
        topics: plan.topics,
        ctaMode: plan.ctaMode,
        sourceKind: plan.sourceKind,
        grounding: plan.grounding,
        candidateText: plan.text,
      });
    }

    const poster = new BlueskyPoster();
    const result = await poster.post({
      text: plan.text,
      topics: plan.topics,
      ctaMode: plan.ctaMode,
    });

    await logProactiveBlueskyPost({
      lane: plan.lane,
      text: plan.text,
      topics: plan.topics,
      ctaMode: plan.ctaMode,
      grounding: plan.grounding,
      sourceKind: plan.sourceKind,
      postUri: result.uri,
      postCid: result.cid,
    });

    return NextResponse.json({
      success: true,
      dryRun: false,
      lane: plan.lane,
      topics: plan.topics,
      ctaMode: plan.ctaMode,
      sourceKind: plan.sourceKind,
      post: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyPostCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
