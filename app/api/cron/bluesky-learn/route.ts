import { NextRequest, NextResponse } from 'next/server';
import { BlueskyLearningLoop } from '@/lib/agents/bluesky/BlueskyLearningLoop';
import { requireCronAuth } from '@/lib/security/cronAuth';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, {
    routeName: 'BlueskyLearnCron',
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

  try {
    const loop = new BlueskyLearningLoop();
    const snapshot = await loop.buildSnapshot();
    return NextResponse.json({ success: true, snapshot });
  } catch (error: any) {
    console.error('[BlueskyLearnCron] Error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
