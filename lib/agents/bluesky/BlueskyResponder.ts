import { ReplyDecisionEngine } from "./ReplyDecisionEngine";
import type { BlueskyMention } from "./types";
import { STARTER_BLUESKY_KNOWLEDGE_PACKETS, type BlueskyKnowledgePacket } from "./knowledgePackets";
import { EngagementLearningStore } from "./EngagementLearningStore";

export interface BlueskyResponderDeps {
  generateReply: (prompt: string) => Promise<string>;
  sendReply: (mention: BlueskyMention, text: string) => Promise<void>;
  sendLike?: (mention: BlueskyMention) => Promise<void>;
}

export class BlueskyResponder {
  private readonly decisionEngine = new ReplyDecisionEngine();
  private readonly learningStore = new EngagementLearningStore();

  constructor(private readonly deps: BlueskyResponderDeps) {}

  async handleMention(mention: BlueskyMention): Promise<void> {
    const packet = this.findRelevantPacket(mention.text);
    const decision = this.decisionEngine.decide(mention.text, packet);

    this.learningStore.capture({ mention, decision, packet });

    if (decision.action === "skip") {
      return;
    }

    if (decision.action === "like") {
      if (this.deps.sendLike) {
        await this.deps.sendLike(mention);
      }
      return;
    }

    const prompt = this.buildReplyPrompt(mention, decision.suggestedReplyStyle ?? "direct", packet);
    const reply = await this.deps.generateReply(prompt);
    await this.deps.sendReply(mention, reply.trim());
  }

  getEngagementSummary() {
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
