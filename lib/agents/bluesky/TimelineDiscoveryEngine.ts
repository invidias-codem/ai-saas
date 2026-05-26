/**
 * lib/agents/bluesky/TimelineDiscoveryEngine.ts
 *
 * Option A: Timeline-based community grounding.
 *
 * Fetches the agent's home timeline (1 efficient API call), extracts substantive
 * posts from followed accounts, and writes them to the vectorStore as *ephemeral*
 * memories tagged with `memory_type: 'ephemeral_timeline'`. These decay aggressively
 * after 48 hours so the agent always reads the room without bloating the database.
 *
 * Also implements an auto-follow mechanic: any follower whose relationshipScore in
 * `bluesky_actor_memory` crosses FOLLOW_SCORE_THRESHOLD gets automatically followed,
 * keeping the Timeline feed populated with relevant community voices.
 *
 * Guardrails applied per architectural ruling:
 * - Single getTimeline() call (no N+1 follower graph fetching)
 * - Ephemeral TTL metadata on all written memories
 * - Quality + on-brand filters before writing to prevent off-brand noise
 * - Community context scoped to the agent's core topic lanes
 */

import { BskyAgent } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { storeMemory } from '@/lib/memory/vectorStore';
import { addNode, strengthenEdge } from '@/lib/memory/graphStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const BLUESKY_MEMORY_USER_ID = process.env.BLUESKY_MEMORY_USER_ID || 'tech-genie-bluesky';
const TIMELINE_FETCH_LIMIT = 30;
const FOLLOW_SCORE_THRESHOLD = 5; // engagement_count in actor_memory before auto-follow

/** Topics the agent cares about. Posts that don't match are not ingested. */
const ON_BRAND_KEYWORDS = [
  'ai', 'llm', 'agent', 'inference', 'model', 'reasoning',
  'memory', 'context', 'retrieval', 'rag', 'knowledge graph',
  'developer', 'devtools', 'infra', 'saas', 'architecture',
  'next.js', 'supabase', 'tooling', 'software', 'startup',
  'open source', 'embedding', 'vector',
];

/** Patterns that indicate low-signal, off-brand content — skip these. */
const OFF_BRAND_PATTERNS = [
  /\b(sports|nba|nfl|fifa|celebrity|actor|actress|politician|election|war|crypto|nft|airdrop|giveaway|bitcoin)\b/i,
  /just ate|my cat|good morning|gm\b|breakfast|weekend vibes/i,
  /follow (me|for|back)|drop a|like if|retweet/i,
];

const MIN_TEXT_LENGTH = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelinePost {
  uri: string;
  cid: string;
  authorHandle: string;
  authorDid: string;
  text: string;
  likeCount?: number;
  replyCount?: number;
  indexedAt: string;
  topicsDetected: string[];
}

export interface TimelineDiscoveryResult {
  ingested: number;
  skipped: number;
  topicSummary: string;
  autoFollowed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatError(err: unknown) {
  return err instanceof Error ? { message: err.message, stack: err.stack } : err;
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[TimelineDiscovery] Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

function detectTopics(text: string): string[] {
  const lower = text.toLowerCase();
  return ON_BRAND_KEYWORDS.filter((kw) => lower.includes(kw));
}

function isOnBrand(text: string): boolean {
  if (text.length < MIN_TEXT_LENGTH) return false;
  if (OFF_BRAND_PATTERNS.some((p) => p.test(text))) return false;
  return detectTopics(text).length >= 1;
}

// ─── TimelineDiscoveryEngine ─────────────────────────────────────────────────

export class TimelineDiscoveryEngine {
  private agent: BskyAgent;
  private supabase: SupabaseClient;
  private authenticated = false;

  constructor() {
    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      throw new Error('[TimelineDiscovery] Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD');
    }
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.supabase = getSupabaseClient();
  }

  private async ensureAuth(): Promise<void> {
    if (this.authenticated) return;
    await this.agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });
    this.authenticated = true;
  }

  // ─── Timeline Fetch ───────────────────────────────────────────────────────

  /**
   * Fetches the home timeline and filters it down to on-brand, substantive posts.
   * This is a single API call — no N+1 follower graph fetching.
   */
  async fetchTimelinePosts(runId?: string): Promise<TimelinePost[]> {
    await this.ensureAuth();

    const response = await this.agent.getTimeline({ limit: TIMELINE_FETCH_LIMIT });
    const feed = response.data.feed ?? [];

    console.log(JSON.stringify({
      runId,
      event: 'timeline_discovery_fetched',
      total: feed.length,
    }));

    const selfHandle = (process.env.BLUESKY_HANDLE || '').replace(/^@/, '').toLowerCase();
    const posts: TimelinePost[] = [];

    for (const item of feed) {
      const post = item.post;
      const record = post?.record as Record<string, unknown> | undefined;
      const text = typeof record?.text === 'string' ? record.text : '';
      const authorHandle = (post?.author?.handle ?? '').toLowerCase();

      // Skip self, reposts with no text, and off-brand content
      if (!text || authorHandle === selfHandle) continue;
      if (!isOnBrand(text)) continue;

      posts.push({
        uri: post.uri,
        cid: post.cid,
        authorHandle: post.author.handle,
        authorDid: post.author.did,
        text,
        likeCount: post.likeCount,
        replyCount: post.replyCount,
        indexedAt: post.indexedAt,
        topicsDetected: detectTopics(text),
      });
    }

    console.log(JSON.stringify({
      runId,
      event: 'timeline_discovery_filtered',
      onBrandCount: posts.length,
      skipped: feed.length - posts.length,
    }));

    return posts;
  }

  // ─── Memory Ingestion ─────────────────────────────────────────────────────

  /**
   * Writes timeline posts to the vectorStore as ephemeral memories with a TTL tag.
   * The `ephemeral_timeline` memory_type and `expires_at` metadata signal to any
   * cleanup job that these should be pruned after 48 hours.
   */
  async ingestToMemory(posts: TimelinePost[], runId?: string): Promise<number> {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    let ingested = 0;

    for (const post of posts) {
      try {
        await storeMemory(
          BLUESKY_MEMORY_USER_ID,
          `Community post from @${post.authorHandle}: ${post.text}`,
          'conversation_summary',
          {
            source: 'bluesky_timeline',
            memory_type: 'ephemeral_timeline',
            expires_at: expiresAt,
            authorHandle: post.authorHandle,
            authorDid: post.authorDid,
            postUri: post.uri,
            topics: post.topicsDetected,
            likeCount: post.likeCount ?? 0,
          }
        );

        // Lightly update the graph: author → topic edges
        const authorNodeId = await addNode(
          BLUESKY_MEMORY_USER_ID,
          post.authorHandle,
          'person',
          `Bluesky community account @${post.authorHandle}`,
          { source: 'bluesky_timeline', did: post.authorDid },
          'timeline-discovery',
          'SUPPORTED'
        );

        for (const topic of post.topicsDetected.slice(0, 3)) {
          const topicNodeId = await addNode(
            BLUESKY_MEMORY_USER_ID,
            topic,
            'concept',
            `Topic from timeline: ${topic}`,
            { source: 'bluesky_timeline' },
            'timeline-discovery',
            'SUPPORTED'
          );

          if (authorNodeId && topicNodeId) {
            await strengthenEdge(
              BLUESKY_MEMORY_USER_ID,
              authorNodeId,
              topicNodeId,
              'interested_in',
              'timeline-discovery',
              'SUPPORTED'
            );
          }
        }

        ingested++;
      } catch (err) {
        console.warn(JSON.stringify({ runId, event: 'timeline_discovery_ingest_error', uri: post.uri, error: formatError(err) }));
      }
    }

    return ingested;
  }

  // ─── Community Context Summary ────────────────────────────────────────────

  /**
   * Returns a plain-text summary of the dominant topics in the current timeline,
   * scoped to on-brand content only. This is injected into the ProactivePostPlanner.
   */
  buildCommunityContextSummary(posts: TimelinePost[]): string {
    if (posts.length === 0) return '';

    const topicCounts = new Map<string, number>();
    for (const post of posts) {
      for (const topic of post.topicsDetected) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }

    const ranked = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic, count]) => `${topic} (${count} posts)`);

    if (ranked.length === 0) return '';

    return `Community is currently discussing: ${ranked.join(', ')}.`;
  }

  // ─── Auto-Follow Mechanic ─────────────────────────────────────────────────

  /**
   * Finds followers who have crossed the FOLLOW_SCORE_THRESHOLD in actor_memory
   * but whom the agent doesn't already follow. Follows them to keep the Timeline
   * populated with relevant voices.
   *
   * This is the cheap fix for the Timeline approach: instead of fetching N feeds,
   * we let organic engagement drive who populates the home timeline.
   */
  async autoFollowHighEngagement(runId?: string): Promise<number> {
    await this.ensureAuth();

    // 1. Fetch high-engagement actors the agent isn't already following
    const { data: candidates, error } = await this.supabase
      .from('bluesky_actor_memory')
      .select('actor_did, handle, engagement_count')
      .gte('engagement_count', FOLLOW_SCORE_THRESHOLD)
      .order('engagement_count', { ascending: false })
      .limit(20);

    if (error || !candidates?.length) {
      if (error) {
        console.warn(JSON.stringify({ runId, event: 'timeline_auto_follow_db_error', error: formatError(error) }));
      }
      return 0;
    }

    let followed = 0;

    for (const actor of candidates) {
      try {
        // Check if already following
        const { data: existing } = await this.agent.getProfile({ actor: actor.actor_did });
        if (existing?.viewer?.following) continue; // already following

        await this.agent.follow(actor.actor_did);
        followed++;

        console.log(JSON.stringify({
          runId,
          event: 'timeline_auto_followed',
          handle: actor.handle,
          engagementCount: actor.engagement_count,
        }));
      } catch (err) {
        // Non-fatal: profile may be deleted or API rate-limited
        console.warn(JSON.stringify({ runId, event: 'timeline_auto_follow_error', handle: actor.handle, error: formatError(err) }));
      }
    }

    return followed;
  }

  // ─── Main Entry Point ─────────────────────────────────────────────────────

  async run(runId?: string): Promise<TimelineDiscoveryResult> {
    const posts = await this.fetchTimelinePosts(runId);
    const topicSummary = this.buildCommunityContextSummary(posts);
    const ingested = await this.ingestToMemory(posts, runId);
    const autoFollowed = await this.autoFollowHighEngagement(runId);

    const result: TimelineDiscoveryResult = {
      ingested,
      skipped: posts.length - ingested,
      topicSummary,
      autoFollowed,
    };

    console.log(JSON.stringify({ runId, event: 'timeline_discovery_complete', ...result }));

    return result;
  }
}
