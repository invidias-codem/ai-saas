/**
 * app/api/bluesky/post/route.ts
 *
 * Manual POST endpoint for creating Bluesky posts.
 * Supports text, images, and thread-style posting.
 *
 * Auth: CRON_SECRET or BLUESKY_POST_SECRET
 *
 * Body (JSON):
 *   { text, images?: [{url, alt, mimeType?}], thread?: [{text, images?}] }
 *
 * - If `thread` is provided, posts a full thread and ignores `text`/`images`.
 * - If `images` is provided with `text`, posts a single post with image embed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { BlueskyPoster } from '@/lib/agents/bluesky/BlueskyPoster';

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.BLUESKY_POST_SECRET ?? process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const provided = authHeader?.replace('Bearer ', '').trim() ?? '';

  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const poster = new BlueskyPoster();

    // Thread mode
    if (body.thread && Array.isArray(body.thread)) {
      const results = await poster.postThread(body.thread);
      return NextResponse.json({ success: true, posts: results });
    }

    // Single post mode
    if (!body.text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const result = await poster.post({
      text: body.text,
      images: body.images,
    });

    return NextResponse.json({ success: true, post: result });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[BlueskyPost] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
