import { Octokit } from "octokit";
import { supabaseAdmin } from "@/lib/supabaseClient";
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

export async function getGitHubUserProfile(accessToken: string) {
    const octokit = getOctokit(accessToken);
    const { data: user } = await octokit.rest.users.getAuthenticated();
    
    // Also try to get emails if public email is null
    let email = user.email;
    if (!email) {
        try {
            const { data: emails } = await octokit.rest.users.listEmailsForAuthenticatedUser();
            const primaryEmail = emails.find((e: any) => e.primary);
            if (primaryEmail) {
                email = primaryEmail.email;
            } else if (emails.length > 0) {
                email = emails[0].email;
            }
        } catch (e) {
            console.warn("Could not fetch emails for GitHub user", e);
        }
    }

    return {
        id: user.id.toString(),
        login: user.login,
        email: email
    };
}

export async function getGitHubClientForUser(userId: string): Promise<Octokit | null> {
    try {
        if (!supabaseAdmin) {
            console.error("Supabase Admin client not initialized");
            return null;
        }

        const { data, error } = await supabaseAdmin
            .from('user_integrations')
            .select('access_token_encrypted')
            .eq('user_id', userId)
            .eq('service_name', 'github')
            .single();

        if (error || !data || !data.access_token_encrypted) {
            return null;
        }

        const decryptedToken = decrypt(data.access_token_encrypted);
        return getOctokit(decryptedToken);
    } catch (error) {
        console.error(`[GitHub Client] Failed to get client for user ${userId}:`, error);
        return null;
    }
}
