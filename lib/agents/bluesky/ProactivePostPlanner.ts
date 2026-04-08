import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { searchMemories } from '@/lib/memory/vectorStore';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';

export type BlueskyTopicLane = 'ai' | 'memory' | 'tech';

export interface PlannedBlueskyPost {
  text: string;
  topics: string[];
  ctaMode: 'auto' | 'site' | 'donation' | 'none';
  lane: BlueskyTopicLane;
  grounding: string;
  sourceKind: 'memory' | 'news';
}

const BLUESKY_MEMORY_USER_ID = process.env.BLUESKY_MEMORY_USER_ID || 'tech-genie-bluesky';
const LANE_ROTATION: BlueskyTopicLane[] = ['ai', 'memory', 'tech'];

const LANE_BRIEFS: Record<BlueskyTopicLane, string> = {
  ai: 'Post about AI, agents, LLM behavior, or practical model usage. Be useful, opinionated, and specific.',
  memory: 'Post about memory-native apps, persistent context, knowledge graphs, retrieval, or software that remembers.',
  tech: 'Post about tech news, dev tools, SaaS infrastructure, or noteworthy product engineering trends.',
};

function chooseLane(date = new Date()): BlueskyTopicLane {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 6));
  return LANE_ROTATION[dayIndex % LANE_ROTATION.length];
}

function buildPrompt(lane: BlueskyTopicLane, grounding: string): string {
  return [
    'Write one original Bluesky post for Tech Genie.',
    LANE_BRIEFS[lane],
    'Use the grounding material below. Be specific when the grounding is specific. Do not invent current events or fake product facts.',
    'Constraints:',
    '- Max 220 characters before any optional CTA logic downstream',
    '- No hashtags',
    '- No em dashes',
    '- Sound sharp, helpful, and human',
    '- Do not mention gen1e.xyz unless the post is directly relevant to AI or memory-native product thinking',
    '- Do not ask for donations by default',
    '- Return plain text only',
    '',
    'Grounding:',
    grounding,
  ].join('\n');
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('[ProactivePostPlanner] Missing BLUESKY_GEMINI_API_KEY or GOOGLE_API_KEY');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 120, temperature: 0.9 },
  });

  return result.response.text().trim();
}

function inferTopicsFromLane(lane: BlueskyTopicLane): string[] {
  switch (lane) {
    case 'ai':
      return ['ai'];
    case 'memory':
      return ['memory', 'ai'];
    case 'tech':
      return ['tech'];
  }
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[ProactivePostPlanner] Missing Supabase admin env vars');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function isTooSimilarToRecentPosts(text: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('text, created_at')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      console.warn('[ProactivePostPlanner] Recent post lookup failed (non-blocking):', error);
      return false;
    }

    const candidate = normalizeForDedupe(text);
    const candidateWords = new Set(candidate.split(' ').filter(Boolean));

    return (data ?? []).some((row: { text: string }) => {
      const existing = normalizeForDedupe(row.text);
      if (!existing) return false;
      if (existing === candidate) return true;

      const existingWords = new Set(existing.split(' ').filter(Boolean));
      const overlap = [...candidateWords].filter((word) => existingWords.has(word)).length;
      const baseline = Math.max(1, Math.min(candidateWords.size, existingWords.size));
      return overlap / baseline >= 0.8;
    });
  } catch (err) {
    console.warn('[ProactivePostPlanner] Dedupe check failed (non-blocking):', err);
    return false;
  }
}

export async function logProactiveBlueskyPost(params: {
  lane: BlueskyTopicLane;
  text: string;
  topics: string[];
  ctaMode: 'auto' | 'site' | 'donation' | 'none';
  grounding: string;
  sourceKind: 'memory' | 'news';
  postUri?: string;
  postCid?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('bluesky_proactive_posts').insert({
      lane: params.lane,
      text: params.text,
      topics: params.topics,
      cta_mode: params.ctaMode,
      grounding: params.grounding,
      source_kind: params.sourceKind,
      post_uri: params.postUri ?? null,
      post_cid: params.postCid ?? null,
    });

    if (error) {
      console.error('[ProactivePostPlanner] Failed to log proactive post:', error);
    }
  } catch (err) {
    console.error('[ProactivePostPlanner] Error logging proactive post:', err);
  }
}

async function fetchTechNewsGrounding(): Promise<string> {
  try {
    const response = await fetch('https://news.ycombinator.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 TechGenieBlueskyBot/1.0' },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HN fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const matches = Array.from(html.matchAll(/<span class="titleline"><a [^>]*>(.*?)<\/a>/g))
      .slice(0, 5)
      .map((match) => `- ${match[1].replace(/<[^>]+>/g, '').trim()}`)
      .filter(Boolean);

    return matches.length > 0
      ? `Current tech headlines:\n${matches.join('\n')}`
      : 'No current headline grounding available.';
  } catch (err) {
    console.warn('[ProactivePostPlanner] Tech news grounding failed (non-blocking):', err);
    return 'No current headline grounding available.';
  }
}

async function fetchMemoryGrounding(lane: BlueskyTopicLane): Promise<string> {
  try {
    const query =
      lane === 'ai'
        ? 'AI agents LLM memory infrastructure product positioning'
        : 'memory-native apps persistent context retrieval knowledge graph product ideas';

    const memories = await searchMemories(BLUESKY_MEMORY_USER_ID, query, 4);
    const graph = await findRelatedEntities(
      BLUESKY_MEMORY_USER_ID,
      lane === 'ai' ? 'ai' : 'memory'
    );

    const memoryLines = memories
      .slice(0, 4)
      .map((memory) => `- ${memory.content}`)
      .join('\n');
    const graphContext = formatGraphContext(graph);

    return [
      'Relevant long-term memory:',
      memoryLines || 'No matching memories found.',
      graphContext || '',
    ]
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    console.warn('[ProactivePostPlanner] Memory grounding failed (non-blocking):', err);
    return 'No memory grounding available.';
  }
}

async function buildGrounding(lane: BlueskyTopicLane): Promise<{ grounding: string; sourceKind: 'memory' | 'news' }> {
  if (lane === 'tech') {
    return { grounding: await fetchTechNewsGrounding(), sourceKind: 'news' };
  }

  return { grounding: await fetchMemoryGrounding(lane), sourceKind: 'memory' };
}

export async function planProactiveBlueskyPost(): Promise<PlannedBlueskyPost> {
  const lane = chooseLane();
  const { grounding, sourceKind } = await buildGrounding(lane);
  const prompt = buildPrompt(lane, grounding);

  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await generateWithGemini(prompt);
    const tooSimilar = await isTooSimilarToRecentPosts(text);
    if (!tooSimilar) {
      return {
        text,
        topics: inferTopicsFromLane(lane),
        ctaMode: lane === 'tech' ? 'none' : 'auto',
        lane,
        grounding,
        sourceKind,
      };
    }
  }

  throw new Error('[ProactivePostPlanner] Generated posts were too similar to recent history');
}
