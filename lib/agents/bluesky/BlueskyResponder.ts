/**
 * lib/agents/bluesky/BlueskyResponder.ts
 *
 * Processes a BlueskyMention through the full Tech Genie pipeline:
 *   1. Build context (mention text + thread parent if available)
 *   2. Route through AgentRouter (UCOL) to classify query
 *   3. Extract facts via KnowledgeExtractor → push to graph
 *   4. Generate a response via Gemini Flash (Tech Genie persona)
 *   5. Post the reply to Bluesky with proper reply ref
 *   6. Log the interaction to Supabase (with rate-limit check)
 */

import { BskyAgent, RichText } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { classifyQuery } from '@/lib/ucol/agentRouter';
import { loadSudoPrompt } from '@/lib/ucol/sudoLoader';
import { extractFacts, detectContentType } from '@/lib/agents/knowledgeExtractor';
import type { BlueskyMention, EngagementResult } from './types';

// ─── Hermes (Nous Research) Config ───────────────────────────────────────────

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
  private async generateResponse(context: string): Promise<string> {
    const systemPrompt = await getTechGenieSystemPrompt();

    // ── 1. Try Hermes (Nous Research) ──────────────────────────────────────
    if (NOUS_API_KEY) {
      try {
        const raw = await this.generateWithHermes(context, systemPrompt);
        return this.enforceCharLimit(raw);
      } catch (err) {
        console.warn('[BlueskyResponder] Hermes failed, falling back to Gemini:', err);
      }
    } else {
      console.warn('[BlueskyResponder] NOUSE_API_KEY not set — skipping Hermes, using Gemini');
    }

    // ── 2. Fallback: Gemini Flash ───────────────────────────────────────────
    return this.generateWithGemini(context, systemPrompt);
  }

  private async generateWithHermes(context: string, systemPrompt: string): Promise<string> {
    const response = await fetch(`${NOUS_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${NOUS_API_KEY}`,
      },
      body: JSON.stringify({
        model: NOUS_MODEL,
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
      throw new Error(`Nous API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Hermes returned empty content');
    }
    return text.trim();
  }

  private async generateWithGemini(context: string, systemPrompt: string): Promise<string> {
    const effectiveApiKey =
      process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
    const gemini = new GoogleGenerativeAI(effectiveApiKey);
    const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });

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
