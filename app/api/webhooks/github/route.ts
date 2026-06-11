import { NextRequest, NextResponse } from "next/server";
import {
  verifyGitHubWebhookSignature,
  WebhookSignatureError,
} from "@/lib/github-webhook";
import { inngest } from "@/lib/inngest/client";
import { supabaseAdmin } from "@/lib/supabaseClient";
import type { GitHubRepoSyncEvent } from "@/lib/inngest/client";

/**
 * POST /api/webhooks/github
 *
 * Receives push events from the GitHub App and triggers a durable Inngest
 * sync. This is the real-time complement to the manual install sync.
 *
 * Security:
 *   Every request is verified with HMAC-SHA256 against GITHUB_APP_WEBHOOK_SECRET
 *   before any payload processing occurs. An invalid signature returns 401 and
 *   short-circuits — no Inngest events are dispatched.
 *
 * App Router note:
 *   Unlike the Pages Router (which required `export const config` to disable
 *   body parsing), the App Router lets us read the raw body directly via
 *   `request.text()`. This is mandatory for HMAC verification — any JSON.parse()
 *   before hashing would invalidate the signature.
 *
 * Supported events:
 *   push  → triggers github/repo.sync (Inngest handles deduplication via concurrency key)
 *   ping  → returns 200 OK (used during App configuration to validate the endpoint)
 */
export async function POST(request: NextRequest) {
  // 1. Read raw body FIRST (before any parsing) — required for HMAC verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event");

  // 2. Verify signature — returns 401 on failure (blocks all further processing)
  try {
    verifyGitHubWebhookSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn("[GitHub Webhook] Signature verification failed:", err.message);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  // 3. Handle ping (GitHub sends this when you first configure a webhook)
  if (eventType === "ping") {
    return NextResponse.json({ ok: true });
  }

  // 4. Only process push events
  if (eventType !== "push") {
    return NextResponse.json({ ok: true, skipped: eventType });
  }

  // 5. Parse validated payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoFullName: string = payload.repository?.full_name;
  const commitSha: string = payload.after;
  const installationId: number = payload.installation?.id;

  if (!repoFullName || !installationId) {
    console.warn("[GitHub Webhook] Missing required fields in push payload");
    return NextResponse.json({ ok: true, skipped: "missing_fields" });
  }

  // 6. Look up the Clerk user_id for this installation
  let userId: string | null = null;
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("github_installations")
      .select("user_id")
      .eq("installation_id", installationId)
      .single();
    userId = data?.user_id ?? null;
  }

  if (!userId) {
    // Installation not linked to any Lattice OS user — skip silently
    console.warn(`[GitHub Webhook] No user found for installation ${installationId}`);
    return NextResponse.json({ ok: true, skipped: "no_user" });
  }

  // 7. Mark sync as pending in Supabase for UI feedback
  if (supabaseAdmin) {
    await supabaseAdmin.from("github_repo_syncs").upsert(
      {
        user_id: userId,
        repo: repoFullName,
        status: "pending",
        last_commit: commitSha,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,repo" }
    );
  }

  // 8. Dispatch Inngest event — returns immediately, sync runs in background
  const [owner, repo] = repoFullName.split("/");
  const syncEvent: GitHubRepoSyncEvent = {
    name: "github/repo.sync",
    data: {
      installationId,
      owner,
      repo,
      userId,
      triggeredBy: "push",
      commitSha,
    },
  };

  await inngest.send(syncEvent);

  console.log(
    `[GitHub Webhook] Queued push sync for ${repoFullName} @ ${commitSha.substring(0, 7)}`
  );

  // Always return 200 quickly — GitHub retries on non-2xx responses
  return NextResponse.json({ ok: true, queued: repoFullName });
}
