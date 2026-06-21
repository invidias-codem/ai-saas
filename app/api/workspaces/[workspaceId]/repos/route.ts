import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { audit } from "@/lib/security/auditLog";
import { requireWorkspacePermission } from "@/lib/security/workspaceAccess";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { workspaceId: string } }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaceId = params.workspaceId;
        await requireWorkspacePermission(userId, workspaceId, 'workspace:read');

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        const { data, error } = await supabaseAdmin
            .from('workspace_repositories')
            .select('repo_full_name, provider')
            .eq('workspace_id', workspaceId);

        if (error) {
            console.error("[Workspace Repos] Supabase fetch error:", error);
            throw new Error("Failed to fetch workspace repositories");
        }

        return NextResponse.json({ repos: data.map(r => r.repo_full_name) });
    } catch (error) {
        console.error("[Workspace Repos] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaceId = params.workspaceId;
        await requireWorkspacePermission(userId, workspaceId, 'repository:link');
        const body = await req.json();
        const { repo_full_name } = body;

        if (!repo_full_name) {
            return NextResponse.json({ error: "Missing repo_full_name" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        const { error } = await supabaseAdmin
            .from('workspace_repositories')
            .insert({
                workspace_id: workspaceId,
                repo_full_name: repo_full_name,
                provider: 'github'
            });

        if (error) {
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ success: true }); // Already exists
            }
            console.error("[Workspace Repos] Supabase insert error:", error);
            throw new Error("Failed to link repository");
        }

        void audit('workspace.repository.link', userId, {
            workspaceId,
            repoFullName: repo_full_name,
            provider: 'github',
        }, req);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Workspace Repos] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { workspaceId: string } }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaceId = params.workspaceId;
        await requireWorkspacePermission(userId, workspaceId, 'repository:unlink');
        const searchParams = req.nextUrl.searchParams;
        const repo_full_name = searchParams.get('repo_full_name');

        if (!repo_full_name) {
            return NextResponse.json({ error: "Missing repo_full_name" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        const { error } = await supabaseAdmin
            .from('workspace_repositories')
            .delete()
            .eq('workspace_id', workspaceId)
            .eq('repo_full_name', repo_full_name)
            .eq('provider', 'github');

        if (error) {
            console.error("[Workspace Repos] Supabase delete error:", error);
            throw new Error("Failed to unlink repository");
        }

        void audit('workspace.repository.unlink', userId, {
            workspaceId,
            repoFullName: repo_full_name,
            provider: 'github',
        }, req);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Workspace Repos] Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
