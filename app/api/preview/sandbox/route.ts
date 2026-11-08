// app/api/preview/sandbox/route.ts
// Phase 8C: Provision an isolated Vercel Sandbox preview for a completed
// Code Builder build. Feature-flagged (ENABLE_PREVIEW_SANDBOX) and
// owner-only until Issue #479 (same-origin preview isolation) is closed.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { provisionSandbox } from '@/lib/code-builder/sandboxAdapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for sandbox provisioning

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (process.env.ENABLE_PREVIEW_SANDBOX !== 'true') {
      return NextResponse.json(
        { error: 'Preview sandbox is not enabled' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const buildId: string | undefined = body?.buildId;
    const workspaceId: string | undefined = body?.workspaceId;

    if (!buildId || typeof buildId !== 'string') {
      return NextResponse.json({ error: 'buildId is required' }, { status: 400 });
    }

    const result = await provisionSandbox(buildId, userId, workspaceId);

    return NextResponse.json({
      previewId: result.previewId,
      previewUrl: result.sandboxUrl,
      status: result.status,
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
    if (message.includes('not completed')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error('[Preview:Sandbox:POST] provision failed:', error);
    return NextResponse.json({ error: 'Failed to provision preview sandbox' }, { status: 500 });
  }
}
