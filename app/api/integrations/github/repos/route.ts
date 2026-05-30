import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getGitHubClientForUser } from "@/lib/github";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const octokit = await getGitHubClientForUser(userId);
        if (!octokit) {
            return NextResponse.json({ error: "GitHub integration not connected" }, { status: 404 });
        }

        // Fetch repositories handling standard Octokit pagination and explicit affiliation
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({
            affiliation: 'owner,collaborator,organization_member',
            sort: 'pushed',
            per_page: 100,
        });

        // Map to lightweight structure
        const repos = data.map((repo: any) => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            pushed_at: repo.pushed_at,
        }));

        return NextResponse.json({ repos });

    } catch (error) {
        console.error("[GitHub Repos Fetch] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch GitHub repositories" },
            { status: 500 }
        );
    }
}
