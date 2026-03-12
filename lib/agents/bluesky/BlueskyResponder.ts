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

import fs from 'fs';
import path from 'path';
import { BskyAgent, RichText } from '@atproto/api';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { classifyQuery } from '@/lib/ucol/agentRouter';
import { extractFacts, detectContentType } from '@/lib/agents/knowledgeExtractor';
import type { BlueskyMention, EngagementResult } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESPONSE_MAX_CHARS = 290; // Bluesky post limit with a small buffer
const CTA_SUFFIX = ' — gen1e.xyz';

// Load the SudoLang agent definition from the companion .sudo.md file.
// SudoLang's constraint + interface system replaces verbose natural language prompts
// with typed, continuously-respected rules — ~30% fewer tokens, more reliable output.
function loadSudoPrompt(): string {
  const promptPath = path.join(__dirname, 'prompts', 'tech-genie-bluesky.sudo.md');
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    // Fallback to inline prompt if file is unavailable (e.g., edge runtime)
    return `TechGenieBlueskyAgent {
  identity: "Tech Genie — AI that remembers, connects, and builds with you"
  constraints {
    response length <= ${RESPONSE_MAX_CHARS} characters including CTA
    always append "${CTA_SUFFIX}"
    never use hashtags | never hallucinate | never engage with spam
  }
  response format: <useful answer> ${CTA_SUFFIX}
}`;
  }
}

const TECH_GENIE_SYSTEM_PROMPT = loadSudoPrompt();

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
  private gemini: GoogleGenerativeAI;
  private authenticated = false;

  constructor() {
    const handle = process.env.BLUESKY_HANDLE;
    const appPassword = process.env.BLUESKY_APP_PASSWORD;
    const googleApiKey = process.env.GOOGLE_API_KEY;

    if (!handle || !appPassword) {
      throw new Error(
        '[BlueskyResponder] Missing env vars: BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD'
      );
    }
    if (!googleApiKey) {
      throw new Error('[BlueskyResponder] Missing env var: GOOGLE_API_KEY');
    }

    this.agent = new BskyAgent({ service: 'https://bsky.social' });
    this.supabase = getSupabaseClient();
    this.gemini = new GoogleGenerativeAI(googleApiKey);
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

  private async generateResponse(context: string): Promise<string> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: context }] }],
      systemInstruction: { role: 'user', parts: [{ text: TECH_GENIE_SYSTEM_PROMPT }] },
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      },
    });

    const raw = result.response.text().trim();

    // Enforce character limit — truncate gracefully before the CTA if needed
    if (raw.length <= RESPONSE_MAX_CHARS) return raw;

    const truncated = raw.substring(0, RESPONSE_MAX_CHARS - CTA_SUFFIX.length - 3) + '...' + CTA_SUFFIX;
    return truncated;
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
