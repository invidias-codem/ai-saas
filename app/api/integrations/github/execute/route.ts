import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/firebaseAdmin";
import { z } from "zod";

const GithubExecuteSchema = z.object({
    action: z.enum(['get_repo', 'create_file', 'update_file', 'create_pr']),
    repo: z.string().regex(/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+$/, "Invalid repo format (owner/repo)"),
    path: z.string().max(1000).optional(),
    message: z.string().max(1000).optional(),
    content: z.string().max(1000000).optional(), // 1MB max content
    branch: z.string().max(255).optional(),
    title: z.string().max(255).optional(),
});

export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validation = GithubExecuteSchema.safeParse(body);

    if (!validation.success) {
        return NextResponse.json({ error: "Validation Error", details: validation.error.flatten() }, { status: 400 });
    }

    const { action, repo, path, message, content, branch, title } = validation.data;

    // Retrieve user's access token
    const integrationDoc = await db.collection("users").doc(userId).collection("integrations").doc("github").get();
    if (!integrationDoc.exists) {
        return NextResponse.json({ error: "GitHub not connected" }, { status: 400 });
    }

    const { accessToken } = integrationDoc.data() as { accessToken: string };
    const octokit = getOctokit(accessToken);

    try {
        let result;
        const [owner, repoName] = repo.split("/"); // Expecting "owner/repo"

        switch (action) {
            case "get_repo":
                // Clone/Read equivalent
                result = await octokit.rest.repos.get({ owner, repo: repoName });
                break;

            case "create_file":
            case "update_file":
                if (!path || !content) {
                    return NextResponse.json({ error: 'Validation Error', details: 'path and content are required for file operations' }, { status: 400 });
                }
                // Commit equivalent — first get SHA if updating
                let sha: string | undefined;
                if (action === "update_file") {
                    try {
                        const existing = await octokit.rest.repos.getContent({ owner, repo: repoName, path });
                        if (!Array.isArray(existing.data) && 'sha' in existing.data) {
                            sha = existing.data.sha;
                        }
                    } catch (e) {
                        // Ignore — file may not exist yet
                    }
                }

                result = await octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo: repoName,
                    path,
                    message: message || "Update file via Genie",
                    content: Buffer.from(content).toString("base64"),
                    branch: branch || "main",
                    sha
                });
                break;

            case "create_pr":
                if (!branch) {
                    return NextResponse.json({ error: 'Validation Error', details: 'branch is required for create_pr' }, { status: 400 });
                }
                result = await octokit.rest.pulls.create({
                    owner,
                    repo: repoName,
                    title: title || "New Pull Request from Genie",
                    head: branch,
                    base: "main",
                    body: message || "Automated PR created by Genie AI"
                });
                break;

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        return NextResponse.json({ success: true, data: result.data });

    } catch (error: any) {
        console.error("[GitHub Execute] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
