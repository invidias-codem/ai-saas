// app/api/preview/sandbox/[id]/route.ts
// Phase 8C: Get sandbox status or destroy a preview sandbox.
// Owner-only; feature-flagged via ENABLE_PREVIEW_SANDBOX.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sandboxStatus, destroySandbox } from '@/lib/code-builder/sandboxAdapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: previewId } = await params;
    if (!previewId || typeof previewId !== 'string') {
      return NextResponse.json({ error: 'preview id is required' }, { status: 400 });
    }

    const status = await sandboxStatus(previewId, userId);
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[Preview:Sandbox:GET] status lookup failed:', error);
    return NextResponse.json({ error: 'Failed to get preview status' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: previewId } = await params;
    if (!previewId || typeof previewId !== 'string') {
      return NextResponse.json({ error: 'preview id is required' }, { status: 400 });
    }

    await destroySandbox(previewId, userId);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const message = error?.message ?? String(error);
    if (message.includes('ownership mismatch')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error('[Preview:Sandbox:DELETE] destroy failed:', error);
    return NextResponse.json({ error: 'Failed to destroy preview sandbox' }, { status: 500 });
  }
}
