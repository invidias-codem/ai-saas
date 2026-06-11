import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getInstallationUrl } from "@/lib/github-app";
import { requireEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { randomBytes } from "crypto";

/**
 * GET /api/github/app/install
 *
 * Redirects the authenticated user to the GitHub App installation page.
 * Generates and persists a CSRF `state` token in Supabase so the callback
 * route can verify the redirect is genuine and not a CSRF attack.
 *
 * Query params:
 *   repo (optional) - "owner/repo" hint to pre-select during installation
 *
 * Flow:
 *   1. User clicks "Connect Repository" in the Lattice OS UI
 *   2. Frontend calls GET /api/github/app/install?repo=owner/repo
 *   3. This route stores a state token and redirects to github.com/apps/...
 *   4. GitHub redirects back to /api/github/app/callback with installation_id + state
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Generate a cryptographically random CSRF state token
    const state = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min TTL

    // Persist state for verification in the callback
    if (supabaseAdmin) {
      await supabaseAdmin.from("github_oauth_states").upsert(
        { user_id: userId, state, expires_at: expiresAt },
        { onConflict: "user_id" }
      );
    }

    const installUrl = getInstallationUrl(state);
    return NextResponse.redirect(installUrl);
  } catch (err: any) {
    console.error("[GitHub App Install] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
