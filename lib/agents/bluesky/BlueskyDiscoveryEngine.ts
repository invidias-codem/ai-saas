import { BskyAgent } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { BlueskyDiscoveryCandidate, BlueskyDiscoveryDecision } from './types';

const DEFAULT_TOPICS = [
  'AI agents',
  'memory-native apps',
  'developer tools',
  'software infrastructure',
  'Next.js Supabase architecture',
];

const LANE_KEYWORDS = {
  ai: ['ai', 'llm', 'llms', 'model', 'models', 'agent', 'agents', 'inference', 'reasoning'],
  memory: ['memory', 'memory-native', 'context', 'retrieval', 'rag', 'graph', 'knowledge graph'],
  tech: ['developer tools', 'devtools', 'infra', 'infrastructure', 'next.js', 'supabase', 'tooling', 'architecture', 'software'],
} as const;

const LOW_SIGNAL_PATTERNS = [
  /follow me/i,
  /giveaway/i,
  /airdrop/i,
  /dm me/i,
  /crypto/i,
  /gm\b/i,
  /good morning/i,
  /who else/i,
  /drop a/i,
  /like if/i,
  /retweet/i,
  /repost/i,
  /build in public$/i,
  /^great point$/i,
  /^this$/i,
  /^nice$/i,
  /^so true$/i,
];

const GENERIC_HYPE_PATTERNS = [
  /the future is here/i,
  /game changer/i,
  /huge announcement/i,
  /massive update/i,
  /changing everything/i,
  /breaking the internet/i,
];

const MAX_DISCOVERY_RESULTS = 10;
const MIN_TEXT_LENGTH = 40;
const MIN_LIKE_SCORE = 8;

type TopicLane = keyof typeof LANE_KEYWORDS;

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[BlueskyDiscoveryEngine] Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function countKeywordHits(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

export function inferTopicLane(text: string): { lane: TopicLane | null; laneScore: number } {
  let bestLane: TopicLane | null = null;
  let bestScore = 0;

  for (const [lane, keywords] of Object.entries(LANE_KEYWORDS) as Array<[TopicLane, readonly string[]]>) {
    const score = countKeywordHits(text, keywords);
    if (score > bestScore) {
      bestLane = lane;
      bestScore = score;
    }
  }

  return { lane: bestLane, laneScore: bestScore };
}

export function evaluateQuality(text: string, metrics?: { likeCount?: number; replyCount?: number; repostCount?: number }) {
  let qualityScore = 0;
  const reasons: string[] = [];

  if (text.length >= MIN_TEXT_LENGTH) {
    qualityScore += 2;
    reasons.push('sufficient_length');
  } else {
    qualityScore -= 3;
    reasons.push('too_short');
  }

  if (text.includes('?')) {
    qualityScore += 1;
    reasons.push('question_like');
  }

  if ((metrics?.replyCount || 0) >= 2) {
    qualityScore += 1;
    reasons.push('has_discussion');
  }

  if ((metrics?.likeCount || 0) >= 5) {
    qualityScore += 1;
    reasons.push('has_interest');
  }

  if ((metrics?.repostCount || 0) > 0) {
    qualityScore += 1;
    reasons.push('has_reposts');
  }

  if (GENERIC_HYPE_PATTERNS.some((pattern) => pattern.test(text))) {
    qualityScore -= 3;
    reasons.push('generic_hype');
  }

  return { qualityScore, reasons };
}

export function findRejectReason(text: string, laneScore: number): string | null {
  if (text.length < MIN_TEXT_LENGTH) return 'too_short';
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(text))) return 'low_signal_pattern';
  if (GENERIC_HYPE_PATTERNS.some((pattern) => pattern.test(text))) return 'generic_hype';
  if (/politics|election|war|celebrity drama|sports betting|hate|angry|outrage|scam|furious|disgusting|boycott|racist|scandal/i.test(text)) return 'off_topic_or_sensitive';
  if (laneScore < 2) return 'weak_lane_match';
  return null;
}

export class BlueskyDiscoveryEngine {
  private agent: BskyAgent;
  private supabase: SupabaseClient;
  private authenticated = false;

  constructor() {
    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      throw new Error('[BlueskyDiscoveryEngine] Missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD');
    }
    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.supabase = getSupabaseClient();
  }

  private async ensureAuth() {
    if (this.authenticated) return;
    await this.agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });
    this.authenticated = true;
  }

  private async getAlreadyHandledUris(): Promise<Set<string>> {
    const { data, error } = await this.supabase.from('bluesky_interactions').select('mention_uri,response_uri');

    if (error) {
      console.error('[BlueskyDiscoveryEngine] Failed to load handled URIs:', error);
      return new Set();
    }

    const set = new Set<string>();
    for (const row of data || []) {
      if (row.mention_uri) set.add(row.mention_uri);
      if (row.response_uri) set.add(row.response_uri);
    }
    return set;
  }

  async discover(limitPerTopic = 5): Promise<BlueskyDiscoveryCandidate[]> {
    await this.ensureAuth();
    const handled = await this.getAlreadyHandledUris();
    const topics = (process.env.BLUESKY_DISCOVERY_TOPICS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const topicList = topics.length ? topics : DEFAULT_TOPICS;

    const deduped = new Map<string, BlueskyDiscoveryCandidate>();
    const selfHandle = (process.env.BLUESKY_HANDLE || '').replace(/^@/, '').toLowerCase();

    for (const topic of topicList) {
      try {
        const response = await this.agent.app.bsky.feed.searchPosts({ q: topic, limit: limitPerTopic });
        for (const item of response.data.posts || []) {
          const record = item.record as { text?: unknown };
          const text = typeof record?.text === 'string' ? record.text : '';
          if (!text || handled.has(item.uri)) continue;
          if (item.author?.handle?.toLowerCase() === selfHandle) continue;

          const normalized = normalize(text);
          const { lane, laneScore } = inferTopicLane(normalized);
          const rejectReason = findRejectReason(normalized, laneScore);
          const { qualityScore, reasons } = evaluateQuality(normalized, {
            likeCount: item.likeCount,
            replyCount: item.replyCount,
            repostCount: item.repostCount,
          });

          const score = laneScore * 3 + qualityScore;
          const reasonParts = [
            lane ? `lane:${lane}` : 'lane:none',
            `lane_score:${laneScore}`,
            `quality_score:${qualityScore}`,
            ...reasons,
            rejectReason ? `reject:${rejectReason}` : '',
          ].filter(Boolean);

          const candidate: BlueskyDiscoveryCandidate = {
            uri: item.uri,
            cid: item.cid,
            text,
            authorHandle: item.author.handle,
            authorDid: item.author.did,
            likeCount: item.likeCount,
            replyCount: item.replyCount,
            repostCount: item.repostCount,
            score,
            reason: reasonParts.join('|'),
          };

          if (rejectReason || !lane) continue;

          const existing = deduped.get(item.uri);
          if (!existing || existing.score < candidate.score) {
            deduped.set(item.uri, candidate);
          }
        }
      } catch (error) {
        console.warn(`[BlueskyDiscoveryEngine] search failed for topic "${topic}":`, error);
      }
    }

    return Array.from(deduped.values())
      .filter((candidate) => candidate.score >= MIN_LIKE_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DISCOVERY_RESULTS);
  }

  decide(candidate: BlueskyDiscoveryCandidate): BlueskyDiscoveryDecision {
    if (candidate.score >= 12) {
      return { uri: candidate.uri, action: 'reply', score: candidate.score, reason: candidate.reason };
    } else if (candidate.score >= MIN_LIKE_SCORE) {
      return { uri: candidate.uri, action: 'like', score: candidate.score, reason: candidate.reason };
    }
    return { uri: candidate.uri, action: 'skip', score: candidate.score, reason: candidate.reason };
  }

  async like(uri: string, cid: string) {
    await this.ensureAuth();
    return this.agent.like(uri, cid);
  }
}
