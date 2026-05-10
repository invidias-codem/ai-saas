import { ReplyDecisionEngine } from "./ReplyDecisionEngine";
import { STARTER_BLUESKY_KNOWLEDGE_PACKETS, type BlueskyKnowledgePacket } from "./knowledgePackets";
import type { BlueskyCommentClass, BlueskyMention, BlueskyReplyDecision } from "./types";

export type BlueskyNotificationAction = "reply_now" | "like_only" | "skip" | "defer_for_topic" | "escalate";

export interface BlueskyNotificationPlan {
  action: BlueskyNotificationAction;
  commentClass: BlueskyCommentClass;
  packet?: BlueskyKnowledgePacket;
  rationale: string;
  confidence: number;
  responseStyle?: BlueskyReplyDecision["suggestedReplyStyle"];
  shouldLogAsRecurringQuestionCandidate: boolean;
}

export class BlueskyNotificationPlanner {
  private readonly decisionEngine = new ReplyDecisionEngine();

  plan(mention: BlueskyMention): BlueskyNotificationPlan {
    const packet = this.findRelevantPacket(mention.text);
    const decision = this.decisionEngine.decide(mention.text, packet);

    return {
      action: this.mapAction(decision.action, decision.commentClass),
      commentClass: decision.commentClass,
      packet,
      rationale: decision.rationale,
      confidence: this.estimateConfidence(decision.commentClass, !!packet),
      responseStyle: decision.suggestedReplyStyle,
      shouldLogAsRecurringQuestionCandidate: this.isRecurringQuestionCandidate(decision.commentClass),
    };
  }

  private mapAction(
    action: BlueskyReplyDecision["action"],
    commentClass: BlueskyCommentClass
  ): BlueskyNotificationAction {
    if (commentClass === "feature_request") {
      return "defer_for_topic";
    }

    switch (action) {
      case "reply":
        return "reply_now";
      case "like":
        return "like_only";
      case "skip":
      default:
        return commentClass === "noise" ? "skip" : "defer_for_topic";
    }
  }

  private estimateConfidence(commentClass: BlueskyCommentClass, hasPacket: boolean): number {
    const base = hasPacket ? 0.85 : 0.65;

    switch (commentClass) {
      case "technical_question":
      case "clarification_request":
        return base;
      case "skepticism":
      case "product_curiosity":
        return base - 0.05;
      case "feature_request":
      case "compliment":
        return base - 0.1;
      case "noise":
      default:
        return 0.2;
    }
  }

  private isRecurringQuestionCandidate(commentClass: BlueskyCommentClass): boolean {
    return [
      "technical_question",
      "clarification_request",
      "skepticism",
      "product_curiosity",
    ].includes(commentClass);
  }

  private findRelevantPacket(text: string): BlueskyKnowledgePacket | undefined {
    const normalized = text.toLowerCase();

    return STARTER_BLUESKY_KNOWLEDGE_PACKETS.find((packet) => {
      const haystack = [
        packet.topicTitle,
        packet.summary,
        packet.safeClaim,
        ...packet.followUpQuestionsLikely,
        ...packet.replySeeds,
      ]
        .join(" ")
        .toLowerCase();

      const topicWords = packet.topicTitle.toLowerCase().split(/\s+/).filter(Boolean);
      return topicWords.some((word) => word.length > 3 && normalized.includes(word)) || haystack.includes(normalized);
    });
  }
}
