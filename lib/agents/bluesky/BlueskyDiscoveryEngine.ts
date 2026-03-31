import { BskyAgent } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { BlueskyDiscoveryCandidate, BlueskyDiscoveryDecision } from './types';

const DEFAULT_TOPICS = [
  'AI agents',
  'Next.js',
  'Supabase',
  'developer tools',
  'AI SaaS',
  'build in public',
];

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[BlueskyDiscoveryEngine] Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

function scoreCandidate(text: string, topic: string, metrics?: { likeCount?: number; replyCount?: number; repostCount?: number }) {
  const lower = text.toLowerCase();
  let score = 0;

  const topicalWords = topic.toLowerCase().split(/\s+/).filter(Boolean);
  for (const word of topicalWords) {
    if (lower.includes(word)) score += 2;
  }

  if (/ai|agent|llm|memory|next\.js|supabase|developer|tool|startup|saas/.test(lower)) score += 3;
  if (lower.includes('?')) score += 2;
  if ((metrics?.replyCount || 0) > 0) score += 1;
  if ((metrics?.likeCount || 0) > 3) score += 1;
  if ((metrics?.repostCount || 0) > 0) score += 1;
  if (lower.length < 40) score -= 1;
  if (/follow me|giveaway|airdrop|dm me|crypto/i.test(text)) score -= 10;

  return score;
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
    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('mention_uri,response_uri');

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
      .map(s => s.trim())
      .filter(Boolean);
    const topicList = topics.length ? topics : DEFAULT_TOPICS;

    const candidates: BlueskyDiscoveryCandidate[] = [];

    for (const topic of topicList) {
      try {
        const response = await this.agent.app.bsky.feed.searchPosts({ q: topic, limit: limitPerTopic });
        for (const item of response.data.posts || []) {
          const record = item.record as any;
          const text = typeof record?.text === 'string' ? record.text : '';
          if (!text || handled.has(item.uri)) continue;
          if (item.author?.handle === process.env.BLUESKY_HANDLE) continue;

          const score = scoreCandidate(text, topic, {
            likeCount: item.likeCount,
            replyCount: item.replyCount,
            repostCount: item.repostCount,
          });

          candidates.push({
            uri: item.uri,
            cid: item.cid,
            text,
            authorHandle: item.author.handle,
            authorDid: item.author.did,
            likeCount: item.likeCount,
            replyCount: item.replyCount,
            repostCount: item.repostCount,
            score,
            reason: `topic_match:${topic}`,
          });
        }
      } catch (error) {
        console.warn(`[BlueskyDiscoveryEngine] search failed for topic "${topic}":`, error);
      }
    }

    return candidates
      .filter(c => c.score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  decide(candidate: BlueskyDiscoveryCandidate): BlueskyDiscoveryDecision {
    if (candidate.score >= 8) {
      return { uri: candidate.uri, action: 'reply', score: candidate.score, reason: candidate.reason };
    }
    if (candidate.score >= 5) {
      return { uri: candidate.uri, action: 'like', score: candidate.score, reason: candidate.reason };
    }
    return { uri: candidate.uri, action: 'skip', score: candidate.score, reason: candidate.reason };
  }

  async like(uri: string, cid: string) {
    await this.ensureAuth();
    return this.agent.like(uri, cid);
  }
}
