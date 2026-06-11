import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAppOctokit } from "@/lib/github-app";
import { inngest } from "@/lib/inngest/client";
import { supabaseAdmin } from "@/lib/supabaseClient";
import type { GitHubRepoSyncEvent } from "@/lib/inngest/client";

const DASHBOARD_URL = "/dashboard"; // redirect after successful connection

/**
 * GET /api/github/app/callback
 *
 * Called by GitHub after the user installs (or updates) the Lattice OS GitHub App.
 * GitHub appends ?installation_id=<N>&setup_action=install&state=<token>.
 *
 * This route:
 *   1. Verifies the CSRF `state` token matches what was stored in /install
 *   2. Fetches installation metadata (owner login, accessible repos) via App-level API
 *   3. Persists the installation to `github_installations`
 *   4. Sends a `github/repo.sync` Inngest event for each accessible repo
 *   5. Redirects the user to the dashboard
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  const { searchParams } = new URL(req.url);
  const installationId = searchParams.get("installation_id");
  const setupAction = searchParams.get("setup_action");
  const state = searchParams.get("state");

  // Only handle new installs (not uninstalls or permission changes)
  if (setupAction !== "install" && setupAction !== "update") {
    return NextResponse.redirect(new URL(DASHBOARD_URL, req.url));
  }

  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id" }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  try {
    // 1. Verify CSRF state token
    if (state) {
      const { data: stateRow, error: stateError } = await supabaseAdmin
        .from("github_oauth_states")
        .select("state, expires_at")
        .eq("user_id", userId)
        .single();

      if (stateError || !stateRow) {
        console.error("[GitHub Callback] No state row found for user", userId);
        return NextResponse.redirect(new URL(`${DASHBOARD_URL}?error=github_auth_failed`, req.url));
      }

      if (stateRow.state !== state) {
        console.error("[GitHub Callback] State mismatch — possible CSRF");
        return NextResponse.redirect(new URL(`${DASHBOARD_URL}?error=github_auth_failed`, req.url));
      }

      if (new Date(stateRow.expires_at) < new Date()) {
        console.error("[GitHub Callback] State token expired");
        return NextResponse.redirect(new URL(`${DASHBOARD_URL}?error=github_auth_expired`, req.url));
      }

      // Consume state (one-time use)
      await supabaseAdmin
        .from("github_oauth_states")
        .delete()
        .eq("user_id", userId);
    }

    // 2. Fetch installation metadata via App-level API
    const appOctokit = getAppOctokit();
    const { data: installation } = await (appOctokit as any).request(
      "GET /app/installations/{installation_id}",
      { installation_id: parseInt(installationId, 10) }
    );

    const owner: string = installation.account?.login ?? "unknown";
    const installationIdNum = parseInt(installationId, 10);

    // 3. Persist installation to Supabase
    await supabaseAdmin.from("github_installations").upsert(
      {
        user_id: userId,
        installation_id: installationIdNum,
        owner,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "installation_id" }
    );

    // 4. Fetch accessible repositories for this installation
    const { data: reposData } = await (appOctokit as any).request(
      "GET /user/installations/{installation_id}/repositories",
      { installation_id: installationIdNum, per_page: 100 }
    );

    const repos: Array<{ name: string; full_name: string }> =
      reposData?.repositories ?? [];

    // Update repos list on the installation row
    if (repos.length > 0) {
      await supabaseAdmin
        .from("github_installations")
        .update({ repos: repos.map((r) => r.full_name) })
        .eq("installation_id", installationIdNum);
    }

    // 5. Fire Inngest sync event for each accessible repo
    const syncEvents: GitHubRepoSyncEvent[] = repos.map((r) => ({
      name: "github/repo.sync",
      data: {
        installationId: installationIdNum,
        owner: r.full_name.split("/")[0],
        repo: r.full_name.split("/")[1],
        userId,
        triggeredBy: "manual" as const,
      },
    }));

    if (syncEvents.length > 0) {
      await inngest.send(syncEvents);
      console.log(
        `[GitHub Callback] Queued sync for ${syncEvents.length} repos (installation ${installationId})`
      );
    }

    return NextResponse.redirect(
      new URL(`${DASHBOARD_URL}?github_connected=true&repos=${repos.length}`, req.url)
    );
  } catch (err: any) {
    console.error("[GitHub Callback] Error:", err);
    return NextResponse.redirect(
      new URL(`${DASHBOARD_URL}?error=github_sync_failed`, req.url)
    );
  }
}
