import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { BlueskyPoster } from './BlueskyPoster';

const CTA_SUFFIX = ' — gen1e.xyz';
const POST_MAX_CHARS = 290;
const DEFAULT_TOPIC = 'memory-native AI, developer tools, and building Tech Genie in public';

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('[BlueskyProactivePoster] Missing Supabase env vars');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function clipToLimit(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= POST_MAX_CHARS) return clean;
  return clean.slice(0, POST_MAX_CHARS - 3).trimEnd() + '...';
}

function normalizePost(raw: string): string {
  let text = raw.replace(/#\w+/g, '').trim();
  if (!text.endsWith(CTA_SUFFIX)) {
    text = `${text}${CTA_SUFFIX}`;
  }
  return clipToLimit(text);
}

export class BlueskyProactivePoster {
  private supabase: SupabaseClient;
  private poster: BlueskyPoster;

  constructor() {
    this.supabase = getSupabaseClient();
    this.poster = new BlueskyPoster();
  }

  private async hasPostedRecently(windowHours = 18): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('id')
      .eq('author_handle', process.env.BLUESKY_HANDLE || '')
      .is('mention_uri', null)
      .gte('created_at', windowStart)
      .limit(1);

    if (error) {
      console.error('[BlueskyProactivePoster] Failed recent-post check:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  }

  private async buildPrompt(): Promise<string> {
    const { data } = await this.supabase
      .from('bluesky_interactions')
      .select('mention_text,response_text,routed_to,created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    const recentContext = (data || [])
      .map((row: any, i: number) => `${i + 1}. Mention: ${row.mention_text || 'n/a'} | Reply: ${row.response_text || 'n/a'}`)
      .join('\n');

    return `You are writing one original Bluesky post for Tech Genie.

Goals:
- sound like a sharp builder shipping in public
- focus on ${process.env.BLUESKY_TOPIC_FOCUS || DEFAULT_TOPIC}
- be useful, specific, and native to social media
- no hashtags
- no hype slang
- max ${POST_MAX_CHARS} characters including the closing CTA
- always end with "${CTA_SUFFIX}"

Good themes:
- memory-native AI assistants
- what you're learning from building AI products
- practical observations about developer tools, routing, context, or automation
- short founder-grade insights

Recent interaction context:
${recentContext || 'No recent interaction context available.'}

Return only the post text.`;
  }

  private async generatePostText(): Promise<string> {
    const apiKey = process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('[BlueskyProactivePoster] Missing BLUESKY_GEMINI_API_KEY or GOOGLE_API_KEY');
    }

    const prompt = await this.buildPrompt();
    const gemini = new GoogleGenerativeAI(apiKey);
    const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    return normalizePost(text);
  }

  private async logPost(text: string, responseUri: string) {
    const { error } = await this.supabase
      .from('bluesky_interactions')
      .insert({
        mention_uri: null,
        author_handle: process.env.BLUESKY_HANDLE || 'self',
        author_did: 'self',
        mention_text: null,
        response_text: text,
        response_uri: responseUri,
        facts_extracted: 0,
        routed_to: 'proactive-post',
      });

    if (error) {
      console.error('[BlueskyProactivePoster] Failed to log proactive post:', error);
    }
  }

  async run(): Promise<{ posted: boolean; reason?: string; uri?: string; text?: string }> {
    const recent = await this.hasPostedRecently();
    if (recent) {
      return { posted: false, reason: 'recent_post_exists' };
    }

    const text = await this.generatePostText();
    const result = await this.poster.post({ text });
    await this.logPost(text, result.uri);

    return {
      posted: true,
      uri: result.uri,
      text,
    };
  }
}
