import { NextRequest, NextResponse } from 'next/server';
import { BlueskyDiscoveryEngine } from '@/lib/agents/bluesky/BlueskyDiscoveryEngine';
import { BlueskyResponder } from '@/lib/agents/bluesky/BlueskyResponder';

export const maxDuration = 300;

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
    const responder = new BlueskyResponder();
    const candidates = await engine.discover();

    let liked = 0;
    let replied = 0;
    const actions: any[] = [];

    for (const candidate of candidates.slice(0, 5)) {
      const decision = engine.decide(candidate);
      if (decision.action === 'like') {
        await engine.like(candidate.uri, candidate.cid);
        liked++;
        actions.push({ uri: candidate.uri, action: 'like', score: candidate.score, author: candidate.authorHandle });
      } else if (decision.action === 'reply') {
        const result = await responder.respond({
          uri: candidate.uri,
          cid: candidate.cid,
          authorHandle: candidate.authorHandle,
          authorDid: candidate.authorDid,
          text: candidate.text,
          indexedAt: new Date().toISOString(),
        });
        if (result.responded) replied++;
        actions.push({ uri: candidate.uri, action: 'reply', score: candidate.score, author: candidate.authorHandle, responded: result.responded, error: result.error });
      }
    }

    return NextResponse.json({ success: true, discovered: candidates.length, liked, replied, actions });
  } catch (error: any) {
    console.error('[BlueskyDiscoverCron] Error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
