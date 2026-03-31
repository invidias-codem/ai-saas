/**
 * lib/agents/bluesky/types.ts
 *
 * TypeScript types for the Bluesky engagement agent.
 * Covers mention ingestion, agent configuration, and engagement results.
 */

// ─── Bluesky Mention ─────────────────────────────────────────────────────────

/**
 * A normalized Bluesky mention or reply directed at the Tech Genie account.
 */
export interface BlueskyMention {
  /** AT-URI of the mention post (e.g. at://did:plc:.../app.bsky.feed.post/...) */
  uri: string;
  /** Content-hash identifier of the post */
  cid: string;
  /** Author's Bluesky handle (e.g. "user.bsky.social") */
  authorHandle: string;
  /** Author's DID (e.g. "did:plc:...") */
  authorDid: string;
  /** Full text of the mention post */
  text: string;
  /** Reply reference — present when this post is a reply to another post */
  replyRef?: BlueskyReplyRef;
  /** ISO 8601 timestamp when the notification was indexed by the relay */
  indexedAt: string;
}

/**
 * Reply reference structure used when posting a reply.
 * Contains both the direct parent and the thread root.
 */
export interface BlueskyReplyRef {
  root: { uri: string; cid: string };
  parent: { uri: string; cid: string };
}

// ─── Engagement Config ────────────────────────────────────────────────────────

/**
 * Configuration for the Bluesky engagement agent.
 */
export interface BlueskyEngagementConfig {
  /** Bluesky account handle (e.g. "techgenie.bsky.social") */
  handle: string;
  /** App password generated from Bluesky account settings */
  appPassword: string;
  /** How often to poll for new mentions, in milliseconds */
  pollIntervalMs: number;
  /** Maximum number of replies the agent can post in a single run */
  maxRepliesPerRun: number;
}

// ─── Engagement Result ────────────────────────────────────────────────────────

/**
 * Result of processing a single BlueskyMention through the engagement pipeline.
 */
export interface EngagementResult {
  /** AT-URI of the mention that was processed */
  mentionUri: string;
  /** Whether the agent successfully posted a reply */
  responded: boolean;
  /** AT-URI of the reply post, if one was created */
  responseUri?: string;
  /** Number of facts extracted from the mention and pushed to the knowledge graph */
  factsExtracted: number;
  /** Error message if processing failed */
  error?: string;
}


export interface BlueskyDiscoveryCandidate {
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
}

export interface BlueskyDiscoveryDecision {
  uri: string;
  action: 'reply' | 'like' | 'skip';
  score: number;
  reason: string;
}
