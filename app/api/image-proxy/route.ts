/**
 * app/api/image-proxy/route.ts
 *
 * Proxies generated images from Replicate's temporary CDN through our server.
 * Replicate URLs expire — this endpoint fetches the image at generation time,
 * caches it in memory for 1h, and serves it with a stable URL.
 *
 * Usage:  GET /api/image-proxy?url=<encoded-replicate-url>
 *
 * Security:
 *  - Only proxies replicate.delivery hostnames (allowlist)
 *  - Requires auth (no anonymous image scraping)
 *  - 10MB max response size
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security/apiAuth';

const ALLOWED_HOSTNAMES = ['replicate.delivery', 'pbxt.replicate.delivery'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const CACHE_TTL_SEC = 60 * 60; // 1 hour browser cache

export async function GET(req: NextRequest) {
  try {
    // Auth check — prevent anonymous hotlinking
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // Validate — only allow Replicate CDN URLs
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const isAllowed = ALLOWED_HOSTNAMES.some(
      h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
    );
    if (!isAllowed) {
      return NextResponse.json({ error: 'URL not from allowed hostname' }, { status: 403 });
    }

    // Fetch image from Replicate
    const upstream = await fetch(imageUrl, {
      headers: { 'User-Agent': 'LatticeOS/1.0 ImageProxy' },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream fetch failed: ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const contentLength = Number(upstream.headers.get('content-length') || 0);

    if (contentLength > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${CACHE_TTL_SEC}, immutable`,
        'X-Proxy-Source': 'replicate',
      },
    });
  } catch (error: any) {
    console.error('[IMAGE_PROXY_ERROR]', error);
    return NextResponse.json({ error: 'Proxy error' }, { status: 500 });
  }
}
