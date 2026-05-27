import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getGitHubUserProfile } from "@/lib/github";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { encrypt } from "@/lib/encryption";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
        return NextResponse.json({ error: "Missing code or state parameter" }, { status: 400 });
    }

    // CSRF Protection using cookies
    const cookieStore = await cookies();
    const savedState = cookieStore.get("github_oauth_state")?.value;

    if (!savedState || state !== savedState) {
        return NextResponse.json({ error: "Invalid state parameter. CSRF validation failed." }, { status: 403 });
    }

    // Clear the cookie after successful validation
    cookieStore.delete("github_oauth_state");

    try {
        const rawAccessToken = await exchangeCodeForToken(code);
        const encryptedAccessToken = encrypt(rawAccessToken);
        
        // Fetch the user's GitHub profile for explicit account linking
        const githubUser = await getGitHubUserProfile(rawAccessToken);

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        const metadata = {
            github_user_id: githubUser.id,
            github_login: githubUser.login,
            github_email: githubUser.email || null,
        };

        const { error } = await supabaseAdmin
            .from('user_integrations')
            .upsert({
                user_id: userId,
                service_name: 'github',
                access_token_encrypted: encryptedAccessToken,
                refresh_token_encrypted: null, // GitHub OAuth doesn't always provide refresh tokens depending on the flow
                scopes: ['repo', 'read:user', 'user:email'],
                is_connected: true,
                metadata: metadata,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, service_name'
            });

        if (error) {
            console.error("[GitHub Callback] Supabase Upsert Error:", error);
            throw new Error("Failed to save integration to database");
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        return NextResponse.redirect(`${appUrl}/settings?github=connected`);

    } catch (error: any) {
        console.error("[GitHub Auth] Error:", error);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        return NextResponse.redirect(`${appUrl}/settings?github=error&message=${encodeURIComponent(error.message)}`);
    }
}
