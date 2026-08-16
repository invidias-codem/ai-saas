// lib/bluesky/client.ts
// AT Protocol client wrapper for Bluesky Engagement Agent.
// Handles auth, session caching, and feed fetching.

import { AtpAgent } from "@atproto/api";
import { supabaseAdmin } from "@/lib/supabaseClient";

export interface BlueskySession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  expiresAt: Date;
}

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  text: string;
  createdAt: string;
  indexedAt: string;
  replyCount: number;
  repostCount: number;
  likeCount: number;
}

export interface FeedFetchResult {
  posts: BlueskyPost[];
  cursor: string | null;
}

/**
 * Manages AT Protocol authentication with cached sessions.
 * Session tokens are stored in Supabase to persist across cron invocations.
 */
export class BlueskyClient {
  private agent: AtpAgent;
  private sessionDid: string | null = null;

  constructor() {
    this.agent = new AtpAgent({ service: "https://bsky.social" });
  }

  /**
   * Initialize the client with cached session or re-authenticate.
   */
  async initialize(): Promise<void> {
    // Try to load cached session
    const cachedSession = await this.loadCachedSession();

    if (cachedSession && new Date(cachedSession.expiresAt) > new Date()) {
      // Session still valid — resume
      try {
        this.agent.sessionManager.resumeSession({
          did: cachedSession.did,
          handle: cachedSession.handle,
          accessJwt: cachedSession.accessJwt,
          refreshJwt: cachedSession.refreshJwt,
          active: true,
        });
        this.sessionDid = cachedSession.did;
        return;
      } catch (err) {
        console.warn("[Bluesky] Session resume failed, re-authenticating:", err);
      }
    }

    // Re-authenticate with App Password
    await this.authenticate();
  }

  /**
   * Authenticate with App Password and cache the session.
   */
  private async authenticate(): Promise<void> {
    const identifier = process.env.BLUESKY_IDENTIFIER;
    const password = process.env.BLUESKY_APP_PASSWORD;

    if (!identifier || !password) {
      throw new Error("BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD not configured");
    }

    const response = await this.agent.login({ identifier, password });

    this.sessionDid = response.data.did;

    // Cache session in Supabase
    await this.saveSession({
      did: response.data.did,
      handle: response.data.handle,
      accessJwt: response.data.accessJwt,
      refreshJwt: response.data.refreshJwt,
      expiresAt: this.calculateExpiry(response.data.accessJwt),
    });
  }

  /**
   * Fetch posts from a target feed AT-URI.
   */
  async fetchFeed(
    feedUri: string,
    cursor?: string | null,
    limit: number = 25
  ): Promise<FeedFetchResult> {
    try {
      const response = await this.agent.api.app.bsky.feed.getFeed({
        feed: feedUri,
        limit,
        cursor: cursor ?? undefined,
      });

      const posts: BlueskyPost[] = response.data.feed.map((item) => ({
        uri: item.post.uri,
        cid: item.post.cid,
        author: {
          did: item.post.author.did,
          handle: item.post.author.handle,
          displayName: item.post.author.displayName ?? undefined,
        },
        text: (item.post.record as any)["text"] as string,
        createdAt: item.post.indexedAt,
        indexedAt: item.post.indexedAt,
        replyCount: item.post.replyCount ?? 0,
        repostCount: item.post.repostCount ?? 0,
        likeCount: item.post.likeCount ?? 0,
      }));

      return {
        posts,
        cursor: response.data.cursor ?? null,
      };
    } catch (err: any) {
      console.error(`[Bluesky] Failed to fetch feed ${feedUri}:`, err.message);
      return { posts: [], cursor: null };
    }
  }

  /**
   * Fetch posts from a specific author.
   */
  async fetchAuthorFeed(
    authorDid: string,
    cursor?: string | null,
    limit: number = 25
  ): Promise<FeedFetchResult> {
    try {
      const response = await this.agent.api.app.bsky.feed.getAuthorFeed({
        actor: authorDid,
        limit,
        cursor: cursor ?? undefined,
      });

      const posts: BlueskyPost[] = response.data.feed
        .filter((item) => item.post.author.did === authorDid) // Only author's posts
        .map((item) => ({
          uri: item.post.uri,
          cid: item.post.cid,
          author: {
            did: item.post.author.did,
            handle: item.post.author.handle,
            displayName: item.post.author.displayName ?? undefined,
          },
          text: (item.post.record as any)["text"] as string,
          createdAt: item.post.indexedAt,
          indexedAt: item.post.indexedAt,
          replyCount: item.post.replyCount ?? 0,
          repostCount: item.post.repostCount ?? 0,
          likeCount: item.post.likeCount ?? 0,
        }));

      return {
        posts,
        cursor: response.data.cursor ?? null,
      };
    } catch (err: any) {
      console.error(`[Bluesky] Failed to fetch author ${authorDid}:`, err.message);
      return { posts: [], cursor: null };
    }
  }

  /**
   * Post a reply to a specific post (after human approval).
   */
  async postReply(
    parentUri: string,
    parentCid: string,
    text: string
  ): Promise<{ uri: string; cid: string }> {
    const response = await this.agent.post({
      text,
      reply: {
        root: { uri: parentUri, cid: parentCid },
        parent: { uri: parentUri, cid: parentCid },
      },
      createdAt: new Date().toISOString(),
    });

    return { uri: response.uri, cid: response.cid };
  }

  // ─── Session Management ─────────────────────────────────────────────

  private async loadCachedSession(): Promise<BlueskySession | null> {
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from("bluesky_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      did: data.did,
      handle: data.handle,
      accessJwt: data.access_jwt,
      refreshJwt: data.refresh_jwt,
      expiresAt: new Date(data.expires_at),
    };
  }

  private async saveSession(session: BlueskySession): Promise<void> {
    if (!supabaseAdmin) return;

    const { error } = await supabaseAdmin
      .from("bluesky_sessions")
      .upsert({
        did: session.did,
        handle: session.handle,
        access_jwt: session.accessJwt,
        refresh_jwt: session.refreshJwt,
        expires_at: session.expiresAt.toISOString(),
      });

    if (error) {
      console.error("[Bluesky] Failed to cache session:", error);
    }
  }

  private calculateExpiry(jwt: string): Date {
    try {
      // JWTs expire after ~2 hours for Bluesky
      // Decode to get precise exp claim, or default to 1 hour from now
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
      if (payload.exp) {
        return new Date(payload.exp * 1000);
      }
    } catch {
      // Fallback: assume 1 hour expiry
    }
    return new Date(Date.now() + 60 * 60 * 1000);
  }
}

// Singleton instance
let clientInstance: BlueskyClient | null = null;

export async function getBlueskyClient(): Promise<BlueskyClient> {
  if (!clientInstance) {
    clientInstance = new BlueskyClient();
    await clientInstance.initialize();
  }
  return clientInstance;
}
