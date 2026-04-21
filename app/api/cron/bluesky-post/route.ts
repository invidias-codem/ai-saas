import { NextRequest, NextResponse } from 'next/server';
import { BlueskyPoster } from '@/lib/agents/bluesky/BlueskyPoster';
import {
  logProactiveBlueskyPost,
  planDistributionBlueskyPost,
  planProactiveBlueskyPost,
  updateBlueskyTopicState,
  type BlueskyTopicLane,
} from '@/lib/agents/bluesky/ProactivePostPlanner';

export const maxDuration = 120;

function parseLane(value: string | null): BlueskyTopicLane | undefined {
  if (value === 'ai' || value === 'memory' || value === 'tech') return value;
  return undefined;
}

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')?.trim();
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

async function buildPlan(req: NextRequest) {
  const lane = parseLane(req.nextUrl.searchParams.get('lane'));
  const distributionUrl = req.nextUrl.searchParams.get('url');
  const distributionTitle = req.nextUrl.searchParams.get('title');
  const distributionSummary = req.nextUrl.searchParams.get('summary');

  return distributionUrl && distributionTitle && distributionSummary
    ? planDistributionBlueskyPost({
        url: distributionUrl,
        title: distributionTitle,
        summary: distributionSummary,
        lane,
      })
    : planProactiveBlueskyPost(lane);
}

function requireCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error('[BlueskyPostCron] Missing CRON_SECRET');
    return NextResponse.json(
      { success: false, error: 'Server misconfigured' },
      { status: 500 }
    );
  }

  const provided = getBearerToken(req);
  if (!provided || provided !== cronSecret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

function serializePlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  return {
    lane: plan.lane,
    intent: plan.intent,
    topics: plan.topics,
    ctaMode: plan.ctaMode,
    sourceKind: plan.sourceKind,
    sourceConfidence: plan.sourceConfidence,
    audienceMode: plan.audienceMode ?? null,
    rhetoricalPattern: plan.rhetoricalPattern ?? null,
    qualityScore: plan.qualityScore,
    freshnessScore: plan.freshnessScore ?? null,
    usefulnessScore: plan.usefulnessScore ?? null,
    stalenessFlags: plan.stalenessFlags ?? [],
    topicCluster: plan.topicCluster ?? null,
    publicationUrl: plan.publicationUrl ?? null,
    publicationTitle: plan.publicationTitle ?? null,
    suppressed: plan.suppressed ?? false,
    suppressionReason: plan.suppressionReason ?? null,
    decisionNotes: plan.decisionNotes ?? [],
    grounding: plan.grounding,
    candidateText: plan.text,
  };
}

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req);
  if (authFailure) return authFailure;

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  if (!dryRun) {
    return NextResponse.json(
      { success: false, error: 'GET is dry-run only' },
      { status: 405 }
    );
  }

  try {
    const plan = await buildPlan(req);
    return NextResponse.json({
      success: true,
      dryRun: true,
      ...serializePlan(plan),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyPostCron] Dry-run error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authFailure = requireCronAuth(req);
  if (authFailure) return authFailure;

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const execute = req.nextUrl.searchParams.get('execute') === 'true';

  if (!dryRun && !execute) {
    return NextResponse.json(
      { success: false, error: 'Explicit execute=true required for live posting' },
      { status: 400 }
    );
  }

  try {
    const plan = await buildPlan(req);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        ...serializePlan(plan),
      });
    }

    if (plan.suppressed) {
      await logProactiveBlueskyPost({
        lane: plan.lane,
        intent: plan.intent,
        text: plan.text,
        topics: plan.topics,
        ctaMode: plan.ctaMode,
        grounding: plan.grounding,
        sourceKind: plan.sourceKind,
        sourceConfidence: plan.sourceConfidence,
        qualityScore: plan.qualityScore,
        freshnessScore: plan.freshnessScore,
        usefulnessScore: plan.usefulnessScore,
        audienceMode: plan.audienceMode,
        rhetoricalPattern: plan.rhetoricalPattern,
        stalenessFlags: plan.stalenessFlags,
        decisionNotes: plan.decisionNotes,
        suppressed: true,
        suppressionReason: plan.suppressionReason,
        publicationUrl: plan.publicationUrl,
        publicationTitle: plan.publicationTitle,
        topicCluster: plan.topicCluster,
      });

      return NextResponse.json({
        success: true,
        dryRun: false,
        suppressed: true,
        ...serializePlan(plan),
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
      intent: plan.intent,
      text: plan.text,
      topics: plan.topics,
      ctaMode: plan.ctaMode,
      grounding: plan.grounding,
      sourceKind: plan.sourceKind,
      sourceConfidence: plan.sourceConfidence,
      qualityScore: plan.qualityScore,
      freshnessScore: plan.freshnessScore,
      usefulnessScore: plan.usefulnessScore,
      audienceMode: plan.audienceMode,
      rhetoricalPattern: plan.rhetoricalPattern,
      stalenessFlags: plan.stalenessFlags,
      decisionNotes: plan.decisionNotes,
      suppressed: false,
      publicationUrl: plan.publicationUrl,
      publicationTitle: plan.publicationTitle,
      topicCluster: plan.topicCluster,
      postUri: result.uri,
      postCid: result.cid,
    });

    if (plan.topicCluster) {
      await updateBlueskyTopicState({
        topic: plan.topicCluster,
        lane: plan.lane,
        posted: true,
      });
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      ...serializePlan(plan),
      post: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyPostCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
