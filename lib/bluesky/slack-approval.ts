// lib/bluesky/slack-approval.ts
// Bridges the bluesky_reply_queue to Slack for human approval.
// Posts pending replies to a dedicated channel with Approve/Reject buttons.

import { supabaseAdmin } from "@/lib/supabaseClient";

const SLACK_API_BASE = "https://slack.com/api";

interface SlackMessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

/**
 * Posts a pending Bluesky reply to the approval channel.
 * Returns the message timestamp for threading.
 */
export async function postApprovalRequestToSlack(queueItemId: string): Promise<SlackMessageResult> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const approvalChannel = process.env.BLUESKY_APPROVAL_CHANNEL || "#bluesky-approval";

  if (!botToken) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }

  // Load the queue item
  if (!supabaseAdmin) return { ok: false, error: "Supabase not configured" };

  const { data: item, error } = await supabaseAdmin
    .from("bluesky_reply_queue")
    .select("*")
    .eq("id", queueItemId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !item) {
    return { ok: false, error: "Queue item not found" };
  }

  // Build the approval message
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🔵 Bluesky Reply Pending Approval",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Source:* ${item.source_author}\n*Original Post:*\n> ${item.source_text.slice(0, 300)}${item.source_text.length > 300 ? "..." : ""}`,
      },
    },
    {
      type: "divider" as const,
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Drafted Reply:*\n> ${item.reply_text}`,
      },
    },
    {
      type: "context" as const,
      elements: [
        {
          type: "mrkdwn" as const,
          text: `Claims extracted: ${item.extracted_claims?.length ?? 0} | Confidence: ${((item.confidence ?? 0) * 100).toFixed(0)}%`,
        },
      ],
    },
    {
      type: "actions" as const,
      elements: [
        {
          type: "button" as const,
          text: {
            type: "plain_text" as const,
            text: "✅ Approve & Post",
          },
          style: "primary",
          action_id: "bluesky_approve",
          value: queueItemId,
        },
        {
          type: "button" as const,
          text: {
            type: "plain_text" as const,
            text: "❌ Reject",
          },
          style: "danger",
          action_id: "bluesky_reject",
          value: queueItemId,
        },
        {
          type: "button" as const,
          text: {
            type: "plain_text" as const,
            text: "🔗 View Source",
          },
          url: item.source_uri.replace("at://", "https://bsky.app/profile/"),
          action_id: "bluesky_view_source",
        },
      ],
    },
  ];

  try {
    const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: approvalChannel,
        text: `Bluesky reply pending approval from ${item.source_author}`,
        blocks,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { ok: false, error: data.error };
    }

    return { ok: true, ts: data.ts, channel: data.channel };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Updates the approval message after action is taken.
 */
export async function updateApprovalMessage(
  channel: string,
  ts: string,
  action: "approved" | "rejected",
  replyUri?: string
): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  const emoji = action === "approved" ? "✅" : "❌";
  const text =
    action === "approved"
      ? `${emoji} Reply approved and posted to Bluesky.${replyUri ? `\n<${replyUri}|View post>` : ""}`
      : `${emoji} Reply rejected.`;

  await fetch(`${SLACK_API_BASE}/chat.update`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      ts,
      text,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text },
        },
      ],
    }),
  });
}

/**
 * Processes all pending items and posts them to Slack.
 * Called by the bluesky-feed-poll cron after queueing items.
 */
export async function notifyPendingApprovals(): Promise<number> {
  if (!supabaseAdmin) return 0;

  const { data: pending } = await supabaseAdmin
    .from("bluesky_reply_queue")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (!pending || pending.length === 0) return 0;

  let notified = 0;
  for (const item of pending) {
    const result = await postApprovalRequestToSlack(item.id);
    if (result.ok) {
      notified++;
    }
  }

  return notified;
}

// ─── Approval Handler ─────────────────────────────────────────────────────────

export interface ApprovalContext {
  channel?: string;
  messageTs?: string;
  userId?: string;
  responseUrl?: string;
}

/**
 * Handles approve/reject actions from Slack interactivity payloads.
 * Approve → posts reply to AT Protocol → updates queue to 'posted'
 * Reject → updates queue to 'rejected'
 */
export async function handleBlueskyApproval(
  approved: boolean,
  queueItemId: string,
  context: ApprovalContext
): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    // Load the queue item
    const { data: item } = await supabaseAdmin
      .from("bluesky_reply_queue")
      .select("*")
      .eq("id", queueItemId)
      .eq("status", "pending")
      .maybeSingle();

    if (!item) {
      console.warn(`[BlueskyApproval] Queue item ${queueItemId} not found or not pending`);
      return;
    }

    if (approved) {
      // Post to AT Protocol
      const { getBlueskyClient } = await import("@/lib/bluesky/client");
      const client = await getBlueskyClient();

      const result = await client.postReply(item.source_uri, item.source_cid, item.reply_text);

      // Update queue to posted
      await supabaseAdmin
        .from("bluesky_reply_queue")
        .update({
          status: "posted",
          reply_uri: result.uri,
          reviewed_at: new Date().toISOString(),
          reviewed_by: context.userId,
        })
        .eq("id", queueItemId);

      // Update Slack message
      if (context.channel && context.messageTs) {
        await updateApprovalMessage(context.channel, context.messageTs, "approved", result.uri);
      }

      console.log(`[BlueskyApproval] Posted reply ${result.uri}`);
    } else {
      // Reject
      await supabaseAdmin
        .from("bluesky_reply_queue")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: context.userId,
        })
        .eq("id", queueItemId);

      // Update Slack message
      if (context.channel && context.messageTs) {
        await updateApprovalMessage(context.channel, context.messageTs, "rejected");
      }

      console.log(`[BlueskyApproval] Rejected reply ${queueItemId}`);
    }
  } catch (err: any) {
    console.error("[BlueskyApproval] Error:", err.message);

    // Update queue with error
    await supabaseAdmin
      .from("bluesky_reply_queue")
      .update({
        status: "failed",
        error_message: err.message,
      })
      .eq("id", queueItemId);
  }
}
