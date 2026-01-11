
import { Octokit } from "octokit";
import { db } from "@/lib/firebaseAdmin";
import { decrypt } from "@/lib/encryption";

export async function exchangeCodeForToken(code: string): Promise<string> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing GitHub Client ID or Secret");
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
        }),
    });

    if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(`GitHub token error: ${data.error_description}`);
    }

    if (!data.access_token) {
        throw new Error("No access token received from GitHub");
    }

    return data.access_token;
}

export function getOctokit(accessToken: string) {
    return new Octokit({ auth: accessToken });
}

export async function getGitHubClientForUser(userId: string): Promise<Octokit | null> {
    try {
        const doc = await db.collection("users").doc(userId).collection("integrations").doc("github").get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data();
        if (!data || !data.accessToken) {
            return null;
        }

        const decryptedToken = decrypt(data.accessToken);
        return getOctokit(decryptedToken);
    } catch (error) {
        console.error(`[GitHub Client] Failed to get client for user ${userId}:`, error);
        return null;
    }
}
