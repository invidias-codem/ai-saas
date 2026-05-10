export type BlueskyMention = {
  authorDid: string;
  authorHandle: string;
  text: string;
  uri: string;
  cid: string;
  createdAt?: string;
  indexedAt?: string;
  replyRef?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
};

export type BlueskyEngagementAction =
  | "reply"
  | "reply_full"
  | "reply_short"
  | "like"
  | "like_only"
  | "skip";

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

export type BlueskyNotificationAction = "reply_now" | "like_only" | "skip" | "defer_for_topic" | "escalate";

export type BlueskyReplyIntent =
  | "answer"
  | "clarification"
  | "correction"
  | "challenge"
  | "praise"
  | "thanks"
  | "follow_up"
  | "lightweight_ack"
  | "decline"
  | "question"
  | "agreement"
  | "banter"
  | "high_value"
  | "low_value";

export type EngagementResult = {
  mentionUri: string;
  responded: boolean;
  liked: boolean;
  action: BlueskyEngagementAction;
  responseUri?: string;
  responseCid?: string;
  responseText?: string;
  factsExtracted: number;
  error?: string;
};

export type BlueskyDiscoveryCandidate = {
  uri: string;
  cid: string;
  text: string;
  authorHandle: string;
  authorDid: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  score: number;
  reason: string;
};

export type BlueskyDiscoveryDecision = {
  uri: string;
  action: "reply" | "like" | "skip";
  score: number;
  reason: string;
};
