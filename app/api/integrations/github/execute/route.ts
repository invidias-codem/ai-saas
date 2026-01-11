import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, repo, path, message, content, branch, title } = body;

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
                // Commit equivalent
                // First get SHA if updating
                let sha;
                if (action === "update_file") {
                    try {
                        const existing = await octokit.rest.repos.getContent({ owner, repo: repoName, path });
                        if (!Array.isArray(existing.data) && 'sha' in existing.data) {
                            sha = existing.data.sha;
                        }
                    } catch (e) {
                        // Ignore if creating check
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
