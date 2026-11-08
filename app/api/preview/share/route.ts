// app/api/preview/share/route.ts
// Phase 8D: Create a stable, Lattice-controlled share link for a sandbox
// preview. Owner-only; feature-flagged via ENABLE_PREVIEW_SHARING.
//
// The share link is the only way to access a preview. The raw sandbox URL is
// never handed out — consumers receive a share token that resolves through an
// authorization-checked route.
//
// ENABLE_PREVIEW_SHARING is separate from ENABLE_PREVIEW_SANDBOX. Sharing
// remains disabled until Issue #479 enforcement is closed.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createShareLink } from '@/lib/code-builder/shareLink';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (process.env.ENABLE_PREVIEW_SHARING !== 'true') {
      return NextResponse.json(
        { error: 'Preview sharing is not enabled' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const previewId: string | undefined = body?.previewId;

    if (!previewId || typeof previewId !== 'string') {
      return NextResponse.json({ error: 'previewId is required' }, { status: 400 });
    }

    const share = await createShareLink(previewId, userId);

    return NextResponse.json({
      shareId: share.id,
      shareToken: share.share_token,
      shareUrl: `/preview/share/${share.share_token}`,
      previewId: share.preview_id,
    });
  } catch (error: any) {
    const message = error?.message ?? String(error);
    if (message.includes('feature-flagged off')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes('ownership mismatch')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('not ready')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error('[Preview:Share:POST] share creation failed:', error);
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 500 });
  }
}
