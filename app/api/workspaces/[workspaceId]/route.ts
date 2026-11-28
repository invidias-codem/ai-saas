import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { getWorkspaceAccess, canWorkspaceRole } from '@/lib/security/workspaceAccess';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getClientIP } from '@/lib/security/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rate = await limitApiEndpoint(userId, getClientIP(req), 'query');
    if (!rate.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const { workspaceId } = await params;
    const requested = new URL(req.url).searchParams.get('workspaceId');
    if (requested !== null && requested !== workspaceId) {
      return NextResponse.json({ error: 'Workspace not found or not accessible' }, { status: 404 });
    }
    if (!supabaseAdmin) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
    const access = await getWorkspaceAccess(userId, workspaceId);
    if (!access || !canWorkspaceRole(access.role, 'workspace:read')) {
      return NextResponse.json({ error: 'Workspace not found or not accessible' }, { status: 404 });
    }
    const { data, error } = await supabaseAdmin
      .from('workspaces')
      .select('id, user_id, name, created_at, updated_at, active_github_repo')
      .eq('id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Workspace not found or not accessible' }, { status: 404 });
    return NextResponse.json({ workspace: data });
  } catch {
    return NextResponse.json({ error: 'Workspace lookup unavailable' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
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
      .eq('user_id', userId)
      .select('id, user_id, name, created_at, updated_at, active_github_repo')
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
