import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_MAX_LIKES = 20;
const DEFAULT_MAX_REPLIES = 8;
const DEFAULT_MAX_POSTS = 3;
const LIKE_ROUTES = ['discovery-like', 'mention-like'];

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[BlueskySafetyPolicy] Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

export class BlueskySafetyPolicy {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  private windowStart(): string {
    const hours = parseIntEnv('BLUESKY_BUDGET_WINDOW_HOURS', DEFAULT_WINDOW_HOURS);
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }

  private async countByRoute(route: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('bluesky_interactions')
      .select('id', { count: 'exact', head: true })
      .eq('routed_to', route)
      .gte('created_at', this.windowStart());

    if (error) {
      console.error(`[BlueskySafetyPolicy] Failed counting route ${route}:`, error);
      return 0;
    }
    return count || 0;
  }

  async canPost(): Promise<{ allowed: boolean; reason?: string }> {
    const used = await this.countByRoute('proactive-post');
    const max = parseIntEnv('BLUESKY_MAX_POSTS_PER_DAY', DEFAULT_MAX_POSTS);
    return used >= max ? { allowed: false, reason: 'post_budget_exceeded' } : { allowed: true };
  }

  async canLike(): Promise<{ allowed: boolean; reason?: string }> {
    const counts = await Promise.all(LIKE_ROUTES.map((route) => this.countByRoute(route)));
    const used = counts.reduce((sum, count) => sum + count, 0);
    const max = parseIntEnv('BLUESKY_MAX_LIKES_PER_DAY', DEFAULT_MAX_LIKES);
    return used >= max ? { allowed: false, reason: 'like_budget_exceeded' } : { allowed: true };
  }

  async canReply(): Promise<{ allowed: boolean; reason?: string }> {
    const discoveryReplies = await this.countByRoute('discovery-reply');
    const mentionReplies = await this.countByRoute('mention-reply');
    const max = parseIntEnv('BLUESKY_MAX_REPLIES_PER_DAY', DEFAULT_MAX_REPLIES);
    return discoveryReplies + mentionReplies >= max
      ? { allowed: false, reason: 'reply_budget_exceeded' }
      : { allowed: true };
  }

  shouldAvoidText(text: string): { blocked: boolean; reason?: string } {
    const lower = text.toLowerCase();

    const bannedPatterns = [
      /airdrop/i,
      /giveaway/i,
      /dm me/i,
      /free money/i,
      /follow for follow/i,
      /crypto signal/i,
      /nsfw/i,
      /onlyfans/i,
    ];

    if (bannedPatterns.some((r) => r.test(text))) {
      return { blocked: true, reason: 'spam_or_low_quality' };
    }

    const offTopicPatterns = [/politics/i, /election/i, /war/i, /religion/i, /celebrity drama/i];

    if (offTopicPatterns.some((r) => r.test(text)) && !/ai|developer|saas|software|tech/i.test(lower)) {
      return { blocked: true, reason: 'off_topic' };
    }

    const hostilePatterns = [/idiot/i, /kill yourself/i, /stupid bot/i, /scam/i];
    if (hostilePatterns.some((r) => r.test(text))) {
      return { blocked: true, reason: 'hostile_or_bait' };
    }

    return { blocked: false };
  }

  async logAction(params: {
    route: 'proactive-post' | 'discovery-like' | 'mention-like' | 'discovery-reply' | 'mention-reply';
    authorHandle?: string | null;
    authorDid?: string | null;
    mentionUri?: string | null;
    responseUri?: string | null;
    mentionText?: string | null;
    responseText?: string | null;
  }) {
    const { error } = await this.supabase.from('bluesky_interactions').insert({
      mention_uri: params.mentionUri ?? null,
      author_handle: params.authorHandle ?? 'self',
      author_did: params.authorDid ?? 'self',
      mention_text: params.mentionText ?? null,
      response_text: params.responseText ?? null,
      response_uri: params.responseUri ?? null,
      facts_extracted: 0,
      routed_to: params.route,
    });

    if (error) {
      console.error('[BlueskySafetyPolicy] Failed to log action:', error);
    }
  }
}
