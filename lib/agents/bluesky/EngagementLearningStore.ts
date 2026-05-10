import type { BlueskyCommentClass, BlueskyReplyDecision, BlueskyMention } from "./types";
import type { BlueskyKnowledgePacket } from "./knowledgePackets";

export interface EngagementLearningRecord {
  capturedAt: string;
  authorHandle: string;
  text: string;
  commentClass: BlueskyCommentClass;
  action: BlueskyReplyDecision["action"];
  rationale: string;
  packetId?: string;
  packetTitle?: string;
}

export class EngagementLearningStore {
  private readonly records: EngagementLearningRecord[] = [];

  capture(params: {
    mention: BlueskyMention;
    decision: BlueskyReplyDecision;
    packet?: BlueskyKnowledgePacket;
  }): EngagementLearningRecord {
    const record: EngagementLearningRecord = {
      capturedAt: new Date().toISOString(),
      authorHandle: params.mention.authorHandle,
      text: params.mention.text,
      commentClass: params.decision.commentClass,
      action: params.decision.action,
      rationale: params.decision.rationale,
      packetId: params.packet?.topicId,
      packetTitle: params.packet?.topicTitle,
    };

    this.records.push(record);
    return record;
  }

  list(): EngagementLearningRecord[] {
    return [...this.records];
  }

  summarizeRecurringQuestions(): Array<{ key: string; count: number }> {
    const counts = new Map<string, number>();

    for (const record of this.records) {
      if (
        record.commentClass === "technical_question" ||
        record.commentClass === "clarification_request" ||
        record.commentClass === "skepticism" ||
        record.commentClass === "product_curiosity"
      ) {
        const key = this.normalize(record.text);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }

  private normalize(text: string): string {
    return text.toLowerCase().replace(/\s+/g, " ").trim();
  }
}
