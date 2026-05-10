import type { BlueskyKnowledgePacket } from "./knowledgePackets";

export type BlueskyCommentClass =
  | "technical_question"
  | "clarification_request"
  | "skepticism"
  | "product_curiosity"
  | "feature_request"
  | "compliment"
  | "noise";

export type BlueskyReplyAction = "reply" | "like" | "skip";

export interface BlueskyReplyDecision {
  action: BlueskyReplyAction;
  commentClass: BlueskyCommentClass;
  rationale: string;
  suggestedReplyStyle?: "direct" | "clarifying" | "skeptical" | "curious" | "warm";
}

export class ReplyDecisionEngine {
  classifyComment(text: string): BlueskyCommentClass {
    const normalized = text.toLowerCase().trim();

    if (!normalized) return "noise";

    if (this.isNoise(normalized)) return "noise";
    if (this.isFeatureRequest(normalized)) return "feature_request";
    if (this.isTechnicalQuestion(normalized)) return "technical_question";
    if (this.isClarificationRequest(normalized)) return "clarification_request";
    if (this.isSkepticism(normalized)) return "skepticism";
    if (this.isProductCuriosity(normalized)) return "product_curiosity";
    if (this.isCompliment(normalized)) return "compliment";

    return "product_curiosity";
  }

  decide(text: string, packet?: BlueskyKnowledgePacket): BlueskyReplyDecision {
    const commentClass = this.classifyComment(text);

    switch (commentClass) {
      case "technical_question":
        return {
          action: "reply",
          commentClass,
          rationale: "Direct technical question deserves a grounded answer.",
          suggestedReplyStyle: "direct",
        };
      case "clarification_request":
        return {
          action: "reply",
          commentClass,
          rationale: "Clarification request is high-value and improves understanding of the original claim.",
          suggestedReplyStyle: "clarifying",
        };
      case "skepticism":
        return {
          action: "reply",
          commentClass,
          rationale: "Good-faith skepticism should be met with a narrower, evidence-backed explanation.",
          suggestedReplyStyle: "skeptical",
        };
      case "product_curiosity":
        return {
          action: "reply",
          commentClass,
          rationale: "Product curiosity is a good opportunity to clarify what is live versus directional.",
          suggestedReplyStyle: "curious",
        };
      case "feature_request":
        return {
          action: "reply",
          commentClass,
          rationale: "Feature requests are useful engagement surfaces and should usually be acknowledged.",
          suggestedReplyStyle: "warm",
        };
      case "compliment":
        return {
          action: packet ? "reply" : "like",
          commentClass,
          rationale: packet
            ? "Compliment can justify a short reply when there is a clear product topic to reinforce."
            : "Compliment without a strong topic packet can be acknowledged with a like.",
          suggestedReplyStyle: "warm",
        };
      case "noise":
      default:
        return {
          action: "skip",
          commentClass,
          rationale: "Low-signal or noisy comment is not worth engaging.",
        };
    }
  }

  private isTechnicalQuestion(text: string): boolean {
    return (
      text.includes("how does") ||
      text.includes("how do you") ||
      text.includes("what does") ||
      text.includes("what do you mean") ||
      text.includes("how is") ||
      text.includes("runtime") ||
      text.includes("memory") ||
      text.includes("architecture") ||
      text.includes("api")
    );
  }

  private isClarificationRequest(text: string): boolean {
    return (
      text.includes("what do you mean") ||
      text.includes("meaning") ||
      text.includes("can you explain") ||
      text.includes("clarify")
    );
  }

  private isSkepticism(text: string): boolean {
    return (
      text.includes("sounds like") ||
      text.includes("isn't this") ||
      text.includes("is this just") ||
      text.includes("generic") ||
      text.includes("marketing") ||
      text.includes("hype")
    );
  }

  private isProductCuriosity(text: string): boolean {
    return (
      text.includes("is this live") ||
      text.includes("can i try") ||
      text.includes("where is") ||
      text.includes("how do i use") ||
      text.includes("what is genie") ||
      text.includes("what is tech genie")
    );
  }

  private isFeatureRequest(text: string): boolean {
    return (
      text.includes("you should") ||
      text.includes("would love") ||
      text.includes("please add") ||
      text.includes("feature request") ||
      text.includes("can you add")
    );
  }

  private isCompliment(text: string): boolean {
    return (
      text.includes("nice") ||
      text.includes("cool") ||
      text.includes("love this") ||
      text.includes("great") ||
      text.includes("looks good")
    );
  }

  private isNoise(text: string): boolean {
    return text.length < 4 || text.includes("lol") || text.includes("lmao") || text.includes("first");
  }
}
