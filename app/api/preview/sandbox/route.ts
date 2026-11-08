// app/api/preview/sandbox/route.ts
// Phase 8C: Provision an isolated Vercel Sandbox preview for a completed
// Code Builder build. Feature-flagged (ENABLE_PREVIEW_SANDBOX) and
// owner-only until Issue #479 (same-origin preview isolation) is closed.
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { provisionSandbox, destroySandbox } from '@/lib/code-builder/sandboxAdapter';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for sandbox provisioning

// Owner-scoped lookup prevents duplicate provisioning when a user returns
// to the same completed build. No sandbox URL is returned by this lookup.
export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });
    if (process.env.ENABLE_PREVIEW_SANDBOX !== 'true') {
      return NextResponse.json({ error: 'Preview sandbox is not enabled' }, { status: 403 });
    }
    const buildId = new URL(req.url).searchParams.get('buildId');
    if (!buildId) return NextResponse.json({ error: 'buildId is required' }, { status: 400 });
    if (!supabaseAdmin) return NextResponse.json({ error: 'Preview database unavailable' }, { status: 503 });

    const { data: build, error: buildError } = await supabaseAdmin
      .from('code_builder_builds')
      .select('user_id, status')
      .eq('build_id', buildId)
      .maybeSingle();
    if (buildError) throw buildError;
    if (!build || build.user_id !== userId) {
      return NextResponse.json({ error: 'Build not found' }, { status: 404 });
    }
    if (build.status !== 'completed') {
      return NextResponse.json({ error: 'Build not completed' }, { status: 409 });
    }

    const { data: preview, error: previewError } = await supabaseAdmin
      .from('preview_sandboxes')
      .select('id, status, expires_at')
      .eq('build_id', buildId)
      .eq('user_id', userId)
      .in('status', ['ready', 'provisioning'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previewError) throw previewError;

    if (preview && Date.parse(preview.expires_at) <= Date.now()) {
      await destroySandbox(preview.id, userId);
      return NextResponse.json({ preview: null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({
      preview: preview ? { previewId: preview.id, status: preview.status } : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Preview:Sandbox:GET] lookup failed:', error);
    return NextResponse.json({ error: 'Unable to look up preview' }, { status: 500 });
  }
}

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
