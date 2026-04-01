import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BlueskyLearningSnapshot {
  topRoutes: Array<{ routed_to: string; count: number }>;
  topAuthors: Array<{ author_handle: string; count: number }>;
  postingMix: {
    proactivePosts: number;
    discoveryLikes: number;
    discoveryReplies: number;
    mentionReplies: number;
  };
  recommendedTopicFocus: string;
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('[BlueskyLearningLoop] Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export class BlueskyLearningLoop {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  private since(days = 14): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  async buildSnapshot(): Promise<BlueskyLearningSnapshot> {
    const since = this.since();

    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('routed_to,author_handle,mention_text,response_text,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`[BlueskyLearningLoop] Failed to load interactions: ${error.message}`);
    }

    const rows = data || [];
    const routeCounts = new Map<string, number>();
    const authorCounts = new Map<string, number>();

    let proactivePosts = 0;
    let discoveryLikes = 0;
    let discoveryReplies = 0;
    let mentionReplies = 0;

    for (const row of rows) {
      const route = row.routed_to || 'unknown';
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);

      if (row.author_handle) {
        authorCounts.set(row.author_handle, (authorCounts.get(row.author_handle) || 0) + 1);
      }

      if (route === 'proactive-post') proactivePosts++;
      if (route === 'discovery-like') discoveryLikes++;
      if (route === 'discovery-reply') discoveryReplies++;
      if (route === 'mention-reply') mentionReplies++;
    }

    const topRoutes = [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([routed_to, count]) => ({ routed_to, count }));

    const topAuthors = [...authorCounts.entries()]
      .filter(([author]) => author && author !== 'self')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([author_handle, count]) => ({ author_handle, count }));

    let recommendedTopicFocus = 'memory-native AI, developer tools, and building Tech Genie in public';
    if (discoveryReplies > mentionReplies) {
      recommendedTopicFocus = 'AI agents, developer workflows, and technical social conversations';
    } else if (mentionReplies > discoveryReplies) {
      recommendedTopicFocus = 'helpful product education, user questions, and memory-native AI explainers';
    }

    return {
      topRoutes,
      topAuthors,
      postingMix: {
        proactivePosts,
        discoveryLikes,
        discoveryReplies,
        mentionReplies,
      },
      recommendedTopicFocus,
    };
  }
}
