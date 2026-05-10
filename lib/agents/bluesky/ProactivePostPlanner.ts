import { STARTER_BLUESKY_KNOWLEDGE_PACKETS, type BlueskyKnowledgePacket } from "./knowledgePackets";

export interface ProactivePostPlan {
  topic: string;
  angle: string;
  rationale: string;
  supportingPoints: string[];
  packet?: BlueskyKnowledgePacket;
  generationBrief?: {
    safeClaim: string;
    whyItMatters: string;
    preferredFraming: string;
    antiHypeBoundary: string;
  };
}

const DEFAULT_POST_ANGLES = [
  "what changed",
  "why it matters",
  "what problem it solves",
];

export class ProactivePostPlanner {
  private packetCursor = 0;

  planNextPost(existingTopics: string[] = []): ProactivePostPlan {
    const packet = this.selectPacket(existingTopics);

    if (packet) {
      const angle = this.selectAngle(packet);
      return {
        topic: packet.topicTitle,
        angle,
        rationale: packet.summary,
        supportingPoints: [
          packet.safeClaim,
          packet.whyItMatters,
          `Evidence: ${packet.evidenceSources.join(", ")}`,
        ],
        packet,
        generationBrief: {
          safeClaim: packet.safeClaim,
          whyItMatters: packet.whyItMatters,
          preferredFraming: packet.preferredFraming,
          antiHypeBoundary: packet.antiHypeBoundary,
        },
      };
    }

    return {
      topic: "Genie AI update",
      angle: DEFAULT_POST_ANGLES[0],
      rationale: "Fallback planning path when no suitable knowledge packet is available.",
      supportingPoints: [
        "Use a concrete shipped update.",
        "Explain why it matters.",
        "Avoid vague AI language.",
      ],
    };
  }

  buildPromptContext(plan: ProactivePostPlan): string {
    const parts = [
      `Topic: ${plan.topic}`,
      `Angle: ${plan.angle}`,
      `Rationale: ${plan.rationale}`,
      `Supporting points: ${plan.supportingPoints.join(" | ")}`,
    ];

    if (plan.generationBrief) {
      parts.push(`Safe claim: ${plan.generationBrief.safeClaim}`);
      parts.push(`Why it matters: ${plan.generationBrief.whyItMatters}`);
      parts.push(`Preferred framing: ${plan.generationBrief.preferredFraming}`);
      parts.push(`Anti-hype boundary: ${plan.generationBrief.antiHypeBoundary}`);
    }

    if (plan.packet) {
      parts.push(`Packet status: ${plan.packet.status}`);
      parts.push(`Likely follow-up questions: ${plan.packet.followUpQuestionsLikely.join(" | ")}`);
    }

    return parts.join("\n");
  }

  private selectPacket(existingTopics: string[]): BlueskyKnowledgePacket | null {
    if (STARTER_BLUESKY_KNOWLEDGE_PACKETS.length === 0) {
      return null;
    }

    const normalizedExisting = new Set(existingTopics.map((topic) => topic.toLowerCase()));
    const candidates = STARTER_BLUESKY_KNOWLEDGE_PACKETS.filter(
      (packet) => !normalizedExisting.has(packet.topicTitle.toLowerCase())
    );

    const pool = candidates.length > 0 ? candidates : STARTER_BLUESKY_KNOWLEDGE_PACKETS;
    const packet = pool[this.packetCursor % pool.length];
    this.packetCursor += 1;
    return packet;
  }

  private selectAngle(packet: BlueskyKnowledgePacket): string {
    if (!packet.postAngles.length) {
      return DEFAULT_POST_ANGLES[0];
    }

    const angleIndex = this.packetCursor % packet.postAngles.length;
    return packet.postAngles[angleIndex] ?? packet.postAngles[0];
  }
}
