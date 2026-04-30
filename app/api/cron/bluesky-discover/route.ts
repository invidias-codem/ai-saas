import { NextRequest, NextResponse } from 'next/server';
import { BlueskyDiscoveryEngine } from '@/lib/agents/bluesky/BlueskyDiscoveryEngine';
import { BlueskySafetyPolicy } from '@/lib/agents/bluesky/BlueskySafetyPolicy';

export const maxDuration = 300;
const MAX_EXTERNAL_LIKES_PER_RUN = 2;

export async function GET(req: NextRequest) {
  const secret = process.env.BLUESKY_POST_SECRET ?? process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const engine = new BlueskyDiscoveryEngine();
    const safety = new BlueskySafetyPolicy();
    const candidates = await engine.discover();

    let liked = 0;
    let skipped = 0;
    const actions: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      if (liked >= MAX_EXTERNAL_LIKES_PER_RUN) {
        actions.push({
          uri: candidate.uri,
          action: 'skip',
          author: candidate.authorHandle,
          reason: 'run_like_cap_reached',
          score: candidate.score,
        });
        skipped++;
        continue;
      }

      const decision = engine.decide(candidate);
      if (decision.action !== 'like') {
        actions.push({
          uri: candidate.uri,
          action: 'skip',
          author: candidate.authorHandle,
          reason: decision.reason,
          score: candidate.score,
        });
        skipped++;
        continue;
      }

      const likeBudget = await safety.canLike();
      const textCheck = safety.shouldAvoidText(candidate.text);
      if (!likeBudget.allowed || textCheck.blocked) {
        actions.push({
          uri: candidate.uri,
          action: 'skip',
          author: candidate.authorHandle,
          reason: !likeBudget.allowed ? likeBudget.reason : textCheck.reason,
          score: candidate.score,
        });
        skipped++;
        continue;
      }

      await engine.like(candidate.uri, candidate.cid);
      await safety.logAction({
        route: 'discovery-like',
        authorHandle: candidate.authorHandle,
        authorDid: candidate.authorDid,
        mentionUri: candidate.uri,
        mentionText: candidate.text,
        responseText: decision.reason,
      });

      liked++;
      actions.push({
        uri: candidate.uri,
        action: 'like',
        author: candidate.authorHandle,
        score: candidate.score,
        reason: decision.reason,
      });
    }

    return NextResponse.json({
      success: true,
      discovered: candidates.length,
      liked,
      skipped,
      actions,
      mode: 'external_like_only_strict_gating',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BlueskyDiscoverCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
