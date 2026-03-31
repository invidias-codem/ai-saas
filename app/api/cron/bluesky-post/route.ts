import { NextRequest, NextResponse } from 'next/server';
import { BlueskyProactivePoster } from '@/lib/agents/bluesky/BlueskyProactivePoster';

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
    const poster = new BlueskyProactivePoster();
    const result = await poster.run();
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[BlueskyPostCron] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
