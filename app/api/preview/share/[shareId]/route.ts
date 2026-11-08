// app/api/preview/share/[shareId]/route.ts
// Phase 8D: Resolve a share token to the preview's sandbox URL.
//
// Every request checks Clerk auth + preview ownership. The raw sandbox URL is
// returned to the share page (which embeds it in an iframe) — it is never
// handed out directly as a shareable link.
//
// ENABLE_PREVIEW_SHARING is separate from ENABLE_PREVIEW_SANDBOX. Sharing
// remains disabled until Issue #479 enforcement is closed.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveShareLink } from '@/lib/code-builder/shareLink';
import { isPreviewSharingSafe } from '@/lib/code-builder/previewIngressPolicy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!isPreviewSharingSafe()) {
      return NextResponse.json(
        { error: 'Preview sharing is not enabled' },
        { status: 403 }
      );
    }

    const { shareId: shareToken } = await params;
    if (!shareToken || typeof shareToken !== 'string') {
      return NextResponse.json({ error: 'share token is required' }, { status: 400 });
    }

    const resolved = await resolveShareLink(shareToken, userId);
    if (!resolved) {
      return NextResponse.json({ error: 'Share link not found or access denied' }, { status: 404 });
    }

    return NextResponse.json({
      previewId: resolved.previewId,
      sandboxUrl: resolved.sandboxUrl,
    });
  } catch (error: any) {
    console.error('[Preview:Share:GET] resolution failed:', error);
    return NextResponse.json({ error: 'Failed to resolve share link' }, { status: 500 });
  }
}
