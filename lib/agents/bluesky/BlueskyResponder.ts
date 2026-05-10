import type { BlueskyMention } from "./types";
import { EngagementLearningStore } from "./EngagementLearningStore";
import { BlueskyNotificationPlanner } from "./BlueskyNotificationPlanner";
import type { BlueskyKnowledgePacket } from "./knowledgePackets";

export interface BlueskyResponderDeps {
  generateReply: (prompt: string) => Promise<string>;
  sendReply: (mention: BlueskyMention, text: string) => Promise<void>;
  sendLike?: (mention: BlueskyMention) => Promise<void>;
}

export class BlueskyResponder {
  private readonly notificationPlanner = new BlueskyNotificationPlanner();
  private readonly learningStore = new EngagementLearningStore();

  constructor(private readonly deps: BlueskyResponderDeps) {}

  async handleMention(mention: BlueskyMention): Promise<void> {
    const plan = this.notificationPlanner.plan(mention);

    if (plan.action === "skip") {
      await this.learningStore.capture({
        mention,
        decision: {
          action: "skip",
          commentClass: plan.commentClass,
          rationale: plan.rationale,
          suggestedReplyStyle: plan.responseStyle,
        },
        packet: plan.packet,
        sourceContext: "mention",
      });
      return;
    }

    if (plan.action === "like_only") {
      await this.learningStore.capture({
        mention,
        decision: {
          action: "like",
          commentClass: plan.commentClass,
          rationale: plan.rationale,
          suggestedReplyStyle: plan.responseStyle,
        },
        packet: plan.packet,
        sourceContext: "mention",
      });
      if (this.deps.sendLike) {
        await this.deps.sendLike(mention);
      }
      return;
    }

    if (plan.action === "defer_for_topic" || plan.action === "escalate") {
      await this.learningStore.capture({
        mention,
        decision: {
          action: "skip",
          commentClass: plan.commentClass,
          rationale: plan.rationale,
          suggestedReplyStyle: plan.responseStyle,
        },
        packet: plan.packet,
        sourceContext: "mention",
      });
      return;
    }

    const prompt = this.buildReplyPrompt(mention, plan.responseStyle ?? "direct", plan.packet);
    const reply = await this.deps.generateReply(prompt);
    const trimmedReply = reply.trim();
    await this.deps.sendReply(mention, trimmedReply);

    await this.learningStore.capture({
      mention,
      decision: {
        action: "reply",
        commentClass: plan.commentClass,
        rationale: plan.rationale,
        suggestedReplyStyle: plan.responseStyle,
      },
      packet: plan.packet,
      sourceContext: "mention",
      replyText: trimmedReply,
      postTopic: plan.packet?.topicTitle,
    });
  }

  async getEngagementSummary() {
    return this.learningStore.summarizeRecurringQuestions();
  }

  private buildReplyPrompt(
    mention: BlueskyMention,
    style: "direct" | "clarifying" | "skeptical" | "curious" | "warm",
    packet?: BlueskyKnowledgePacket
  ): string {
    const packetContext = packet
      ? [
          `Relevant topic: ${packet.topicTitle}`,
          `Safe claim: ${packet.safeClaim}`,
          `Why it matters: ${packet.whyItMatters}`,
          `Preferred framing: ${packet.preferredFraming}`,
          `Anti-hype boundary: ${packet.antiHypeBoundary}`,
          `Likely follow-up questions: ${packet.followUpQuestionsLikely.join(" | ")}`,
          `Reply seeds: ${packet.replySeeds.join(" | ")}`,
          `Status: ${packet.status}`,
        ].join("\n")
      : "No strong topic packet matched. Reply narrowly and avoid overclaiming.";

    return [
      "Write one concise Bluesky reply for Tech Genie / Genie AI.",
      `Reply style: ${style}.`,
      "Answer the actual comment directly.",
      "Be grounded, useful, and non-defensive.",
      "Do not use vague AI hype.",
      "If the capability is only partially live, say so honestly.",
      "Do not use hashtags.",
      "Do not use em dashes.",
      "Keep it within normal Bluesky reply length.",
      "",
      `Incoming comment: ${mention.text}`,
      "",
      "RELEVANT CONTEXT:",
      packetContext,
      "",
      "OUTPUT REQUIREMENTS:",
      "- one reply only",
      "- no bullet list",
      "- no surrounding quotes",
      "- answer before branding",
    ].join("\n");
  }
}
