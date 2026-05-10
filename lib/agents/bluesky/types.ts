export type BlueskyMention = {
  authorDid: string;
  authorHandle: string;
  text: string;
  uri: string;
  cid: string;
  createdAt?: string;
};

export type BlueskyEngagementAction = "reply" | "like" | "skip";

export type BlueskyCommentClass =
  | "technical_question"
  | "clarification_request"
  | "skepticism"
  | "product_curiosity"
  | "feature_request"
  | "compliment"
  | "noise";

export interface BlueskyReplyDecision {
  action: BlueskyEngagementAction;
  commentClass: BlueskyCommentClass;
  rationale: string;
  suggestedReplyStyle?: "direct" | "clarifying" | "skeptical" | "curious" | "warm";
}
