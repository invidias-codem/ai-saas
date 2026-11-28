// app/api/cron/bluesky-feed-poll/route.ts
//
// Vercel Cron Route — Bluesky Feed Polling Agent
//
// Polls targeted AT-URI feeds for high-signal technical discourse.
// Extracts claims → pumps into World Model → drafts replies for approval.
//
// Schedule: every 3 minutes (configured in vercel.json)

import { NextRequest, NextResponse } from "next/server";
import { getBlueskyClient } from "@/lib/bluesky/client";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { processChunkForKnowledgeGraph } from "@/lib/workspace/entity-extraction";
import { extractEntities } from "@/lib/workspace/entity-extraction";
import { requireCronAuth } from "@/lib/security/cronAuth";
import { logEvent } from "@/lib/telemetry";

export const maxDuration = 300;
const MAX_FEEDS_PER_RUN = 5;
const MAX_POSTS_PER_FEED = 25;

export async function GET(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: "BlueskyFeedPollCron" });
  if (authFailure) return authFailure;

  const runId = crypto.randomUUID();
  const startTime = Date.now();

  console.log(JSON.stringify({ runId, event: "bluesky_poll_start" }));

  let feedsPolled = 0;
  let postsProcessed = 0;
  let claimsExtracted = 0;
  let repliesDrafted = 0;
  const errors: string[] = [];

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, errors: ["Supabase not initialized"] }, { status: 500 });
  }

  try {
    const client = await getBlueskyClient();

    // 1. Load target feeds
    const { data: feeds } = await supabaseAdmin
      .from("bluesky_feeds")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .limit(MAX_FEEDS_PER_RUN);

    if (!feeds || feeds.length === 0) {
      return NextResponse.json({
        success: true,
        feedsPolled: 0,
        postsProcessed: 0,
        claimsExtracted: 0,
        repliesDrafted: 0,
        durationMs: Date.now() - startTime,
      });
    }

    for (const feed of feeds) {
      try {
        // 2. Load cursor for this feed
        const { data: cursorData } = await supabaseAdmin
          .from("bluesky_cursors")
          .select("*")
          .eq("feed_uri", feed.feed_uri)
          .maybeSingle();

        const lastCursor = cursorData?.last_cursor ?? null;
        const lastPostCid = cursorData?.last_post_cid ?? null;

        // 3. Fetch posts
        let result;
        if (feed.feed_type === "author") {
          result = await client.fetchAuthorFeed(
            feed.feed_uri.replace("at://", "").split("/")[0],
            lastCursor,
            MAX_POSTS_PER_FEED
          );
        } else {
          result = await client.fetchFeed(feed.feed_uri, lastCursor, MAX_POSTS_PER_FEED);
        }

        if (result.posts.length === 0) {
          await supabaseAdmin
            .from("bluesky_feeds")
            .update({ last_polled_at: new Date().toISOString() })
            .eq("id", feed.id);
          continue;
        }

        // 4. Filter out already-processed posts (by CID)
        let newPosts = result.posts;
        if (lastPostCid) {
          const lastIndex = result.posts.findIndex((p) => p.cid === lastPostCid);
          if (lastIndex >= 0) {
            newPosts = result.posts.slice(0, lastIndex);
          }
        }

        // 5. Process each new post
        for (const post of newPosts) {
          try {
            // Extract entities from post text
            const extraction = await extractEntities(post.text);

            if (extraction.entities.length > 0) {
              // Pump into World Model via knowledge graph extraction
              // Use the post URI as a synthetic source ID
              const kgResult = await processChunkForKnowledgeGraph({
                workspaceId: `bluesky-${post.author.did.replace(/[^a-zA-Z0-9]/g, "")}`,
                userId: "bluesky-agent",
                sourceChunkId: post.uri,
                content: post.text,
                originUri: post.uri,
              });

              claimsExtracted += kgResult.nodeIds.length;

              // 6. Draft a reply if we extracted meaningful claims
              if (extraction.entities.length >= 2) {
                const replyText = await draftReply(post, extraction);
                if (replyText) {
                  await supabaseAdmin.from("bluesky_reply_queue").insert({
                    status: "pending",
                    source_uri: post.uri,
                    source_cid: post.cid,
                    source_author: post.author.handle,
                    source_text: post.text,
                    reply_text: replyText,
                    extracted_claims: extraction as any,
                    causal_edges: kgResult as any,
                    confidence: extraction.entities[0]?.confidence ?? 0.5,
                  });
                  repliesDrafted++;

                  // Telemetry: draft created
                  logEvent({
                    eventType: 'bluesky_draft_created',
                    userId: 'bluesky-agent',
                    metadata: { source_author: post.author.handle, source_uri: post.uri },
                  });
                }
              }
            }

            postsProcessed++;
          } catch (postErr: any) {
            errors.push(`Post ${post.uri}: ${postErr.message}`);
          }
        }

        // 7. Update cursor
        const latestPost = result.posts[0];
        await supabaseAdmin.from("bluesky_cursors").upsert(
          {
            feed_uri: feed.feed_uri,
            last_cursor: result.cursor,
            last_post_cid: latestPost?.cid,
            last_post_at: latestPost?.indexedAt
              ? new Date(latestPost.indexedAt).toISOString()
              : null,
            poll_count: (cursorData?.poll_count ?? 0) + 1,
          },
          { onConflict: "feed_uri" }
        );

        // 8. Update feed metadata
        await supabaseAdmin
          .from("bluesky_feeds")
          .update({
            last_polled_at: new Date().toISOString(),
            post_count: (feed.post_count ?? 0) + newPosts.length,
          })
          .eq("id", feed.id);

        feedsPolled++;
      } catch (feedErr: any) {
        errors.push(`Feed ${feed.feed_uri}: ${feedErr.message}`);
      }
    }

    const summary = {
      success: true,
      feedsPolled,
      postsProcessed,
      claimsExtracted,
      repliesDrafted,
      errors,
      durationMs: Date.now() - startTime,
    };

    console.log(JSON.stringify({ runId, event: "bluesky_poll_complete", ...summary }));

    // Notify Slack of pending approvals
    try {
      const { notifyPendingApprovals } = await import("@/lib/bluesky/slack-approval");
      const notified = await notifyPendingApprovals();
      if (notified > 0) {
        console.log(JSON.stringify({ runId, event: "bluesky_slack_notifications", count: notified }));
      }
    } catch (notifyErr: any) {
      console.warn(JSON.stringify({ runId, event: "bluesky_slack_notification_error", error: notifyErr.message }));
    }

    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ runId, event: "bluesky_poll_fatal", error: message }));
    return NextResponse.json(
      {
        success: false,
        feedsPolled,
        postsProcessed,
        claimsExtracted,
        repliesDrafted,
        errors: [message],
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}

// ─── Reply Drafting ────────────────────────────────────────────────────────

async function draftReply(
  post: { author: { handle: string }; text: string },
  extraction: { entities: any[] }
): Promise<string | null> {
  // Simple reply template citing extracted claims
  // In production, this would use Gemini-Flash to craft contextual replies
  if (extraction.entities.length < 2) return null;

  const topClaims = extraction.entities.slice(0, 3);
  const claimSummary = topClaims
    .map((e) => `${e.entity_name}: ${e.attribute} = ${e.value}`)
    .join("; ");

  // Don't auto-post — just draft for human review
  return `Interesting insights on ${topClaims[0]?.entity_name || "this topic"}.\n\nKey data points I'm tracking:\n${claimSummary}\n\nCurious to see how this evolves.`;
}
