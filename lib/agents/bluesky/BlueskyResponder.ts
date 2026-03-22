/**
 * lib/agents/bluesky/BlueskyResponder.ts
 *
 * Processes a BlueskyMention through the full Tech Genie pipeline:
 *   1. Build context (mention text + thread parent if available)
 *   2. Route through AgentRouter (UCOL) to classify query
 *   3. Extract facts via KnowledgeExtractor → push to graph
 *   4. Generate a response via GKE Ollama/Hermes3 (UCOL T-027)
 *      — grounded via knowledge graph retrieval before generation
 *      — fallback chain: GKE Ollama → Nous API → Gemini Flash
 *   5. Post the reply to Bluesky with proper reply ref
 *   6. Log the interaction to Supabase (with rate-limit check)
 *
 * T-027 change: GKE Ollama (self-hosted Hermes3) is now the primary inference
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
import type { BlueskyMention, EngagementResult } from './types';

// ─── Inference Config ─────────────────────────────────────────────────────────

// GKE Ollama (primary) — self-hosted Hermes3, zero API cost
const OLLAMA_GKE_URL = process.env.OLLAMA_GKE_URL || '';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'hermes3';

// Nous Research (secondary fallback)
const NOUS_API_KEY = process.env.NOUSE_API_KEY;
const NOUS_BASE_URL =
  process.env.HERMES_BASE_URL || 'https://inference-api.nousresearch.com/v1';
const NOUS_MODEL = process.env.HERMES_MODEL_ID || 'Hermes-4.3-36B';

// ─── Constants ────────────────────────────────────────────────────────────────

// 15 min window — allows back-and-forth conversation without killing threads
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RESPONSE_MAX_CHARS = 290; // Bluesky post limit with a small buffer
const CTA_SUFFIX = ' — gen1e.xyz';

// Lazy-loaded system prompt: initialized on first use, cached for the process lifetime.
// Uses the UCOL sudoLoader which handles file resolution, caching, and fallback automatically.
let _techGenieSystemPrompt: string | null = null;

async function getTechGenieSystemPrompt(): Promise<string> {
  if (_techGenieSystemPrompt !== null) return _techGenieSystemPrompt;

  _techGenieSystemPrompt = await loadSudoPrompt('tech-genie-bluesky', {
    fallback: `TechGenieBlueskyAgent {
  identity: "Tech Genie — AI that remembers, connects, and builds with you"
  constraints {
    response length <= ${RESPONSE_MAX_CHARS} characters including CTA
    always append "${CTA_SUFFIX}"
    never use hashtags | never hallucinate | never engage with spam
  }
  response format: <useful answer> ${CTA_SUFFIX}
}`,
  });

  return _techGenieSystemPrompt;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── BlueskyResponder ─────────────────────────────────────────────────────────

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

    // Primary: Hermes via NOUSE_API_KEY (Nous Research portal)
    // Fallback: Gemini via BLUESKY_GEMINI_API_KEY or GOOGLE_API_KEY
    // At least one must be present at runtime (not validated at construction time
    // to allow partial deployments to still start up).

    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.supabase = getSupabaseClient();
  }

  // ─── Auth ────────────────────────────────────────────────────────────────

  private async ensureAuth(): Promise<void> {
    if (this.authenticated) return;
    await this.agent.login({
      identifier: process.env.BLUESKY_HANDLE!,
      password: process.env.BLUESKY_APP_PASSWORD!,
    });
    this.authenticated = true;
  }

  // ─── Rate Limit Check ────────────────────────────────────────────────────

  /**
   * Returns true if we have already replied to this author within the last hour.
   */
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
      // Fail open — don't block the reply on a DB error
      return false;
    }

    return (data?.length ?? 0) > 0;
  }

  // ─── Thread Context ──────────────────────────────────────────────────────

  /**
   * Fetches the parent post text for additional context when the mention is a reply.
   */
  private async fetchParentText(parentUri: string): Promise<string | null> {
    try {
      const thread = await this.agent.getPostThread({ uri: parentUri, depth: 0 });
      const post = thread.data.thread.post as Record<string, unknown> | undefined;
      const record = post?.['record'] as Record<string, unknown> | undefined;
      return typeof record?.['text'] === 'string' ? record['text'] : null;
    } catch {
      // Non-fatal — proceed without parent context
      return null;
    }
  }

  // ─── Response Generation ─────────────────────────────────────────────────

  /**
   * Primary: Hermes-4.3-36B via Nous Research inference API
   * Fallback: Gemini Flash
   *
   * Hermes is used as primary because it has native chain-of-thought reasoning,
   * 128k context, and is purpose-built for instruction following.
   * Gemini is the always-available fallback if the Nous key is unavailable.
   */
  private async generateResponse(context: string, userId?: string): Promise<string> {
    const systemPrompt = await getTechGenieSystemPrompt();

    // ── 0. Inject knowledge graph context (T-027) ───────────────────────────
    // Ground the generation in Tech Genie's memory before any model call.
    // This is the primary fix for hallucinated platform metrics (T-013).
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

    // ── 1. GKE Ollama — self-hosted Hermes3 (primary, UCOL T-027) ──────────
    if (OLLAMA_GKE_URL) {
      try {
        const raw = await this.generateWithOllamaEndpoint(OLLAMA_GKE_URL, context, enrichedSystem);
        console.log('[BlueskyResponder] Generated via GKE Ollama (self-hosted)');
        return this.enforceCharLimit(raw);
      } catch (err) {
        console.warn('[BlueskyResponder] GKE Ollama failed, falling back to Nous API:', err);
      }
    }

    // ── 2. Nous Research (API fallback) ────────────────────────────────────
    if (NOUS_API_KEY) {
      try {
        const raw = await this.generateWithOllamaEndpoint(NOUS_BASE_URL, context, enrichedSystem, {
          apiKey: NOUS_API_KEY,
          model: NOUS_MODEL,
        });
        return this.enforceCharLimit(raw);
      } catch (err) {
        console.warn('[BlueskyResponder] Nous API failed, falling back to Gemini:', err);
      }
    }

    // ── 3. Fallback: Gemini Flash ───────────────────────────────────────────
    return this.generateWithGemini(context, enrichedSystem);
  }

  /** Shared OpenAI-compatible chat completion (non-streaming) for Ollama + Nous */
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

  private enforceCharLimit(raw: string): string {
    if (raw.length <= RESPONSE_MAX_CHARS) return raw;
    return (
      raw.substring(0, RESPONSE_MAX_CHARS - CTA_SUFFIX.length - 3) +
      '...' +
      CTA_SUFFIX
    );
  }

  // ─── Log Interaction ─────────────────────────────────────────────────────

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

  // ─── Respond ─────────────────────────────────────────────────────────────

  /**
   * Full pipeline: classify → extract facts → generate response → post reply → log.
   */
  async respond(mention: BlueskyMention): Promise<EngagementResult> {
    const base: EngagementResult = {
      mentionUri: mention.uri,
      responded: false,
      factsExtracted: 0,
    };

    try {
      await this.ensureAuth();

      // ── Rate limit guard ──────────────────────────────────────────────
      const limited = await this.isRateLimited(mention.authorDid);
      if (limited) {
        console.log(`[BlueskyResponder] Rate-limited: skipping reply to ${mention.authorHandle}`);
        return { ...base, error: 'rate_limited' };
      }

      // ── Build context string ──────────────────────────────────────────
      let contextText = mention.text;

      if (mention.replyRef) {
        const parentText = await this.fetchParentText(mention.replyRef.parent.uri);
        if (parentText) {
          contextText = `[Thread context: "${parentText}"]\n\nMention: ${mention.text}`;
        }
      }

      // ── Route through AgentRouter (UCOL) ──────────────────────────────
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

      // ── Extract facts → push to knowledge graph ───────────────────────
      const contentType = detectContentType(mention.text);
      const facts = await extractFacts(contextText, contentType);
      const factsExtracted = facts.length;

      if (factsExtracted > 0) {
        console.log(
          `[BlueskyResponder] Extracted ${factsExtracted} facts from mention ` +
          `(${mention.uri})`
        );
      }

      // ── Generate response via Gemini Flash ────────────────────────────
      const responseText = await this.generateResponse(contextText);

      // ── Build reply ref ───────────────────────────────────────────────
      // If the mention is itself a reply, reply into the same thread;
      // otherwise start a new thread with the mention as root & parent.
      const replyRef = mention.replyRef
        ? {
            root: { uri: mention.replyRef.root.uri, cid: mention.replyRef.root.cid },
            parent: { uri: mention.uri, cid: mention.cid },
          }
        : {
            root: { uri: mention.uri, cid: mention.cid },
            parent: { uri: mention.uri, cid: mention.cid },
          };

      // ── Post reply to Bluesky ─────────────────────────────────────────
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

      // ── Log to Supabase ───────────────────────────────────────────────
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
