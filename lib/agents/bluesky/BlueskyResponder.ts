/**
 * lib/agents/bluesky/BlueskyResponder.ts
 *
 * Processes a BlueskyMention through the full Tech Genie pipeline:
 *   1. Build context (mention text + thread parent if available)
 *   2. Route through AgentRouter (UCOL) to classify query
 *   3. Extract facts via KnowledgeExtractor → push to graph
 *   4. Generate a response via Lambda Labs Ollama/Hermes3 (UCOL T-027)
 *      — grounded via knowledge graph retrieval before generation
 *      — fallback chain: Lambda Labs Ollama → Nous API → Gemini Flash
 *   5. Post the reply to Bluesky with proper reply ref
 *   6. Log the interaction to Supabase (with rate-limit check)
 *
 * T-027 change: Lambda Labs Ollama (self-hosted Hermes3) is now the primary inference
 * node for Bluesky content. Knowledge graph context is injected before
 * generation to prevent hallucination of platform metrics and user stats.
 */

import { BskyAgent, RichText } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { classifyQuery } from '@/lib/ucol/agentRouter';
import { buildOllamaKnowledgeContext } from '@/lib/ucol/ollamaKnowledgeContext';
import { loadSudoPrompt } from '@/lib/ucol/sudoLoader';
import { extractFacts, detectContentType } from '@/lib/agents/knowledgeExtractor';
import { addNode, formatGraphContext, strengthenEdge, findRelatedEntities } from '@/lib/memory/graphStore';
import { searchMemories, storeMemory } from '@/lib/memory/vectorStore';
import type { BlueskyMention, EngagementResult } from './types';

const LAMBDA_OLLAMA_URL = process.env.LAMBDA_OLLAMA_URL || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'hf.co/Qwen/Qwen3.5-35B-A3B';

const NOUS_API_KEY = process.env.NOUSE_API_KEY;
const NOUS_BASE_URL =
  process.env.HERMES_BASE_URL || 'https://inference-api.nousresearch.com/v1';
const NOUS_MODEL = process.env.HERMES_MODEL_ID || 'Hermes-4.3-36B';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RESPONSE_MAX_CHARS = 290;
const BLUESKY_MEMORY_USER_ID = process.env.BLUESKY_MEMORY_USER_ID || 'tech-genie-bluesky';
const SITE_CTA = 'gen1e.xyz';
const DONATION_URL = process.env.BLUESKY_DONATION_URL || process.env.KOFI_URL || '';
const TOPIC_KEYWORDS = {
  ai: ['ai', 'llm', 'llms', 'model', 'models', 'agent', 'agents', 'inference', 'reasoning'],
  memory: ['memory', 'memory-native', 'context', 'knowledge graph', 'graph', 'rag'],
  tech: ['tech', 'developer', 'devtools', 'startup', 'saas', 'infra', 'infrastructure', 'tooling', 'news'],
};

type ActorMemoryRecord = {
  actor_did: string;
  handle: string;
  display_name?: string | null;
  first_seen_at?: string;
  last_interaction_at?: string;
  last_reply_at?: string | null;
  engagement_count?: number;
  reply_count?: number;
  topics_engaged?: unknown;
  relationship_summary?: string | null;
  tone_preference_guess?: string | null;
  last_reply_summary?: string | null;
  notes?: Record<string, unknown> | null;
  updated_at?: string;
};

type ConversationMemoryRecord = {
  thread_root_uri: string;
  actor_did: string;
  actor_handle?: string | null;
  last_topic?: string | null;
  last_agent_position?: string | null;
  open_question?: string | null;
  last_summary?: string | null;
  reply_depth?: number;
  last_mention_uri?: string | null;
  last_reply_uri?: string | null;
  updated_at?: string;
};

type ReplyIntent = 'answer' | 'clarify' | 'acknowledge' | 'follow_up' | 'decline';

let _techGenieSystemPrompt: string | null = null;

async function getTechGenieSystemPrompt(): Promise<string> {
  if (_techGenieSystemPrompt !== null) return _techGenieSystemPrompt;

  _techGenieSystemPrompt = await loadSudoPrompt('tech-genie-bluesky', {
    fallback: `TechGenieBlueskyAgent {
  identity: "Tech Genie, an AI that remembers, connects ideas, and helps people build useful things"
  constraints {
    response length <= ${RESPONSE_MAX_CHARS} characters including any CTA
    never use em dashes
    never use hashtags | never hallucinate | never engage with spam
    only mention ${SITE_CTA} when the topic is directly relevant to AI, memory-native software, agents, or the product
  }
  response format: <useful answer>
}`,
  });

  return _techGenieSystemPrompt;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function stripEmDashes(text: string): string {
  return text.replace(/[—–]/g, '-');
}

function inferTopicLabels(text: string): string[] {
  const lower = text.toLowerCase();
  const labels = new Set<string>();

  for (const [label, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mergeTopicLabels(existing: unknown, next: string[]): string[] {
  return Array.from(new Set([...asStringArray(existing), ...next])).slice(0, 12);
}

function summarizeText(text: string, max = 180): string {
  const normalized = normalizeWhitespace(stripEmDashes(text));
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3).trim()}...`;
}

function shouldIncludeSiteCta(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('gen1e') ||
    lower.includes('tech genie') ||
    lower.includes('your site') ||
    lower.includes('your product') ||
    lower.includes('your app') ||
    lower.includes('where can i try') ||
    lower.includes('where do i try') ||
    lower.includes('where can i use') ||
    lower.includes('where do i use') ||
    lower.includes('where can i find') ||
    lower.includes('where do i find') ||
    lower.includes('link?') ||
    lower.includes('send link') ||
    lower.includes('learn more') ||
    lower.includes('pricing') ||
    lower.includes('plans') ||
    lower.includes('website')
  );
}

function shouldIncludeDonationCta(text: string): boolean {
  if (!DONATION_URL) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('donate') ||
    lower.includes('donation') ||
    lower.includes('support you') ||
    lower.includes('support this') ||
    lower.includes('tip jar') ||
    lower.includes('kofi') ||
    lower.includes('ko-fi') ||
    lower.includes('how can i help') ||
    lower.includes('how do i support') ||
    lower.includes('how can i support')
  );
}

function finalizeResponse(raw: string, sourceText: string): string {
  let text = normalizeWhitespace(stripEmDashes(raw));

  if (shouldIncludeDonationCta(sourceText)) {
    const donationCta = ` Support the work: ${DONATION_URL}`.trim();
    if (DONATION_URL && !text.includes(DONATION_URL) && text.length + donationCta.length + 1 <= RESPONSE_MAX_CHARS) {
      text = `${text} ${donationCta}`.trim();
    }
  } else if (shouldIncludeSiteCta(sourceText) && !text.includes(SITE_CTA)) {
    const siteCta = ` ${SITE_CTA}`;
    if (text.length + siteCta.length <= RESPONSE_MAX_CHARS) {
      text = `${text}${siteCta}`.trim();
    }
  }

  if (text.length <= RESPONSE_MAX_CHARS) return text;
  return `${text.slice(0, RESPONSE_MAX_CHARS - 3).trim()}...`;
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[BlueskyResponder] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export class BlueskyResponder {
  private agent: BskyAgent;
  private supabase: SupabaseClient;
  private authenticated = false;

  constructor() {
    const handle = process.env.BLUESKY_HANDLE;
    const appPassword = process.env.BLUESKY_APP_PASSWORD;

    if (!handle || !appPassword) {
      throw new Error(
        '[BlueskyResponder] Missing env vars: BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD'
      );
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

  private async isRateLimited(authorDid: string): Promise<boolean> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { data, error } = await this.supabase
      .from('bluesky_interactions')
      .select('id')
      .eq('author_did', authorDid)
      .gte('created_at', windowStart)
      .limit(1);

    if (error) {
      console.error('[BlueskyResponder] Rate-limit check failed:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  }

  private async fetchParentText(parentUri: string): Promise<string | null> {
    try {
      const thread = await this.agent.getPostThread({ uri: parentUri, depth: 0 });
      const post = thread.data.thread.post as Record<string, unknown> | undefined;
      const record = post?.['record'] as Record<string, unknown> | undefined;
      return typeof record?.['text'] === 'string' ? record['text'] : null;
    } catch {
      return null;
    }
  }

  private async getActorMemory(actorDid: string): Promise<ActorMemoryRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('bluesky_actor_memory')
        .select('*')
        .eq('actor_did', actorDid)
        .maybeSingle();

      if (error || !data) return null;
      return data as ActorMemoryRecord;
    } catch {
      return null;
    }
  }

  private async getConversationMemory(threadRootUri: string): Promise<ConversationMemoryRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('bluesky_conversation_memory')
        .select('*')
        .eq('thread_root_uri', threadRootUri)
        .maybeSingle();

      if (error || !data) return null;
      return data as ConversationMemoryRecord;
    } catch {
      return null;
    }
  }

  private inferReplyIntent(
    mention: BlueskyMention,
    actorMemory: ActorMemoryRecord | null,
    conversationMemory: ConversationMemoryRecord | null
  ): ReplyIntent {
    const lower = mention.text.toLowerCase().trim();

    if (!lower || lower.length < 3) return 'decline';
    if (lower.includes('?')) return conversationMemory?.open_question ? 'follow_up' : 'answer';
    if (lower.includes('what do you mean') || lower.includes('which one') || lower.includes('how so')) {
      return 'clarify';
    }
    if (lower.length < 18 || /^(nice|cool|wow|lol|thanks|thx|yep|same)[!. ]*$/i.test(lower)) {
      return 'acknowledge';
    }
    if ((actorMemory?.engagement_count ?? 0) >= 2 || conversationMemory?.reply_depth) {
      return 'follow_up';
    }
    return 'answer';
  }

  private async generateResponse(context: string, userId?: string): Promise<string> {
    const systemPrompt = await getTechGenieSystemPrompt();

    let enrichedSystem = systemPrompt;
    if (userId) {
      try {
        const knowledgeCtx = await buildOllamaKnowledgeContext(userId, context);
        if (knowledgeCtx.systemFragment) {
          enrichedSystem = `${systemPrompt}\n\n${knowledgeCtx.systemFragment}`;
          console.log(
            `[BlueskyResponder] Knowledge context injected — facts=${knowledgeCtx.factsUsed} nodes=${knowledgeCtx.graphNodesUsed}`
          );
        }
      } catch (err) {
        console.warn('[BlueskyResponder] Knowledge context injection failed (non-blocking):', err);
      }
    }

    if (LAMBDA_OLLAMA_URL) {
      try {
        const raw = await this.generateWithOllamaEndpoint(LAMBDA_OLLAMA_URL, context, enrichedSystem);
        console.log('[BlueskyResponder] Generated via Lambda Labs Ollama (self-hosted)');
        return this.enforceCharLimit(raw, context);
      } catch (err) {
        console.warn('[BlueskyResponder] Lambda Labs Ollama failed, falling back to Nous API:', err);
      }
    }

    if (NOUS_API_KEY) {
      try {
        const raw = await this.generateWithOllamaEndpoint(NOUS_BASE_URL, context, enrichedSystem, {
          apiKey: NOUS_API_KEY,
          model: NOUS_MODEL,
        });
        return this.enforceCharLimit(raw, context);
      } catch (err) {
        console.warn('[BlueskyResponder] Nous API failed, falling back to Gemini:', err);
      }
    }

    const geminiResponse = await this.generateWithGemini(context, enrichedSystem);
    return this.enforceCharLimit(geminiResponse, context);
  }

  private async generateWithOllamaEndpoint(
    baseUrl: string,
    context: string,
    systemPrompt: string,
    opts?: { apiKey?: string; model?: string }
  ): Promise<string> {
    const model = opts?.model ?? OLLAMA_MODEL;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts?.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`;

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context },
        ],
        max_tokens: 150,
        temperature: 0.75,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama endpoint ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Endpoint returned empty content');
    }
    return text.trim();
  }

  private async generateWithGemini(context: string, systemPrompt: string): Promise<string> {
    const effectiveApiKey =
      process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    const gemini = new GoogleGenerativeAI(effectiveApiKey);
    const model = gemini.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: context }] }],
      systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
    });

    return result.response.text().trim();
  }

  private enforceCharLimit(raw: string, sourceText: string): string {
    return finalizeResponse(raw, sourceText);
  }

  private async persistKnowledgeFromMention(params: {
    mention: BlueskyMention;
    responseText: string;
    facts: Array<{ topic: string; fact: string; confidence: number; sourceUrl?: string }>;
  }): Promise<void> {
    const { mention, responseText, facts } = params;
    const topicLabels = inferTopicLabels(`${mention.text} ${responseText}`);

    await storeMemory(
      BLUESKY_MEMORY_USER_ID,
      `Bluesky mention from @${mention.authorHandle}: ${mention.text}`,
      'conversation_summary',
      {
        source: 'bluesky',
        kind: 'mention',
        authorHandle: mention.authorHandle,
        authorDid: mention.authorDid,
        mentionUri: mention.uri,
        topics: topicLabels,
      }
    );

    await storeMemory(
      BLUESKY_MEMORY_USER_ID,
      `Bluesky reply to @${mention.authorHandle}: ${responseText}`,
      'conversation_summary',
      {
        source: 'bluesky',
        kind: 'reply',
        authorHandle: mention.authorHandle,
        authorDid: mention.authorDid,
        mentionUri: mention.uri,
        topics: topicLabels,
      }
    );

    const authorNodeId = await addNode(
      BLUESKY_MEMORY_USER_ID,
      mention.authorHandle,
      'person',
      `Bluesky account ${mention.authorHandle}`,
      { source: 'bluesky', did: mention.authorDid },
      'bluesky-agent',
      'SUPPORTED'
    );

    for (const label of topicLabels) {
      const topicNodeId = await addNode(
        BLUESKY_MEMORY_USER_ID,
        label,
        'concept',
        `Topic inferred from Bluesky interaction: ${label}`,
        { source: 'bluesky' },
        'bluesky-agent',
        'SUPPORTED'
      );

      if (authorNodeId && topicNodeId) {
        await strengthenEdge(
          BLUESKY_MEMORY_USER_ID,
          authorNodeId,
          topicNodeId,
          'interested_in',
          'bluesky-agent',
          'SUPPORTED'
        );
      }
    }

    for (const fact of facts) {
      await storeMemory(
        BLUESKY_MEMORY_USER_ID,
        `${fact.topic}: ${fact.fact}`,
        'fact',
        {
          source: 'bluesky',
          authorHandle: mention.authorHandle,
          authorDid: mention.authorDid,
          mentionUri: mention.uri,
          confidence: fact.confidence,
          topic: fact.topic,
          sourceUrl: fact.sourceUrl ?? null,
        }
      );

      const factNodeId = await addNode(
        BLUESKY_MEMORY_USER_ID,
        fact.topic,
        'concept',
        fact.fact,
        {
          source: 'bluesky',
          mentionUri: mention.uri,
          confidence: fact.confidence,
        },
        'bluesky-agent',
        fact.confidence >= 0.9 ? 'CONFIRMED' : 'SUPPORTED'
      );

      if (authorNodeId && factNodeId) {
        await strengthenEdge(
          BLUESKY_MEMORY_USER_ID,
          authorNodeId,
          factNodeId,
          'discussed',
          'bluesky-agent',
          'SUPPORTED'
        );
      }
    }
  }

  private async buildMemoryContext(
    mention: BlueskyMention,
    actorMemory: ActorMemoryRecord | null,
    conversationMemory: ConversationMemoryRecord | null,
    replyIntent: ReplyIntent
  ): Promise<string> {
    try {
      const memories = await searchMemories(BLUESKY_MEMORY_USER_ID, mention.text, 4);
      const graph = await findRelatedEntities(BLUESKY_MEMORY_USER_ID, mention.authorHandle);
      const memoryLines = memories
        .slice(0, 4)
        .map((memory) => `- ${memory.content}`)
        .join('\n');
      const graphContext = formatGraphContext(graph);

      const actorTopics = asStringArray(actorMemory?.topics_engaged);
      const actorContext = actorMemory
        ? [
            `Recurring follower: @${actorMemory.handle}`,
            actorMemory.relationship_summary ? `Relationship: ${actorMemory.relationship_summary}` : '',
            actorMemory.last_reply_summary ? `Last reply summary: ${actorMemory.last_reply_summary}` : '',
            actorTopics.length ? `Topics engaged: ${actorTopics.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      const threadContext = conversationMemory
        ? [
            `Thread memory root: ${conversationMemory.thread_root_uri}`,
            conversationMemory.last_topic ? `Last topic: ${conversationMemory.last_topic}` : '',
            conversationMemory.last_agent_position ? `Last agent position: ${conversationMemory.last_agent_position}` : '',
            conversationMemory.open_question ? `Open question: ${conversationMemory.open_question}` : '',
            conversationMemory.last_summary ? `Last summary: ${conversationMemory.last_summary}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      const intentContext = `Reply intent: ${replyIntent}`;

      if (!memoryLines && !graphContext && !actorContext && !threadContext) {
        return intentContext;
      }

      return [
        intentContext,
        actorContext ? `Social memory:\n${actorContext}` : '',
        threadContext ? `Conversation memory:\n${threadContext}` : '',
        memoryLines ? `Relevant Bluesky memory context:\n${memoryLines}` : '',
        graphContext || '',
      ]
        .filter(Boolean)
        .join('\n\n');
    } catch (err) {
      console.warn('[BlueskyResponder] Failed to build memory context (non-blocking):', err);
      return `Reply intent: ${replyIntent}`;
    }
  }

  private async logInteraction(params: {
    mention: BlueskyMention;
    responseText: string;
    responseUri?: string;
    factsExtracted: number;
    routedTo: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('bluesky_interactions')
      .insert({
        mention_uri: params.mention.uri,
        author_handle: params.mention.authorHandle,
        author_did: params.mention.authorDid,
        mention_text: params.mention.text,
        response_text: params.responseText,
        response_uri: params.responseUri ?? null,
        facts_extracted: params.factsExtracted,
        routed_to: params.routedTo,
      });

    if (error) {
      console.error('[BlueskyResponder] Failed to log interaction to Supabase:', error);
    }
  }

  private async upsertActorMemory(params: {
    mention: BlueskyMention;
    topicLabels: string[];
    responseText?: string;
    replied: boolean;
  }): Promise<void> {
    const current = await this.getActorMemory(params.mention.authorDid);
    const now = new Date().toISOString();

    const payload = {
      actor_did: params.mention.authorDid,
      handle: params.mention.authorHandle,
      display_name: null,
      first_seen_at: current?.first_seen_at ?? now,
      last_interaction_at: now,
      last_reply_at: params.replied ? now : current?.last_reply_at ?? null,
      engagement_count: (current?.engagement_count ?? 0) + 1,
      reply_count: (current?.reply_count ?? 0) + (params.replied ? 1 : 0),
      topics_engaged: mergeTopicLabels(current?.topics_engaged, params.topicLabels),
      relationship_summary: current?.relationship_summary ?? null,
      tone_preference_guess: current?.tone_preference_guess ?? null,
      last_reply_summary: params.replied && params.responseText ? summarizeText(params.responseText, 160) : current?.last_reply_summary ?? null,
      notes: current?.notes ?? {},
      updated_at: now,
    };

    const { error } = await this.supabase
      .from('bluesky_actor_memory')
      .upsert(payload, { onConflict: 'actor_did' });

    if (error) {
      console.error('[BlueskyResponder] Failed to upsert bluesky_actor_memory:', error);
    }
  }

  private async upsertConversationMemory(params: {
    threadRootUri: string;
    mention: BlueskyMention;
    responseText?: string;
    topicLabels: string[];
    responseUri?: string;
    replyIntent: ReplyIntent;
  }): Promise<void> {
    const current = await this.getConversationMemory(params.threadRootUri);
    const now = new Date().toISOString();
    const lower = params.mention.text.toLowerCase();
    const openQuestion = lower.includes('?') ? summarizeText(params.mention.text, 160) : null;

    const payload = {
      thread_root_uri: params.threadRootUri,
      actor_did: params.mention.authorDid,
      actor_handle: params.mention.authorHandle,
      last_topic: params.topicLabels[0] ?? current?.last_topic ?? null,
      last_agent_position: params.responseText ? summarizeText(params.responseText, 120) : current?.last_agent_position ?? null,
      open_question: params.replyIntent === 'follow_up' || params.replyIntent === 'clarify' ? openQuestion : null,
      last_summary: params.responseText ? summarizeText(params.responseText, 180) : current?.last_summary ?? null,
      reply_depth: (current?.reply_depth ?? 0) + 1,
      last_mention_uri: params.mention.uri,
      last_reply_uri: params.responseUri ?? current?.last_reply_uri ?? null,
      updated_at: now,
    };

    const { error } = await this.supabase
      .from('bluesky_conversation_memory')
      .upsert(payload, { onConflict: 'thread_root_uri' });

    if (error) {
      console.error('[BlueskyResponder] Failed to upsert bluesky_conversation_memory:', error);
    }
  }

  async respond(mention: BlueskyMention): Promise<EngagementResult> {
    const base: EngagementResult = {
      mentionUri: mention.uri,
      responded: false,
      factsExtracted: 0,
    };

    try {
      await this.ensureAuth();

      const limited = await this.isRateLimited(mention.authorDid);
      if (limited) {
        console.log(`[BlueskyResponder] Rate-limited: skipping reply to ${mention.authorHandle}`);
        return { ...base, error: 'rate_limited' };
      }

      const threadRootUri = mention.replyRef?.root.uri ?? mention.uri;
      const actorMemory = await this.getActorMemory(mention.authorDid);
      const conversationMemory = await this.getConversationMemory(threadRootUri);
      const replyIntent = this.inferReplyIntent(mention, actorMemory, conversationMemory);

      if (replyIntent === 'decline') {
        return { ...base, error: 'declined_low_signal' };
      }

      let contextText = mention.text;

      if (mention.replyRef) {
        const parentText = await this.fetchParentText(mention.replyRef.parent.uri);
        if (parentText) {
          contextText = `[Thread context: "${parentText}"]\n\nMention: ${mention.text}`;
        }
      }

      const memoryContext = await this.buildMemoryContext(mention, actorMemory, conversationMemory, replyIntent);
      if (memoryContext) {
        contextText = `${memoryContext}\n\n${contextText}`;
      }

      const routing = await classifyQuery(
        mention.text,
        contextText,
        undefined,
        `bluesky:${mention.authorDid}`
      );

      console.log(
        `[BlueskyResponder] Routed "${mention.text.substring(0, 60)}" → ` +
        `${routing.targetNode} (${routing.taskType}, clf=${routing.confidence.toFixed(2)})`
      );

      const contentType = detectContentType(mention.text);
      const facts = await extractFacts(contextText, contentType);
      const factsExtracted = facts.length;

      if (factsExtracted > 0) {
        console.log(
          `[BlueskyResponder] Extracted ${factsExtracted} facts from mention ` +
          `(${mention.uri})`
        );
      }

      const responseText = await this.generateResponse(contextText, BLUESKY_MEMORY_USER_ID);
      const topicLabels = inferTopicLabels(`${mention.text} ${responseText}`);

      await this.persistKnowledgeFromMention({
        mention,
        responseText,
        facts,
      });

      const replyRef = mention.replyRef
        ? {
            root: { uri: mention.replyRef.root.uri, cid: mention.replyRef.root.cid },
            parent: { uri: mention.uri, cid: mention.cid },
          }
        : {
            root: { uri: mention.uri, cid: mention.cid },
            parent: { uri: mention.uri, cid: mention.cid },
          };

      const rt = new RichText({ text: responseText });
      await rt.detectFacets(this.agent);

      const postResult = await this.agent.post({
        text: rt.text,
        facets: rt.facets,
        reply: replyRef,
        createdAt: new Date().toISOString(),
      });

      const responseUri = postResult.uri;
      console.log(`[BlueskyResponder] Posted reply: ${responseUri}`);

      await this.upsertActorMemory({
        mention,
        topicLabels,
        responseText,
        replied: true,
      });

      await this.upsertConversationMemory({
        threadRootUri,
        mention,
        responseText,
        topicLabels,
        responseUri,
        replyIntent,
      });

      await this.logInteraction({
        mention,
        responseText,
        responseUri,
        factsExtracted,
        routedTo: routing.targetNode,
      });

      return {
        mentionUri: mention.uri,
        responded: true,
        responseUri,
        factsExtracted,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[BlueskyResponder] Failed to respond to ${mention.uri}:`, message);
      return { ...base, error: message };
    }
  }
}
