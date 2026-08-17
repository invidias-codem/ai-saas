import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const requestedWorkspaceId = searchParams.get('workspaceId') || workspaceId;

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, org_id, user_id, name, created_at, updated_at, active_github_repo')
    .eq('id', requestedWorkspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workspace: data ?? null });
}

export async function PATCH(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = await params;
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Backend not configured' }, { status: 500 });
    }

    const { data: workspace, error: workspaceError } = await supabaseAdmin
      .from('workspaces')
      .select('id, user_id')
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspaceError || !workspace || workspace.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden: insufficient workspace permissions' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { active_github_repo } = body as { active_github_repo?: string | null };

    if (active_github_repo !== undefined && typeof active_github_repo !== 'string') {
      return NextResponse.json({ error: 'active_github_repo must be a string or null' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (active_github_repo !== undefined) {
      updates.active_github_repo = active_github_repo || null;
    }

    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId)
      .select('id, org_id, user_id, name, created_at, updated_at, active_github_repo')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workspace: data ?? null });
  } catch (error: any) {
    console.error('[Workspace PATCH] Error:', error);
    const status = (error as Error & { status?: number }).status || 500;
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status });
  }
}
