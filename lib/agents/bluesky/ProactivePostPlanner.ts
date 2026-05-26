import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { searchMemories } from '@/lib/memory/vectorStore';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { EngagementLearningStore } from './EngagementLearningStore';

function formatError(err: unknown) {
  return err instanceof Error ? { message: err.message, stack: err.stack } : err;
}

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
  communityContext?: string; // <- injected from TimelineDiscoveryEngine
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
    | 'draft_borderline'
    | 'stale_mix';
  decisionNotes?: string[];
  runId?: string;
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
  fallbackCluster: string,
  runId?: string
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
    console.warn(JSON.stringify({ runId, event: 'planner_deferred_prioritization_error', error: formatError(err) }));
    return fallbackCluster;
  }
}

function buildPrompt(packet: GroundingPacket): string {
  const communityBlock = packet.communityContext
    ? [
        `Community context (what your followers are discussing right now):`,
        packet.communityContext,
        `IMPORTANT: Only engage with community topics if they intersect naturally with your core persona (AI, memory-native systems, developer tools). If they don't align, ignore them or pivot the framing to your expertise. Do NOT write off-brand content just to fit in.`,
      ].join('\n')
    : '';

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
    communityBlock ? `\n${communityBlock}` : '',
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
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
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

async function fetchRecentPlannerState(runId?: string): Promise<RecentPlannerState[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('intent, lane, source_kind, topic_cluster, created_at')
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) {
      console.warn(JSON.stringify({ runId, event: 'planner_fetch_recent_state_db_error', error: formatError(error) }));
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
    console.warn(JSON.stringify({ runId, event: 'planner_fetch_recent_state_error', error: formatError(err) }));
    return [];
  }
}

async function fetchRecentPostContext(runId?: string): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('text, lane, intent, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn(JSON.stringify({ runId, event: 'planner_fetch_recent_context_db_error', error: formatError(error) }));
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
    console.warn(JSON.stringify({ runId, event: 'planner_fetch_recent_context_error', error: formatError(err) }));
    return '';
  }
}

async function isTooSimilarToRecentPosts(text: string, runId?: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bluesky_proactive_posts')
      .select('text, created_at')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error) {
      console.warn(JSON.stringify({ runId, event: 'planner_dedupe_lookup_db_error', error: formatError(error) }));
      return false;
    }

    const candidate = normalizeForDedupe(text);
    const candidateWords = new Set(candidate.split(' ').filter(Boolean));

    return (data ?? []).some((row: { text: string }) => {
      const existing = normalizeForDedupe(row.text);
      if (!existing) return false;
      if (existing === candidate) return true;

      const existingWords = new Set(existing.split(' ').filter(Boolean));
      // Only consider words ≥4 chars to avoid false matches on common short words ("ai", "the", etc.)
      const meaningfulCandidate = [...candidateWords].filter((w) => w.length >= 4);
      const overlap = meaningfulCandidate.filter((word) => existingWords.has(word)).length;
      const baseline = Math.max(1, Math.min(meaningfulCandidate.length, existingWords.size));
      // Reduced threshold: 0.65 (was 0.80). Short posts share too many words by coincidence.
      return meaningfulCandidate.length >= 5 && overlap / baseline >= 0.65;
    });
  } catch (err) {
    console.warn(JSON.stringify({ runId, event: 'planner_dedupe_lookup_error', error: formatError(err) }));
    return false;
  }
}

async function hasRecentPostCooldown(hours = 12, runId?: string): Promise<boolean> {
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
      console.warn(JSON.stringify({ runId, event: 'planner_cooldown_lookup_db_error', error: formatError(error) }));
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn(JSON.stringify({ runId, event: 'planner_cooldown_lookup_error', error: formatError(err) }));
    return false;
  }
}

async function hasRecentPublicationMatch(url: string, hours = 72, runId?: string): Promise<boolean> {
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
      console.warn(JSON.stringify({ runId, event: 'planner_publication_dedupe_db_error', error: formatError(error) }));
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.warn(JSON.stringify({ runId, event: 'planner_publication_dedupe_error', error: formatError(err) }));
    return false;
  }
}

async function getTopicState(topic: string, lane: BlueskyTopicLane, runId?: string): Promise<{
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
      console.warn(JSON.stringify({ runId, event: 'planner_fetch_topic_state_db_error', error: formatError(error), topic, lane }));
      return { postCount7d: 0, postCount30d: 0 };
    }

    if (!data) return { postCount7d: 0, postCount30d: 0 };

    return {
      postCount7d: data.post_count_7d ?? 0,
      postCount30d: data.post_count_30d ?? 0,
    };
  } catch (err) {
    console.warn(JSON.stringify({ runId, event: 'planner_fetch_topic_state_error', error: formatError(err), topic, lane }));
    return { postCount7d: 0, postCount30d: 0 };
  }
}

async function getRecencyPenalty(topic: string, lane: BlueskyTopicLane, runId?: string): Promise<number> {
  const state = await getTopicState(topic, lane, runId);
  // Adjusted coefficient: 0.15 per post in 7d to heavily penalize over-indexed topics.
  return state.postCount7d * 0.15;
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
  runId?: string;
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
      console.error(JSON.stringify({ runId: params.runId, event: 'planner_log_post_db_error', error: formatError(error) }));
    }
  } catch (err) {
    console.error(JSON.stringify({ runId: params.runId, event: 'planner_log_post_error', error: formatError(err) }));
  }
}

export async function updateBlueskyTopicState(params: {
  topic: string;
  lane: BlueskyTopicLane;
  posted: boolean;
  runId?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const current = await getTopicState(params.topic, params.lane, params.runId);

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
      console.error(JSON.stringify({ runId: params.runId, event: 'planner_update_topic_state_db_error', error: formatError(error) }));
    }
  } catch (err) {
    console.error(JSON.stringify({ runId: params.runId, event: 'planner_update_topic_state_error', error: formatError(err) }));
  }
}

async function fetchTechNewsGrounding(runId?: string): Promise<{ grounding: string; sourceConfidence: number }> {
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
    console.warn(JSON.stringify({ runId, event: 'planner_fetch_news_grounding_error', error: formatError(err) }));
    return { grounding: 'No current headline grounding available.', sourceConfidence: 0.3 };
  }
}

async function fetchMemoryGrounding(
  lane: BlueskyTopicLane,
  runId?: string
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
    console.warn(JSON.stringify({ runId, event: 'planner_fetch_memory_grounding_error', error: formatError(err) }));
    return { grounding: 'No memory grounding available.', sourceConfidence: 0.35 };
  }
}

/**
 * Fetches recent ephemeral timeline memories and returns a community context summary.
 * These are the posts written by TimelineDiscoveryEngine, tagged with memory_type: ephemeral_timeline.
 * If no timeline memories exist yet, returns an empty string (graceful degradation).
 */
async function fetchCommunityContext(lane: BlueskyTopicLane, runId?: string): Promise<string> {
  try {
    const query = lane === 'ai'
      ? 'AI agent LLM inference reasoning community'
      : lane === 'memory'
      ? 'memory context retrieval knowledge graph persistent'
      : 'developer tools infrastructure SaaS architecture';

    // Search specifically in ephemeral timeline memories
    const memories = await searchMemories(BLUESKY_MEMORY_USER_ID, query, 6);

    const timelineMemories = memories.filter(
      (m) => m.metadata?.memory_type === 'ephemeral_timeline'
    );

    if (timelineMemories.length === 0) return '';

    // Extract dominant topics from metadata
    const topicCounts = new Map<string, number>();
    for (const mem of timelineMemories) {
      const topics = Array.isArray(mem.metadata?.topics) ? mem.metadata.topics as string[] : [];
      for (const topic of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }

    const ranked = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([topic, count]) => `${topic} (${count} posts)`);

    if (ranked.length === 0) return '';

    console.log(JSON.stringify({ runId, event: 'planner_community_context_fetched', topics: ranked }));
    return `Followers are currently discussing: ${ranked.join(', ')}.`;
  } catch (err) {
    console.warn(JSON.stringify({ runId, event: 'planner_community_context_error', error: formatError(err) }));
    return '';
  }
}

async function buildGroundingPacket(
  lane: BlueskyTopicLane,
  intent: BlueskyPostIntent,
  sourceKind: BlueskySourceKind,
  audienceMode: BlueskyAudienceMode,
  rhetoricalPattern: BlueskyRhetoricalPattern,
  recent: RecentPlannerState[],
  runId?: string
): Promise<GroundingPacket> {
  const recentContext = await fetchRecentPostContext(runId);
  const communityContext = await fetchCommunityContext(lane, runId);
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
    const result = await fetchTechNewsGrounding(runId);
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
      communityContext,
    };
  }

  const memoryResult = await fetchMemoryGrounding(lane, runId);

  if (sourceKind === 'hybrid' && lane !== 'tech') {
    const newsResult = await fetchTechNewsGrounding(runId);
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
      communityContext,
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
    communityContext,
  };
}

export async function planDistributionBlueskyPost(params: {
  title: string;
  summary: string;
  url: string;
  lane?: BlueskyTopicLane;
  topics?: string[];
}, runId?: string): Promise<PlannedBlueskyPost> {
  const lane = params.lane ?? 'ai';
  const recent = await fetchRecentPlannerState(runId);
  const intent: BlueskyPostIntent = 'distribution';
  const topics = params.topics?.length ? params.topics : inferTopicsFromLane(lane);
  const topicCluster = await maybePrioritizeDeferredTopicCluster(
    lane,
    inferTopicCluster(lane, topics),
    runId
  );
  const recentContext = await fetchRecentPostContext(runId);
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
  const tooSimilar = await isTooSimilarToRecentPosts(text, runId);
  const recencyPenalty = await getRecencyPenalty(topicCluster, lane, runId);
  const publicationAlreadyShared = await hasRecentPublicationMatch(params.url, 168, runId);
  const recentCooldown = await hasRecentPostCooldown(12, runId);
  let { qualityScore, usefulnessScore, suppressionReason } = scoreCandidate(text, packet);

  console.log(JSON.stringify({ runId, event: 'planner_score_evaluated', qualityScore, usefulnessScore, suppressionReason }));

  if (recencyPenalty > 0) {
    qualityScore = Math.max(0, qualityScore - recencyPenalty);
    decisionNotes.push(`applied recency penalty -${recencyPenalty.toFixed(2)} to quality score`);
  }

  if (tooSimilar) decisionNotes.push('suppressed: too similar to recent posts');
  if (publicationAlreadyShared) decisionNotes.push('suppressed: publication already shared recently');
  if (recentCooldown) decisionNotes.push('suppressed: recent proactive cooldown still active');
  if (freshness.stalenessFlags.length) decisionNotes.push(`freshness flags: ${freshness.stalenessFlags.join(', ')}`);
  
  let finalSuppressionReason = suppressionReason;
  let suppressed = false;
  
  if (tooSimilar || publicationAlreadyShared || recentCooldown) {
    suppressed = true;
    finalSuppressionReason = tooSimilar ? 'too_similar' : publicationAlreadyShared ? 'too_similar' : 'oversaturated_topic';
  } else if (qualityScore >= 0.45 && qualityScore < 0.55 && !suppressionReason) {
    suppressed = true;
    finalSuppressionReason = 'draft_borderline';
    decisionNotes.push('suppressed: draft_borderline');
  } else if (suppressionReason && qualityScore < 0.55) {
    suppressed = true;
    decisionNotes.push(`suppressed: ${suppressionReason}`);
  }

  if (suppressed) {
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
      suppressionReason: finalSuppressionReason,
      decisionNotes,
      runId,
    };
  }

  decisionNotes.push('approved: distribution candidate passed quality and saturation checks');
  console.log(JSON.stringify({ runId, event: 'planner_decision_notes', decisionNotes }));

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
    runId,
  };
}

export async function planProactiveBlueskyPost(
  laneOverride?: BlueskyTopicLane,
  runId?: string
): Promise<PlannedBlueskyPost> {
  const lane = laneOverride ?? chooseLane();
  const recent = await fetchRecentPlannerState(runId);
  const intent = chooseIntent(lane, recent);
  const sourceKind = chooseSourceKind(lane, recent);
  const audienceMode = chooseAudienceMode(lane);
  const rhetoricalPattern = chooseRhetoricalPattern(lane, intent);
  const packet = await buildGroundingPacket(lane, intent, sourceKind, audienceMode, rhetoricalPattern, recent, runId);
  const topicCluster = await maybePrioritizeDeferredTopicCluster(
    lane,
    inferTopicCluster(lane, packet.topics),
    runId
  );
  packet.topicCluster = topicCluster;
  const recencyPenalty = await getRecencyPenalty(topicCluster, lane, runId);
  const recentCooldown = await hasRecentPostCooldown(12, runId);
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

  if (recentCooldown) decisionNotes.push('recent proactive cooldown still active');
  if (freshness.stalenessFlags.length) {
    decisionNotes.push(`freshness flags: ${freshness.stalenessFlags.join(', ')}`);
  }

  if (recentCooldown) {
    console.log(JSON.stringify({ runId, event: 'planner_decision_notes', decisionNotes }));
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
    const tooSimilar = await isTooSimilarToRecentPosts(text, runId);
    if (tooSimilar) {
      decisionNotes.push(`attempt ${attempt + 1}: too similar to recent posts`);
      continue;
    }

    let { qualityScore, usefulnessScore, suppressionReason } = scoreCandidate(text, packet);

    console.log(JSON.stringify({ runId, event: 'planner_score_evaluated', attempt: attempt + 1, qualityScore, usefulnessScore, suppressionReason }));

    if (recencyPenalty > 0) {
      qualityScore = Math.max(0, qualityScore - recencyPenalty);
      decisionNotes.push(`attempt ${attempt + 1}: applied recency penalty -${recencyPenalty.toFixed(2)}`);
    }

    const staleMix = freshness.freshnessScore < 0.45;
    let suppressed = false;
    let finalSuppressionReason = suppressionReason;

    if (qualityScore >= 0.45 && qualityScore < 0.55 && !suppressionReason) {
      suppressed = true;
      finalSuppressionReason = 'draft_borderline';
    } else if ((suppressionReason && qualityScore < 0.55) || staleMix) {
      suppressed = true;
      finalSuppressionReason = staleMix ? 'stale_mix' : suppressionReason;
    }

    if (!suppressed) {
      decisionNotes.push(`approved on attempt ${attempt + 1}`);
      console.log(JSON.stringify({ runId, event: 'planner_decision_notes', decisionNotes }));
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
        runId,
      };
    }

    if (attempt === 2) {
      decisionNotes.push(`final suppression on attempt ${attempt + 1}: ${finalSuppressionReason}`);
      console.log(JSON.stringify({ runId, event: 'planner_decision_notes', decisionNotes }));
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
  console.log(JSON.stringify({ runId, event: 'planner_decision_notes', decisionNotes }));
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
