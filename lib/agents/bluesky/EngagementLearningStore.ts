import type { BlueskyCommentClass, BlueskyReplyDecision, BlueskyMention } from "./types";
import type { BlueskyKnowledgePacket } from "./knowledgePackets";
import { supabase } from "@/lib/supabaseClient";

export interface EngagementLearningRecord {
  capturedAt: string;
  sourceContext: "own_post_reply" | "mention" | "discovery_engagement";
  authorDid?: string;
  authorHandle: string;
  commentUri?: string;
  commentCid?: string;
  text: string;
  normalizedCommentText: string;
  commentClass: BlueskyCommentClass;
  action: BlueskyReplyDecision["action"];
  rationale: string;
  suggestedReplyStyle?: BlueskyReplyDecision["suggestedReplyStyle"];
  packetId?: string;
  packetTitle?: string;
  topicKey?: string;
  replyText?: string;
  postUri?: string;
  postTopic?: string;
  isRecurringQuestionCandidate: boolean;
}

export class EngagementLearningStore {
  async capture(params: {
    mention: BlueskyMention;
    decision: BlueskyReplyDecision;
    packet?: BlueskyKnowledgePacket;
    sourceContext?: EngagementLearningRecord["sourceContext"];
    replyText?: string;
    postUri?: string;
    postTopic?: string;
  }): Promise<EngagementLearningRecord> {
    const normalizedCommentText = this.normalize(params.mention.text);
    const isRecurringQuestionCandidate = [
      "technical_question",
      "clarification_request",
      "skepticism",
      "product_curiosity",
    ].includes(params.decision.commentClass);

    const record: EngagementLearningRecord = {
      capturedAt: new Date().toISOString(),
      sourceContext: params.sourceContext ?? "mention",
      authorDid: params.mention.authorDid,
      authorHandle: params.mention.authorHandle,
      commentUri: params.mention.uri,
      commentCid: params.mention.cid,
      text: params.mention.text,
      normalizedCommentText,
      commentClass: params.decision.commentClass,
      action: params.decision.action,
      rationale: params.decision.rationale,
      suggestedReplyStyle: params.decision.suggestedReplyStyle,
      packetId: params.packet?.topicId,
      packetTitle: params.packet?.topicTitle,
      topicKey: params.packet?.topicType,
      replyText: params.replyText,
      postUri: params.postUri,
      postTopic: params.postTopic,
      isRecurringQuestionCandidate,
    };

    const { error } = await supabase.from("bluesky_engagement_learning").insert({
      source_context: record.sourceContext,
      author_did: record.authorDid ?? null,
      author_handle: record.authorHandle,
      comment_uri: record.commentUri ?? null,
      comment_cid: record.commentCid ?? null,
      comment_text: record.text,
      normalized_comment_text: record.normalizedCommentText,
      comment_class: record.commentClass,
      action_taken: record.action,
      rationale: record.rationale,
      suggested_reply_style: record.suggestedReplyStyle ?? null,
      packet_id: record.packetId ?? null,
      packet_title: record.packetTitle ?? null,
      topic_key: record.topicKey ?? null,
      reply_text: record.replyText ?? null,
      post_uri: record.postUri ?? null,
      post_topic: record.postTopic ?? null,
      is_recurring_question_candidate: record.isRecurringQuestionCandidate,
    });

    if (error) {
      console.error("[Bluesky] Failed to persist engagement learning record", error);
    }

    return record;
  }

  async summarizeRecurringQuestions(limit = 20): Promise<Array<{ key: string; count: number }>> {
    const { data, error } = await supabase
      .from("bluesky_engagement_learning")
      .select("normalized_comment_text")
      .eq("is_recurring_question_candidate", true)
      .limit(500);

    if (error || !data) {
      if (error) {
        console.error("[Bluesky] Failed to summarize recurring questions", error);
      }
      return [];
    }

    const counts = new Map<string, number>();
    for (const row of data) {
      const key = String(row.normalized_comment_text || "");
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getDeferredPacketCounts(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from("bluesky_engagement_learning")
      .select("packet_id")
      .eq("action_taken", "skip")
      .not("packet_id", "is", null)
      .limit(500);

    if (error || !data) {
      if (error) {
        console.error("[Bluesky] Failed to load deferred packet counts", error);
      }
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data) {
      const packetId = String(row.packet_id || "");
      if (!packetId) continue;
      counts[packetId] = (counts[packetId] ?? 0) + 1;
    }

    return counts;
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }
}
