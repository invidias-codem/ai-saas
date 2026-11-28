import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { audit } from "@/lib/security/auditLog";

export const dynamic = 'force-dynamic';

async function getAuthorizedWorkspace(req: NextRequest, paramsPromise: Promise<{ workspaceId: string }>, permission?: string) {
  const { userId } = await auth();
  if (!userId) {
    throw { status: 401, message: 'Unauthorized' } as any;
  }

  const { workspaceId } = await paramsPromise;
  if (!workspaceId) {
    throw { status: 400, message: 'Missing workspaceId from route params' } as any;
  }
  if (!supabaseAdmin) {
    throw { status: 500, message: 'Supabase Admin client not initialized' } as any;
  }

  const { data: workspace, error } = await supabaseAdmin
    .from('workspaces')
    .select('id, user_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !workspace) {
    console.error('[Workspace Access] lookup failed', error);
    throw { status: 404, message: 'Workspace not found' } as any;
  }

  const isOwner = workspace.user_id === userId;
  if (!isOwner) {
    throw { status: 403, message: 'Forbidden: insufficient workspace permissions' } as any;
  }

  return { userId, workspaceId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await getAuthorizedWorkspace(req, params, 'workspace:read');

    const [{ data: reposData, error: reposError }, { data: workspaceData, error: workspaceError }] =
        await Promise.all([
            supabaseAdmin!
                .from('workspace_repositories')
                .select('repo_full_name')
                .eq('workspace_id', workspaceId),
            supabaseAdmin!
                .from('workspaces')
                .select('active_github_repo')
                .eq('id', workspaceId)
                .maybeSingle(),
        ]);

    if (reposError) {
        console.error("[Workspace Repos] Supabase fetch error:", reposError);
        return NextResponse.json({ error: "Failed to fetch workspace repositories", details: reposError.message || String(reposError) }, { status: 500 });
    }

    const repos = (reposData || []).map((r: any) => r.repo_full_name);
    const activeGithubRepo = workspaceData?.active_github_repo || null;

    return NextResponse.json({ repos, active_github_repo: activeGithubRepo });
  } catch (err: any) {
    console.error("[Workspace Repos] Error:", err);
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { userId, workspaceId } = await getAuthorizedWorkspace(req, params, 'repository:link');
    const body = await req.json();
    const { repo_full_name } = body;

    if (!repo_full_name) {
        return NextResponse.json({ error: "Missing repo_full_name" }, { status: 400 });
    }

    const { error } = await supabaseAdmin!
        .from('workspace_repositories')
        .insert({
            workspace_id: workspaceId,
            repo_full_name: repo_full_name,
            provider: 'github'
        });

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json({ success: true });
        }
        console.error("[Workspace Repos] Supabase insert error:", error);
        return NextResponse.json({ error: "Failed to link repository", details: error.message || String(error) }, { status: 500 });
    }

    void audit('workspace.repository.link', userId, {
        workspaceId,
        repoFullName: repo_full_name,
        provider: 'github',
    }, req);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Workspace Repos] Error:", err);
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { userId, workspaceId } = await getAuthorizedWorkspace(req, params, 'repository:unlink');
    const searchParams = req.nextUrl.searchParams;
    const repo_full_name = searchParams.get('repo_full_name');

    if (!repo_full_name) {
        return NextResponse.json({ error: "Missing repo_full_name" }, { status: 400 });
    }

    const { error } = await supabaseAdmin!
        .from('workspace_repositories')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('repo_full_name', repo_full_name)
        .eq('provider', 'github');

    if (error) {
        console.error("[Workspace Repos] Supabase delete error:", error);
        return NextResponse.json({ error: "Failed to unlink repository", details: error.message || String(error) }, { status: 500 });
    }

    void audit('workspace.repository.unlink', userId, {
        workspaceId,
        repoFullName: repo_full_name,
        provider: 'github',
    }, req);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Workspace Repos] Error:", err);
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status });
  }
}
