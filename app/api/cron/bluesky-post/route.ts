import { NextRequest, NextResponse } from 'next/server';
import { BlueskyPoster } from '@/lib/agents/bluesky/BlueskyPoster';
import { logProactiveBlueskyPost, planProactiveBlueskyPost } from '@/lib/agents/bluesky/ProactivePostPlanner';

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (cronSecret && provided !== cronSecret.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const plan = await planProactiveBlueskyPost();
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
