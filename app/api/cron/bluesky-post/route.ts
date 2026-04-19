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
  const distributionUrl = req.nextUrl.searchParams.get('url');
  const distributionTitle = req.nextUrl.searchParams.get('title');
  const distributionSummary = req.nextUrl.searchParams.get('summary');

  try {
    const plan = distributionUrl && distributionTitle && distributionSummary
      ? await planDistributionBlueskyPost({
          url: distributionUrl,
          title: distributionTitle,
          summary: distributionSummary,
          lane,
        })
      : await planProactiveBlueskyPost(lane);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
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
        lane: plan.lane,
        intent: plan.intent,
        topics: plan.topics,
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
        suppressionReason: plan.suppressionReason,
        decisionNotes: plan.decisionNotes ?? [],
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
      lane: plan.lane,
      intent: plan.intent,
      topics: plan.topics,
      ctaMode: plan.ctaMode,
      sourceKind: plan.sourceKind,
      audienceMode: plan.audienceMode ?? null,
      rhetoricalPattern: plan.rhetoricalPattern ?? null,
      freshnessScore: plan.freshnessScore ?? null,
      usefulnessScore: plan.usefulnessScore ?? null,
      stalenessFlags: plan.stalenessFlags ?? [],
      topicCluster: plan.topicCluster ?? null,
      publicationUrl: plan.publicationUrl ?? null,
      publicationTitle: plan.publicationTitle ?? null,
      decisionNotes: plan.decisionNotes ?? [],
      post: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyPostCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
