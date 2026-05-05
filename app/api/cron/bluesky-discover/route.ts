import { NextRequest, NextResponse } from 'next/server';
import { BlueskyDiscoveryEngine } from '@/lib/agents/bluesky/BlueskyDiscoveryEngine';
import { BlueskySafetyPolicy } from '@/lib/agents/bluesky/BlueskySafetyPolicy';
import { BlueskyResponder } from '@/lib/agents/bluesky/BlueskyResponder';
import type { BlueskyMention } from '@/lib/agents/bluesky/types';

export const maxDuration = 300;
const MAX_EXTERNAL_LIKES_PER_RUN = 2;
const MAX_EXTERNAL_REPLIES_PER_RUN = 1;

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
    const responder = new BlueskyResponder();
    const candidates = await engine.discover();

    let liked = 0;
    let replied = 0;
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
      if (decision.action === 'reply') {
        if (replied >= MAX_EXTERNAL_REPLIES_PER_RUN) {
          actions.push({
            uri: candidate.uri,
            action: 'skip',
            author: candidate.authorHandle,
            reason: 'run_reply_cap_reached',
            score: candidate.score,
          });
          skipped++;
          continue;
        }

        const mention: BlueskyMention = {
          uri: candidate.uri,
          cid: candidate.cid,
          authorHandle: candidate.authorHandle,
          authorDid: candidate.authorDid,
          text: candidate.text,
          indexedAt: new Date().toISOString(),
        };

        const result = await responder.respond(mention, 'discovery');
        
        if (result.responded) {
          replied++;
          actions.push({
            uri: candidate.uri,
            action: 'reply',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: decision.reason,
            responseUri: result.responseUri,
          });
        } else if (result.liked) {
          liked++;
          actions.push({
            uri: candidate.uri,
            action: 'like_fallback',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: result.error || 'reply_failed_liked_instead',
          });
        } else {
          skipped++;
          actions.push({
            uri: candidate.uri,
            action: 'skip',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: result.error || 'reply_failed_skipped',
          });
        }
        continue;
      }

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
      replied,
      skipped,
      actions,
      mode: 'proactive_discovery_with_replies',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BlueskyDiscoverCron] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
