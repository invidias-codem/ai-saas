import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { searchMemories } from '@/lib/memory/vectorStore';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { EngagementLearningStore } from './EngagementLearningStore';

export type BlueskyTopicLane = 'ai' | 'memory' | 'tech';
export type BlueskyPostIntent = 'thought' | 'reaction' | 'distribution' | 'journal';
export type BlueskySourceKind = 'memory' | 'news' | 'hybrid';
export type BlueskyAudienceMode = 'builders' | 'followers' | 'broad' | 'supporters';
export type BlueskyRhetoricalPattern =
  | 'observation'
  | 'question'
  | 'contrast'
  | 'prediction'
  | 'lesson'
  | 'build_note'
  | 'signal';

export interface GroundingPacket {
  lane: BlueskyTopicLane;
  intent: BlueskyPostIntent;
  topics: string[];
  sourceKind: BlueskySourceKind;
  sourceConfidence: number;
  grounding: string;
  recentContext?: string;
  publicationUrl?: string;
  publicationTitle?: string;
  topicCluster?: string;
  audienceMode?: BlueskyAudienceMode;
  rhetoricalPattern?: BlueskyRhetoricalPattern;
  freshnessContext?: string;
  engagementHint?: string;
}

export interface PlannedBlueskyPost {
  text: string;
  topics: string[];
  ctaMode: 'auto' | 'site' | 'donation' | 'none';
  lane: BlueskyTopicLane;
  intent: BlueskyPostIntent;
  grounding: string;
  groundingPacket: GroundingPacket;
  sourceKind: BlueskySourceKind;
  sourceConfidence: number;
  qualityScore: number;
  topicCluster?: string;
  publicationUrl?: string;
  publicationTitle?: string;
  audienceMode?: BlueskyAudienceMode;
  rhetoricalPattern?: BlueskyRhetoricalPattern;
  freshnessScore?: number;
  usefulnessScore?: number;
  stalenessFlags?: string[];
  suppressed?: boolean;
  suppressionReason?:
    | 'too_similar'
    | 'too_vague'
    | 'weak_grounding'
    | 'promo_heavy'
    | 'oversaturated_topic'
    | 'stale_mix';
  decisionNotes?: string[];
}

type RecentPlannerState = {
  intent?: BlueskyPostIntent | null;
  lane?: BlueskyTopicLane | null;
  sourceKind?: BlueskySourceKind | null;
  topicCluster?: string | null;
};

const BLUESKY_MEMORY_USER_ID = process.env.BLUESKY_MEMORY_USER_ID || 'tech-genie-bluesky';
const LANE_ROTATION: BlueskyTopicLane[] = ['ai', 'memory', 'tech'];
const engagementLearningStore = new EngagementLearningStore();

const LANE_BRIEFS: Record<BlueskyTopicLane, string> = {
  ai: 'Post about AI, agents, LLM behavior, or practical model usage. Be useful, opinionated, and specific.',
  memory: 'Post about memory-native apps, persistent context, knowledge graphs, retrieval, or software that remembers.',
  tech: 'Post about tech news, dev tools, SaaS infrastructure, or noteworthy product engineering trends.',
};

const INTENT_BRIEFS: Record<BlueskyPostIntent, string> = {
  thought: 'Write an original thought, not a headline rewrite.',
  reaction: 'React to the source material in a grounded, specific way.',
  distribution: 'Frame a published piece or artifact briefly and clearly.',
  journal: 'Write like a compact journal note with one clear idea.',
};

function chooseLane(date = new Date()): BlueskyTopicLane {
  const dayIndex = Math.floor(date.getTime() / (1000 * 60 * 60 * 6));
  return LANE_ROTATION[dayIndex % LANE_ROTATION.length];
}

function pickLeastRecent<T extends string>(options: T[], recent: Array<T | null | undefined>, fallback: T): T {
  const counts = new Map<T, number>();
  for (const option of options) counts.set(option, 0);
  for (const value of recent) {
    if (value && counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const ranked = [...options].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
  return ranked[0] ?? fallback;
}

function chooseIntent(lane: BlueskyTopicLane, recent: RecentPlannerState[]): BlueskyPostIntent {
  const options: BlueskyPostIntent[] =
    lane === 'tech'
      ? ['reaction', 'thought', 'journal']
      : ['thought', 'journal', 'reaction'];

  return pickLeastRecent(
    options,
    recent.filter((row) => row.lane === lane).map((row) => row.intent),
    lane === 'tech' ? 'reaction' : 'thought'
  );
}

function chooseAudienceMode(lane: BlueskyTopicLane): BlueskyAudienceMode {
  switch (lane) {
    case 'tech':
      return 'builders';
    case 'memory':
      return 'followers';
    case 'ai':
    default:
      return 'broad';
  }
}

function chooseRhetoricalPattern(
  lane: BlueskyTopicLane,
  intent: BlueskyPostIntent
): BlueskyRhetoricalPattern {
  if (intent === 'reaction') return lane === 'tech' ? 'signal' : 'contrast';
  if (intent === 'journal') return lane === 'memory' ? 'lesson' : 'build_note';
  if (lane === 'ai') return 'prediction';
  if (lane === 'memory') return 'observation';
  return 'question';
}

function chooseSourceKind(lane: BlueskyTopicLane, recent: RecentPlannerState[]): BlueskySourceKind {
  const options: BlueskySourceKind[] =
    lane === 'tech' ? ['news', 'hybrid', 'memory'] : ['memory', 'hybrid', 'news'];

  return pickLeastRecent(
    options,
    recent.filter((row) => row.lane === lane).map((row) => row.sourceKind),
    options[0]
  );
}

function inferTopicCluster(lane: BlueskyTopicLane, topics: string[]): string {
  const normalized = topics
    .map((topic) => topic.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 3)
    .join('-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || lane;
}

async function maybePrioritizeDeferredTopicCluster(
  lane: BlueskyTopicLane,
  fallbackCluster: string
): Promise<string> {
  try {
    const deferredCounts = await engagementLearningStore.getDeferredPacketCounts();
    const ranked = Object.entries(deferredCounts).sort((a, b) => b[1] - a[1]);
    const best = ranked[0]?.[0]?.trim();
    if (!best) return fallbackCluster;

    const normalizedBest = best.toLowerCase();
    if (normalizedBest.includes(lane) || normalizedBest.includes(fallbackCluster.toLowerCase())) {
      return best;
    }

    return fallbackCluster;
  } catch (err) {
    console.warn('[ProactivePostPlanner] Deferred-topic prioritization failed (non-blocking):', err);
    return fallbackCluster;
  }
}

function buildPrompt(packet: GroundingPacket): string {
  return [
    'Write one original Bluesky post for Tech Genie.',
    LANE_BRIEFS[packet.lane],
    INTENT_BRIEFS[packet.intent],
    'Use the grounding material below. Be specific when the grounding is specific. Do not invent current events or fake product facts.',
    `Audience mode: ${packet.audienceMode ?? 'broad'}`,
    `Rhetorical pattern: ${packet.rhetoricalPattern ?? 'observation'}`,
    'Constraints:',
    '- Max 220 characters before any optional CTA logic downstream',
    '- No hashtags',
    '- No em dashes',
    '- Sound sharp, helpful, and human',
    '- Do not mention gen1e.xyz unless truly relevant',
    '- Do not ask for donations by default',
    '- Prefer one concrete takeaway over vague summary',
    '- Vary the framing from recent posts when possible',
    '- Avoid repeating the same claim shape or opener as recent posts',
    '- If the grounding is familiar, find a fresher angle instead of restating the same thesis',
    '- Return plain text only',
    '',
    'Grounding packet:',
    packet.grounding,
    packet.recentContext ? `\nRecent post context:\n${packet.recentContext}` : '',
    packet.freshnessContext ? `\nFreshness guidance:\n${packet.freshnessContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
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
    generationConfig: { maxOutputTokens: 120, temperature: 0.85 },
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

function sanitizeHeadlineText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchRecentPlannerState(): Promise<RecentPlannerState[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('intent, lane, source_kind, topic_cluster, created_at')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.warn('[ProactivePostPlanner] Failed to fetch recent planner state:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return [];
    }

    if (!data?.length) return [];

    return (data ?? []).map((row) => ({
      intent: (row.intent as BlueskyPostIntent | null | undefined) ?? null,
      lane: (row.lane as BlueskyTopicLane | null | undefined) ?? null,
      sourceKind: (row.source_kind as BlueskySourceKind | null | undefined) ?? null,
      topicCluster: (row.topic_cluster as string | null | undefined) ?? null,
    }));
  } catch (err) {
    console.warn('[ProactivePostPlanner] Unexpected error fetching recent planner state:', err);
    return [];
  }
}

async function fetchRecentPostContext(): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('text, lane, intent, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[ProactivePostPlanner] Failed to fetch recent post context:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return '';
    }

    if (!data?.length) return '';

    return data
      .map(
        (row: { text: string; lane?: string; intent?: string }) =>
          `- [${row.intent ?? 'unknown'}/${row.lane ?? 'unknown'}] ${row.text}`
      )
      .join('\n');
  } catch (err) {
    console.warn('[ProactivePostPlanner] Unexpected error fetching recent post context:', err);
    return '';
  }
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

async function hasRecentPostCooldown(hours = 12): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('id, created_at, suppressed, intent')
      .eq('suppressed', false)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[ProactivePostPlanner] Cooldown lookup failed (non-blocking):', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn('[ProactivePostPlanner] Cooldown check failed (non-blocking):', err);
    return false;
  }
}

async function hasRecentPublicationMatch(url: string, hours = 72): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('id, publication_url, created_at, suppressed')
      .eq('suppressed', false)
      .eq('publication_url', url)
      .gte('created_at', since)
      .limit(1);

    if (error) {
      console.warn('[ProactivePostPlanner] Publication dedupe lookup failed (non-blocking):', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn('[ProactivePostPlanner] Publication dedupe check failed (non-blocking):', err);
    return false;
  }
}

async function getTopicState(topic: string, lane: BlueskyTopicLane): Promise<{
  postCount7d: number;
  postCount30d: number;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_topic_state')
      .select('post_count_7d, post_count_30d')
      .eq('topic', topic)
      .eq('lane', lane)
      .maybeSingle();

    if (error) {
      console.warn('[ProactivePostPlanner] Failed to fetch bluesky_topic_state:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        topic,
        lane,
      });
      return { postCount7d: 0, postCount30d: 0 };
    }

    if (!data) return { postCount7d: 0, postCount30d: 0 };

    return {
      postCount7d: data.post_count_7d ?? 0,
      postCount30d: data.post_count_30d ?? 0,
    };
  } catch (err) {
    console.warn('[ProactivePostPlanner] Unexpected error fetching bluesky_topic_state:', err);
    return { postCount7d: 0, postCount30d: 0 };
  }
}

async function isOversaturatedTopic(topic: string, lane: BlueskyTopicLane): Promise<boolean> {
  const state = await getTopicState(topic, lane);
  return state.postCount7d >= 2;
}

function scoreFreshness(
  packet: GroundingPacket,
  recent: RecentPlannerState[]
): { freshnessScore: number; stalenessFlags: string[] } {
  const flags: string[] = [];
  let freshnessScore = 0.7;

  const recentLaneRows = recent.filter((row) => row.lane === packet.lane);
  const matchingIntentMix = recentLaneRows.filter(
    (row) => row.intent === packet.intent && row.sourceKind === packet.sourceKind
  ).length;
  const matchingTopicCluster = recentLaneRows.filter(
    (row) => row.topicCluster && row.topicCluster === packet.topicCluster
  ).length;

  if (matchingIntentMix >= 2) {
    freshnessScore -= 0.2;
    flags.push('repeated_intent_source_mix');
  }

  if (matchingTopicCluster >= 1) {
    freshnessScore -= 0.2;
    flags.push('recent_topic_cluster');
  }

  if (packet.intent === 'thought' && packet.sourceKind === 'memory' && matchingIntentMix >= 1) {
    freshnessScore -= 0.1;
    flags.push('memory_thought_repetition');
  }

  return {
    freshnessScore: Math.max(0, Math.min(1, freshnessScore)),
    stalenessFlags: flags,
  };
}

function scoreCandidate(text: string, packet: GroundingPacket): {
  qualityScore: number;
  usefulnessScore: number;
  suppressionReason?: PlannedBlueskyPost['suppressionReason'];
} {
  const lower = text.toLowerCase();
  let score = 0.5;
  let usefulnessScore = 0.45;

  if (packet.sourceConfidence >= 0.7) score += 0.15;
  if (text.length >= 80 && text.length <= 220) score += 0.1;
  if (/[.:;]/.test(text)) score += 0.05;
  if (!lower.includes('check it out') && !lower.includes('new post') && !lower.includes('link in bio')) score += 0.05;
  if (packet.intent === 'thought' && !lower.includes('today') && !lower.includes('breaking')) score += 0.05;
  if (packet.intent === 'distribution' && packet.publicationUrl && lower.includes('http')) score += 0.05;
  if (packet.rhetoricalPattern === 'question' && text.includes('?')) usefulnessScore += 0.08;
  if (packet.rhetoricalPattern === 'contrast' && /\bbut\b|\binstead\b|\brather than\b/.test(lower)) usefulnessScore += 0.08;
  if (/[0-9]/.test(text) || lower.includes('one ') || lower.includes('most ')) usefulnessScore += 0.05;
  if (text.length >= 90 && text.length <= 220) usefulnessScore += 0.07;

  if (text.length < 40) {
    return {
      qualityScore: Math.max(0, score - 0.25),
      usefulnessScore: Math.max(0, usefulnessScore - 0.2),
      suppressionReason: 'too_vague',
    };
  }
  if (packet.sourceConfidence < 0.45) {
    return {
      qualityScore: Math.max(0, score - 0.3),
      usefulnessScore: Math.max(0, usefulnessScore - 0.15),
      suppressionReason: 'weak_grounding',
    };
  }
  if (
    packet.intent !== 'distribution' &&
    (lower.includes('check it out') || lower.includes('new post up') || lower.includes('read more here'))
  ) {
    return {
      qualityScore: Math.max(0, score - 0.25),
      usefulnessScore: Math.max(0, usefulnessScore - 0.2),
      suppressionReason: 'promo_heavy',
    };
  }

  return {
    qualityScore: Math.min(1, score),
    usefulnessScore: Math.min(1, usefulnessScore),
  };
}

function buildFreshnessGuidance(params: {
  lane: BlueskyTopicLane;
  intent: BlueskyPostIntent;
  sourceKind: BlueskySourceKind;
  stalenessFlags: string[];
}): string {
  const notes = [
    `Current plan: lane=${params.lane}, intent=${params.intent}, source=${params.sourceKind}.`,
  ];

  if (params.stalenessFlags.includes('repeated_intent_source_mix')) {
    notes.push('Avoid sounding like a repeat of recent posts with the same intent/source mix.');
  }
  if (params.stalenessFlags.includes('recent_topic_cluster')) {
    notes.push('Use a fresher angle than the recent posts on this cluster.');
  }
  if (params.stalenessFlags.includes('memory_thought_repetition')) {
    notes.push('Do not restate the usual memory-native thesis in the usual way.');
  }

  return notes.join(' ');
}

export async function logProactiveBlueskyPost(params: {
  lane: BlueskyTopicLane;
  intent?: BlueskyPostIntent;
  text: string;
  topics: string[];
  ctaMode: 'auto' | 'site' | 'donation' | 'none';
  grounding: string;
  sourceKind: BlueskySourceKind;
  sourceConfidence?: number;
  qualityScore?: number;
  freshnessScore?: number;
  usefulnessScore?: number;
  audienceMode?: BlueskyAudienceMode;
  rhetoricalPattern?: BlueskyRhetoricalPattern;
  stalenessFlags?: string[];
  decisionNotes?: string[];
  suppressed?: boolean;
  suppressionReason?: string;
  publicationUrl?: string;
  publicationTitle?: string;
  topicCluster?: string;
  postUri?: string;
  postCid?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('bluesky_proactive_posts').insert({
      lane: params.lane,
      intent: params.intent ?? null,
      text: params.text,
      topics: params.topics,
      cta_mode: params.ctaMode,
      grounding: params.grounding,
      source_kind: params.sourceKind,
      source_confidence: params.sourceConfidence ?? null,
      quality_score: params.qualityScore ?? null,
      freshness_score: params.freshnessScore ?? null,
      usefulness_score: params.usefulnessScore ?? null,
      audience_mode: params.audienceMode ?? null,
      rhetorical_pattern: params.rhetoricalPattern ?? null,
      staleness_flags: params.stalenessFlags ?? null,
      decision_notes: params.decisionNotes ?? null,
      suppressed: params.suppressed ?? false,
      suppression_reason: params.suppressionReason ?? null,
      publication_url: params.publicationUrl ?? null,
      publication_title: params.publicationTitle ?? null,
      topic_cluster: params.topicCluster ?? null,
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

export async function updateBlueskyTopicState(params: {
  topic: string;
  lane: BlueskyTopicLane;
  posted: boolean;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const current = await getTopicState(params.topic, params.lane);

    const next7d = params.posted ? current.postCount7d + 1 : current.postCount7d;
    const next30d = params.posted ? current.postCount30d + 1 : current.postCount30d;

    const { error } = await supabase.from('bluesky_topic_state').upsert(
      {
        topic: params.topic,
        lane: params.lane,
        last_posted_at: params.posted ? now : null,
        post_count_7d: next7d,
        post_count_30d: next30d,
        updated_at: now,
      },
      { onConflict: 'topic,lane' }
    );

    if (error) {
      console.error('[ProactivePostPlanner] Failed to update bluesky_topic_state:', error);
    }
  } catch (err) {
    console.error('[ProactivePostPlanner] Error updating bluesky_topic_state:', err);
  }
}

async function fetchTechNewsGrounding(): Promise<{ grounding: string; sourceConfidence: number }> {
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
      .map((match) => `- ${sanitizeHeadlineText(match[1])}`)
      .filter(Boolean);

    return {
      grounding:
        matches.length > 0
          ? `Current tech headlines:\n${matches.join('\n')}`
          : 'No current headline grounding available.',
      sourceConfidence: matches.length > 0 ? 0.7 : 0.35,
    };
  } catch (err) {
    console.warn('[ProactivePostPlanner] Tech news grounding failed (non-blocking):', err);
    return { grounding: 'No current headline grounding available.', sourceConfidence: 0.3 };
  }
}

async function fetchMemoryGrounding(
  lane: BlueskyTopicLane
): Promise<{ grounding: string; sourceConfidence: number }> {
  try {
    const query =
      lane === 'ai'
        ? 'AI agents LLM memory infrastructure product positioning'
        : 'memory-native apps persistent context retrieval knowledge graph product ideas';

    const memories = await searchMemories(BLUESKY_MEMORY_USER_ID, query, 4);
    const graph = await findRelatedEntities(BLUESKY_MEMORY_USER_ID, lane === 'ai' ? 'ai' : 'memory');

    const memoryLines = memories.slice(0, 4).map((memory) => `- ${memory.content}`).join('\n');
    const graphContext = formatGraphContext(graph);

    return {
      grounding: ['Relevant long-term memory:', memoryLines || 'No matching memories found.', graphContext || '']
        .filter(Boolean)
        .join('\n\n'),
      sourceConfidence: memoryLines ? 0.8 : 0.45,
    };
  } catch (err) {
    console.warn('[ProactivePostPlanner] Memory grounding failed (non-blocking):', err);
    return { grounding: 'No memory grounding available.', sourceConfidence: 0.35 };
  }
}

async function buildGroundingPacket(
  lane: BlueskyTopicLane,
  intent: BlueskyPostIntent,
  sourceKind: BlueskySourceKind,
  audienceMode: BlueskyAudienceMode,
  rhetoricalPattern: BlueskyRhetoricalPattern,
  recent: RecentPlannerState[]
): Promise<GroundingPacket> {
  const recentContext = await fetchRecentPostContext();
  const topicCluster = inferTopicCluster(lane, inferTopicsFromLane(lane));
  const freshness = scoreFreshness(
    {
      lane,
      intent,
      topics: inferTopicsFromLane(lane),
      sourceKind,
      sourceConfidence: 0,
      grounding: '',
      topicCluster,
      audienceMode,
      rhetoricalPattern,
    },
    recent
  );
  const freshnessContext = buildFreshnessGuidance({
    lane,
    intent,
    sourceKind,
    stalenessFlags: freshness.stalenessFlags,
  });

  if (sourceKind === 'news') {
    const result = await fetchTechNewsGrounding();
    return {
      lane,
      intent,
      topics: inferTopicsFromLane(lane),
      sourceKind,
      sourceConfidence: result.sourceConfidence,
      grounding: result.grounding,
      recentContext,
      topicCluster,
      audienceMode,
      rhetoricalPattern,
      freshnessContext,
    };
  }

  const memoryResult = await fetchMemoryGrounding(lane);

  if (sourceKind === 'hybrid' && lane !== 'tech') {
    const newsResult = await fetchTechNewsGrounding();
    return {
      lane,
      intent,
      topics: inferTopicsFromLane(lane),
      sourceKind,
      sourceConfidence: Math.max(memoryResult.sourceConfidence, newsResult.sourceConfidence),
      grounding: [memoryResult.grounding, newsResult.grounding].filter(Boolean).join('\n\n'),
      recentContext,
      topicCluster,
      audienceMode,
      rhetoricalPattern,
      freshnessContext,
    };
  }

  return {
    lane,
    intent,
    topics: inferTopicsFromLane(lane),
    sourceKind,
    sourceConfidence: memoryResult.sourceConfidence,
    grounding: memoryResult.grounding,
    recentContext,
    topicCluster,
    audienceMode,
    rhetoricalPattern,
    freshnessContext,
  };
}

export async function planDistributionBlueskyPost(params: {
  title: string;
  summary: string;
  url: string;
  lane?: BlueskyTopicLane;
  topics?: string[];
}): Promise<PlannedBlueskyPost> {
  const lane = params.lane ?? 'ai';
  const recent = await fetchRecentPlannerState();
  const intent: BlueskyPostIntent = 'distribution';
  const topics = params.topics?.length ? params.topics : inferTopicsFromLane(lane);
  const topicCluster = await maybePrioritizeDeferredTopicCluster(
    lane,
    inferTopicCluster(lane, topics)
  );
  const recentContext = await fetchRecentPostContext();
  const audienceMode = chooseAudienceMode(lane);
  const rhetoricalPattern = chooseRhetoricalPattern(lane, intent);
  const decisionNotes: string[] = [];

  const packet: GroundingPacket = {
    lane,
    intent,
    topics,
    sourceKind: 'hybrid',
    sourceConfidence: 0.9,
    grounding: [
      `Publication title: ${params.title}`,
      `Summary: ${params.summary}`,
      `Canonical URL: ${params.url}`,
      'Goal: write one concise Bluesky distribution post with one real takeaway, not promo sludge.',
    ].join('\n'),
    recentContext,
    publicationUrl: params.url,
    publicationTitle: params.title,
    topicCluster,
    audienceMode,
    rhetoricalPattern,
  };

  const freshness = scoreFreshness(packet, recent);
  packet.freshnessContext = buildFreshnessGuidance({
    lane,
    intent,
    sourceKind: packet.sourceKind,
    stalenessFlags: freshness.stalenessFlags,
  });

  const prompt = buildPrompt(packet);
  const text = await generateWithGemini(prompt);
  const tooSimilar = await isTooSimilarToRecentPosts(text);
  const oversaturated = await isOversaturatedTopic(topicCluster, lane);
  const publicationAlreadyShared = await hasRecentPublicationMatch(params.url, 168);
  const recentCooldown = await hasRecentPostCooldown(12);
  const { qualityScore, usefulnessScore, suppressionReason } = scoreCandidate(text, packet);

  if (tooSimilar) decisionNotes.push('suppressed: too similar to recent posts');
  if (oversaturated) decisionNotes.push('suppressed: oversaturated topic cluster');
  if (publicationAlreadyShared) decisionNotes.push('suppressed: publication already shared recently');
  if (recentCooldown) decisionNotes.push('suppressed: recent proactive cooldown still active');
  if (freshness.stalenessFlags.length) decisionNotes.push(`freshness flags: ${freshness.stalenessFlags.join(', ')}`);
  if (suppressionReason && !tooSimilar && !oversaturated && !publicationAlreadyShared && !recentCooldown) {
    decisionNotes.push(`suppressed: ${suppressionReason}`);
  }

  if (publicationAlreadyShared) {
    return {
      text,
      topics,
      ctaMode: 'site',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore: 0.15,
      freshnessScore: freshness.freshnessScore,
      usefulnessScore: 0.1,
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      publicationUrl: params.url,
      publicationTitle: params.title,
      suppressed: true,
      suppressionReason: 'too_similar',
      decisionNotes,
    };
  }

  if (recentCooldown) {
    return {
      text,
      topics,
      ctaMode: 'site',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore: Math.min(0.35, qualityScore),
      freshnessScore: freshness.freshnessScore,
      usefulnessScore: Math.min(0.2, usefulnessScore),
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      publicationUrl: params.url,
      publicationTitle: params.title,
      suppressed: true,
      suppressionReason: 'oversaturated_topic',
      decisionNotes,
    };
  }

  if (tooSimilar) {
    return {
      text,
      topics,
      ctaMode: 'site',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore: 0.2,
      freshnessScore: freshness.freshnessScore,
      usefulnessScore: 0.15,
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      publicationUrl: params.url,
      publicationTitle: params.title,
      suppressed: true,
      suppressionReason: 'too_similar',
      decisionNotes,
    };
  }

  if (oversaturated) {
    return {
      text,
      topics,
      ctaMode: 'site',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore: Math.min(0.45, qualityScore),
      freshnessScore: freshness.freshnessScore,
      usefulnessScore: usefulnessScore,
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      publicationUrl: params.url,
      publicationTitle: params.title,
      suppressed: true,
      suppressionReason: 'oversaturated_topic',
      decisionNotes,
    };
  }

  if (suppressionReason && qualityScore < 0.55) {
    return {
      text,
      topics,
      ctaMode: 'site',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore,
      freshnessScore: freshness.freshnessScore,
      usefulnessScore,
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      publicationUrl: params.url,
      publicationTitle: params.title,
      suppressed: true,
      suppressionReason,
      decisionNotes,
    };
  }

  decisionNotes.push('approved: distribution candidate passed quality and saturation checks');

  return {
    text,
    topics,
    ctaMode: 'site',
    lane,
    intent,
    grounding: packet.grounding,
    groundingPacket: packet,
    sourceKind: packet.sourceKind,
    sourceConfidence: packet.sourceConfidence,
    qualityScore,
    freshnessScore: freshness.freshnessScore,
    usefulnessScore,
    stalenessFlags: freshness.stalenessFlags,
    audienceMode,
    rhetoricalPattern,
    topicCluster,
    publicationUrl: params.url,
    publicationTitle: params.title,
    decisionNotes,
  };
}

export async function planProactiveBlueskyPost(
  laneOverride?: BlueskyTopicLane
): Promise<PlannedBlueskyPost> {
  const lane = laneOverride ?? chooseLane();
  const recent = await fetchRecentPlannerState();
  const intent = chooseIntent(lane, recent);
  const sourceKind = chooseSourceKind(lane, recent);
  const audienceMode = chooseAudienceMode(lane);
  const rhetoricalPattern = chooseRhetoricalPattern(lane, intent);
  const packet = await buildGroundingPacket(lane, intent, sourceKind, audienceMode, rhetoricalPattern, recent);
  const topicCluster = await maybePrioritizeDeferredTopicCluster(
    lane,
    inferTopicCluster(lane, packet.topics)
  );
  packet.topicCluster = topicCluster;
  const oversaturated = await isOversaturatedTopic(topicCluster, lane);
  const recentCooldown = await hasRecentPostCooldown(12);
  const freshness = scoreFreshness(packet, recent);
  packet.freshnessContext = buildFreshnessGuidance({
    lane,
    intent,
    sourceKind,
    stalenessFlags: freshness.stalenessFlags,
  });
  const prompt = buildPrompt(packet);
  const decisionNotes: string[] = [];

  decisionNotes.push(`selected intent=${intent}`);
  decisionNotes.push(`selected sourceKind=${sourceKind}`);
  decisionNotes.push(`selected audienceMode=${audienceMode}`);
  decisionNotes.push(`selected rhetoricalPattern=${rhetoricalPattern}`);

  if (oversaturated) decisionNotes.push('topic currently saturated in last 7 days');
  if (recentCooldown) decisionNotes.push('recent proactive cooldown still active');
  if (freshness.stalenessFlags.length) {
    decisionNotes.push(`freshness flags: ${freshness.stalenessFlags.join(', ')}`);
  }

  if (recentCooldown) {
    return {
      text: 'Suppressed proactive post candidate',
      topics: packet.topics,
      ctaMode: 'none',
      lane,
      intent,
      grounding: packet.grounding,
      groundingPacket: packet,
      sourceKind: packet.sourceKind,
      sourceConfidence: packet.sourceConfidence,
      qualityScore: 0.15,
      freshnessScore: freshness.freshnessScore,
      usefulnessScore: 0.1,
      stalenessFlags: freshness.stalenessFlags,
      audienceMode,
      rhetoricalPattern,
      topicCluster,
      suppressed: true,
      suppressionReason: 'oversaturated_topic',
      decisionNotes,
    };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await generateWithGemini(prompt);
    const tooSimilar = await isTooSimilarToRecentPosts(text);
    if (tooSimilar) {
      decisionNotes.push(`attempt ${attempt + 1}: too similar to recent posts`);
      continue;
    }

    const { qualityScore, usefulnessScore, suppressionReason } = scoreCandidate(text, packet);
    const staleMix = freshness.freshnessScore < 0.45;
    const suppressed = Boolean((suppressionReason && qualityScore < 0.55) || oversaturated || staleMix);
    const finalSuppressionReason = oversaturated
      ? 'oversaturated_topic'
      : staleMix
        ? 'stale_mix'
        : suppressionReason;

    if (!suppressed) {
      decisionNotes.push(`approved on attempt ${attempt + 1}`);
      return {
        text,
        topics: packet.topics,
        ctaMode: lane === 'tech' ? 'none' : 'auto',
        lane,
        intent,
        grounding: packet.grounding,
        groundingPacket: packet,
        sourceKind: packet.sourceKind,
        sourceConfidence: packet.sourceConfidence,
        qualityScore,
        freshnessScore: freshness.freshnessScore,
        usefulnessScore,
        stalenessFlags: freshness.stalenessFlags,
        audienceMode,
        rhetoricalPattern,
        topicCluster,
        decisionNotes,
      };
    }

    if (attempt === 2) {
      decisionNotes.push(`final suppression on attempt ${attempt + 1}: ${finalSuppressionReason}`);
      return {
        text,
        topics: packet.topics,
        ctaMode: 'none',
        lane,
        intent,
        grounding: packet.grounding,
        groundingPacket: packet,
        sourceKind: packet.sourceKind,
        sourceConfidence: packet.sourceConfidence,
        qualityScore,
        freshnessScore: freshness.freshnessScore,
        usefulnessScore,
        stalenessFlags: freshness.stalenessFlags,
        audienceMode,
        rhetoricalPattern,
        topicCluster,
        suppressed: true,
        suppressionReason: finalSuppressionReason,
        decisionNotes,
      };
    }
  }

  decisionNotes.push('suppressed after repeated similarity with recent posts');
  return {
    text: 'Suppressed proactive post candidate',
    topics: inferTopicsFromLane(lane),
    ctaMode: 'none',
    lane,
    intent,
    grounding: packet.grounding,
    groundingPacket: packet,
    sourceKind: packet.sourceKind,
    sourceConfidence: packet.sourceConfidence,
    qualityScore: 0.2,
    freshnessScore: freshness.freshnessScore,
    usefulnessScore: 0.1,
    stalenessFlags: freshness.stalenessFlags,
    audienceMode,
    rhetoricalPattern,
    topicCluster,
    suppressed: true,
    suppressionReason: 'too_similar',
    decisionNotes,
  };
}
