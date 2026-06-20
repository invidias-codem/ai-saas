import { NextRequest, NextResponse } from 'next/server';
import { BlueskyDiscoveryEngine } from '@/lib/agents/bluesky/BlueskyDiscoveryEngine';
import { BlueskySafetyPolicy } from '@/lib/agents/bluesky/BlueskySafetyPolicy';
import { BlueskyResponder } from '@/lib/agents/bluesky/BlueskyResponder';
import type { BlueskyMention } from '@/lib/agents/bluesky/types';
import { requireCronAuth } from '@/lib/security/cronAuth';

export const maxDuration = 300;
const MAX_EXTERNAL_LIKES_PER_RUN = 3;
const MAX_EXTERNAL_REPLIES_PER_RUN = 2;

function incrementReason(bucket: Record<string, number>, key: string | undefined) {
  const normalized = key?.trim() || 'unknown';
  bucket[normalized] = (bucket[normalized] ?? 0) + 1;
}

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, {
    routeName: 'BlueskyDiscoverCron',
    secretEnvVars: ['BLUESKY_POST_SECRET', 'CRON_SECRET'],
  });
  if (authFailure) return authFailure;

  const secret = process.env.BLUESKY_POST_SECRET ?? process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const querySecret = req.nextUrl.searchParams.get('secret');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? querySecret ?? '';

  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = crypto.randomUUID();
  console.log(JSON.stringify({ runId, event: 'discover_run_start' }));

  try {
    const engine = new BlueskyDiscoveryEngine();
    const safety = new BlueskySafetyPolicy();
    const responder = new BlueskyResponder();
    const candidates = await engine.discover();

    let liked = 0;
    let replied = 0;
    let skipped = 0;
    const actions: Array<Record<string, unknown>> = [];
    const skipReasons: Record<string, number> = {};
    const actionReasons: Record<string, number> = {};

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
        incrementReason(skipReasons, 'run_like_cap_reached');
        continue;
      }

      const decision = engine.decide(candidate);
      incrementReason(actionReasons, `engine_${decision.action}`);

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
          incrementReason(skipReasons, 'run_reply_cap_reached');
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

        console.log(JSON.stringify({
          runId,
          event: 'discover_candidate_decision',
          uri: candidate.uri,
          author: candidate.authorHandle,
          score: candidate.score,
          engineAction: decision.action,
          engineReason: decision.reason,
          responderAction: result.action,
          responded: result.responded,
          liked: result.liked,
          replyIntent: result.replyIntent,
          decisionReason: result.decisionReason,
          skipReason: result.skipReason,
          error: result.error,
        }));

        if (result.responded) {
          replied++;
          incrementReason(actionReasons, result.action);
          actions.push({
            uri: candidate.uri,
            action: 'reply',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: decision.reason,
            responseUri: result.responseUri,
            responderDecision: result.decisionReason,
            replyIntent: result.replyIntent,
          });
        } else if (result.liked) {
          liked++;
          incrementReason(actionReasons, result.action);
          actions.push({
            uri: candidate.uri,
            action: 'like_fallback',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: result.error || result.decisionReason || 'reply_failed_liked_instead',
          });
        } else {
          skipped++;
          incrementReason(skipReasons, result.skipReason ?? result.error ?? result.decisionReason);
          actions.push({
            uri: candidate.uri,
            action: 'skip',
            author: candidate.authorHandle,
            score: candidate.score,
            reason: result.error || result.skipReason || result.decisionReason || 'reply_failed_skipped',
            replyIntent: result.replyIntent,
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
        incrementReason(skipReasons, decision.reason);
        continue;
      }

      const likeBudget = await safety.canLike();
      const textCheck = safety.shouldAvoidText(candidate.text);
      if (!likeBudget.allowed || textCheck.blocked) {
        const reason = !likeBudget.allowed ? likeBudget.reason : textCheck.reason;
        actions.push({
          uri: candidate.uri,
          action: 'skip',
          author: candidate.authorHandle,
          reason,
          score: candidate.score,
        });
        skipped++;
        incrementReason(skipReasons, reason);
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
      incrementReason(actionReasons, 'like');
      actions.push({
        uri: candidate.uri,
        action: 'like',
        author: candidate.authorHandle,
        score: candidate.score,
        reason: decision.reason,
      });
    }

    const summary = {
      success: true,
      discovered: candidates.length,
      liked,
      replied,
      skipped,
      skipReasons,
      actionReasons,
      actions,
      mode: 'proactive_discovery_with_replies',
    };

    console.log(JSON.stringify({ runId, event: 'discover_run_complete', summary }));
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({ runId, event: 'discover_error', error: message }));
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
