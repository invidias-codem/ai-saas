import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { classifyQuery } from '@/lib/ucol/agentRouter';
import { scoreContextForRouting } from '@/lib/memory/confidenceScoring';

import { ExtractedFact } from '../intelligentMemory';
import { SearchResult } from '../integrations/anyCrawl';
import { GraphNode } from '../memory/graphStore';
import { PromotableMemory } from '../memoryPromotion';
import { Source } from '../ragMemory';
import { env } from "@/lib/env";
import { LLMProvider, ChatMessage, CompletionOptions, AgentMode, ChatMessageSchema } from "./types";
import { GeminiProvider } from "./providers/gemini";
import { ClaudeProvider } from "./providers/claude";
import { DeepSeekProvider } from "./providers/deepseek";
import {
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt,
  getRAGMemoryContext,
  captureMemory,
  extractTags,
  generateSummary,
  estimateTokenCount,
} from "@/lib/ragMemory";
import { rankMemoriesIntelligently, synthesizeContextWithReasoning } from "@/lib/intelligentMemory";
// import { sanitizeHistory } from "@/lib/gemini"; // Moved to provider
import { findRelatedEntities, formatGraphContext, addNode, addEdge, strengthenEdge } from "@/lib/memory/graphStore";
import { extractFactsFromConversation } from "@/lib/agents/factExtractor";
import { generateEmbedding } from "@/lib/memory/embedding";
import { performResearch, formatSearchResults } from "@/lib/agents/researcher";
import { getUserProfile, formatUserProfileForPrompt } from "@/lib/memoryPromotion";
import { SecurityAgent } from "@/lib/security/securityAgent";
// ── World Model: Distribution Shift + Self-Benchmarking ──────────────────────
import { createDistributionShiftDetector } from '@/lib/world-model/distribution-shift';
import { createBenchmarkingPipeline } from '@/lib/world-model/benchmarking';
import { ModelStore } from '@/lib/world-model/ml/ModelStore';
import { supabase } from '@/lib/supabaseClient';
import type { AIOutputAudit } from '@/lib/world-model/types';
import { deltaEngine } from '@/lib/world-model/delta';
import { critiqueLLMOutput } from '@/lib/ucol/critics/OutputCritic';

// ChatMessageSchema imported from types

export const ConversationRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(100),
  fileData: z.string().max(30 * 1024 * 1024, "File too large (max 20MB)").optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  fileUri: z.string().max(1024).optional(),
  mode: z.enum(['standard', 'agentic-preview']).optional(),
});

export type ConversationRequest = z.infer<typeof ConversationRequestSchema>;



export type ConversationEngineOptions = {
  /**
   * When true, the engine will avoid writing side-effects (memory capture, graph updates).
   * Useful for eval runs and local testing.
   */
  disableSideEffects?: boolean;

  /**
   * When true, the engine will skip external context calls (research/graph/memory).
   * Useful for CI runs without network access.
   */
  disableExternalContext?: boolean;

  /** Override model id (defaults to gemini-2.0-flash). */
  model?: string;

  /** Operating mode for the agent */
  mode?: AgentMode;

  /**
   * When true, skip web research and rely solely on stored memory/knowledge graph.
   * Recommended for internal agent calls (e.g. JKlaw) where graph facts should dominate.
   */
  skipWebResearch?: boolean;
};

export type ConversationEngineResult = {
  stream: ReadableStream;
  sources?: Source[];
  debug?: {
    promptVersion?: string | null;
    model?: string;
    userQuery?: string;
    confidenceSignal?: {
      contextConfidence: number;
      recommendedTier: string;
      overrideApplied: boolean;
    };
    context?: {
      factsCount?: number;
      graphEntitiesCount?: number;
      researchResultsCount?: number;
    };
  };
};

function getGoogleApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_API_KEY is required to run the conversation engine. Ensure dotenv is loaded before importing this module, or pass GOOGLE_API_KEY via environment variables."
    );
  }
  return key;
}

const DEFAULT_MODEL = "gemini-2.0-flash";
const AGENTIC_MODEL = "gemini-1.5-pro-preview-0409";
const QUALITY_MODEL = "claude-sonnet-4-5-20250929";
const REASONING_MODEL = "deepseek-r1";

function getProviderForMode(mode: AgentMode): { provider: LLMProvider, modelId: string } {
  if (mode === 'quality') {
    return {
      provider: new ClaudeProvider(),
      modelId: QUALITY_MODEL
    };
  } else if (mode === 'agentic-preview') {
    return {
      provider: new GeminiProvider(),
      modelId: AGENTIC_MODEL
    };
  } else if (mode === 'reasoning') {
    return {
      provider: new DeepSeekProvider(),
      modelId: REASONING_MODEL
    };
  } else {
    // Default / Fast
    return {
      provider: new GeminiProvider(),
      modelId: DEFAULT_MODEL
    };
  }
}

function getSystemInstruction() {
  return `You are 'Genie', a highly capable AI assistant equipped with dynamic tool integrations.
Current Date: ${new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.

CAPABILITIES:
- You DO have real-time internet access. When you receive "Web Search Results" in your context, it means the system has searched the live internet on your behalf.
- You DO have long-term memory. When you see "User Profile" or "Relevant Previous Work", it means the system has retrieved past context.
- Never deny these capabilities. If the context contains the answer, speak authoritatively as if you fetched it yourself.

Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization. When you see 'User's Relevant Previous Work' or 'About This User' sections below, use that context to personalize your responses and maintain continuity with their previous interactions and preferences.`;
}

const GREETING = "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.";

/**
 * Core conversation generation engine.
 *
 * This is extracted from app/api/conversation/route.ts so it can be reused by:
 * - API route (prod)
 * - Eval harness (Mode B replay)
 */
export async function generateConversationReply(
  args: {
    userId: string;
    clerkUser: any;
    request: ConversationRequest;
  },
  options: ConversationEngineOptions = {}
): Promise<ConversationEngineResult> {
  const { userId, clerkUser, request } = args;
  const parsed = ConversationRequestSchema.parse(request);
  const agentMode = parsed.mode || options.mode || 'standard';

  // ---------------------------------------------------------
  // SPRINT 3: Agentic Integration
  // ---------------------------------------------------------
  if (agentMode === 'agentic-preview') {
    const { runReActLoop } = await import('@/lib/agents/core/reactLoop');
    const { ToolRegistry } = await import('@/lib/agents/core/registry');
    const { dealSentinelTool } = await import('@/lib/agents/tools/dealSentinel');

    // 1. Initialize Registry
    const registry = new ToolRegistry();
    registry.register(dealSentinelTool);

    // 2. Construct Prompt (Multimodal support)
    const userQuery = parsed.messages[parsed.messages.length - 1]?.text || "";
    let promptInput: string | any[] = userQuery;

    if (parsed.fileData && parsed.mimeType) {
      promptInput = [
        { text: userQuery },
        {
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.fileData // Base64
          }
        }
      ];
    } else if (parsed.fileUri && parsed.mimeType) {
      promptInput = [
        { text: userQuery },
        {
          fileData: {
            mimeType: parsed.mimeType,
            fileUri: parsed.fileUri
          }
        }
      ];
    }

    // 3. Execute ReAct Loop (Non-streaming for now, wrapped in stream)
    // Note: ReAct loop takes time. We will await it and then stream the result all at once.
    // Future optimization: Stream individual thought steps.
    const agentResult = await runReActLoop(promptInput, {
      userId,
      sessionId: 'session-' + Date.now(), // specific session tracking if needed
      history: [], // We could map `parsed.messages` to history if desired
      enableTelemetry: true
    }, registry);

    // 4. Wrap result in ReadableStream to match expected output
    const textEncoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(textEncoder.encode(agentResult.answer));
        controller.close();
      }
    });

    return {
      stream,
      sources: [], // We could populate this from agentResult.trajectory if we parsed it
      debug: {
        model: 'gemini-2.0-flash-agentic',
        userQuery
      }
    };
  }
  // ---------------------------------------------------------

  // Use `let` so the confidence routing layer can upgrade the provider
  // for standard mode when context confidence is low.
  let { provider, modelId: actualModelId } = getProviderForMode(agentMode);

  const { messages, fileData, mimeType } = parsed;

  // Gather user context
  const userContext = await gatherUserContext(userId, clerkUser);
  const userContextPrompt = formatUserContextForPrompt(userContext);

  const userQuery = messages[messages.length - 1]?.text || "";

  // Tiered context gathering
  let allFacts: ExtractedFact[] = [];
  let researchResult: { results: SearchResult[] } = { results: [] };
  let graphData: { centralNode: GraphNode | null; relatedNodes: any[] } = { centralNode: null, relatedNodes: [] }; // relatedNodes uses complex structure, keeping any for now/TODO
  let userProfileMemories: PromotableMemory[] | null = null;

  // Cost guard: ENABLE_HEAVY_CONTEXT=false disables the expensive per-conversation
  // memory/embedding pipeline (fact ranking, per-fact embeddings, graph updates,
  // fact extraction). Flip this in Vercel env vars without a redeploy.
  // Default: false (safe) — set to "true" to re-enable the full memory system.
  const heavyContextEnabled = process.env.ENABLE_HEAVY_CONTEXT === 'true';
  const effectivelyDisabled = !heavyContextEnabled || options.disableExternalContext;

  // Full context gathering — all sources in parallel with graceful degradation.
  // Individual failures are caught so one slow/broken source doesn't block the rest.
  if (!effectivelyDisabled) {
    const results = await Promise.allSettled([
      getHighConfidenceFacts(userId),
      // Web research is expensive (calls AnyCrawl → LLM extraction per page).
      // Gate it: only run if ENABLE_WEB_RESEARCH=true AND user hasn't disabled it.
      // Default: off. Enable per-user or per-session when needed.
      (process.env.ENABLE_WEB_RESEARCH !== 'true' || options.skipWebResearch)
        ? Promise.resolve({ results: [] })
        : performResearch(userQuery, userContextPrompt),
      findRelatedEntities(userId, userQuery),
      getUserProfile(userId),
    ]);

    allFacts = results[0].status === 'fulfilled' ? results[0].value : [];
    researchResult = results[1].status === 'fulfilled' ? results[1].value : { results: [] };
    graphData = results[2].status === 'fulfilled' ? results[2].value : { centralNode: null, relatedNodes: [] };
    userProfileMemories = results[3].status === 'fulfilled' ? results[3].value : null;

    // Log any failures for debugging (non-blocking)
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const labels = ['facts', 'research', 'graph', 'userProfile'];
        console.warn(`[ConversationEngine] Context source "${labels[i]}" failed:`, r.reason?.message || r.reason);
      }
    });
  }

  const searchContext = effectivelyDisabled ? "" : formatSearchResults(researchResult.results);
  const graphContext = effectivelyDisabled ? "" : formatGraphContext(graphData);


  // ---------------------------------------------------------
  // SPRINT 4: Security & Reasoning Integration
  // ---------------------------------------------------------

  // 1. Security Audit (Firewall)
  // Only run if not disabled and for standard/reasoning modes
  if (!effectivelyDisabled && (agentMode === 'standard' || agentMode === 'reasoning')) {
    const securityAgent = new SecurityAgent();
    const audit = await securityAgent.auditPrompt(userQuery, userId);

    if (!audit.safe) {
      console.warn(`[Security] Blocked unsafe prompt from user ${userId}: ${audit.reason}`);

      // Return a canned rejection response stream
      const textEncoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const message = `I cannot fulfill this request. \n\n**Security Alert**: ${audit.reason}`;
          controller.enqueue(textEncoder.encode(message));
          controller.close();
        }
      });

      return {
        stream,
        sources: [],
        debug: {
          model: 'security-agent',
          userQuery,
          context: { factsCount: 0 }
        }
      };
    }
  }

  // Semantic similarity using embeddings — falls back to keyword matching if embedding fails
  const similarities = new Map<string, number>();
  let queryEmbedding: number[] | null = null;

  if (!effectivelyDisabled && allFacts.length > 0) {
    try {
      queryEmbedding = await generateEmbedding(userQuery);
    } catch (e: any) {
      console.warn('[ConversationEngine] Query embedding failed, falling back to keyword matching:', e.message);
    }
  }

  if (queryEmbedding && queryEmbedding.some(v => v !== 0)) {
    // Semantic ranking: compute cosine similarity against fact embeddings
    for (const fact of allFacts) {
      try {
        const factEmbedding = await generateEmbedding(fact.content ?? "");
        if (factEmbedding.some(v => v !== 0)) {
          // Cosine similarity
          let dotProduct = 0, normA = 0, normB = 0;
          for (let i = 0; i < queryEmbedding.length; i++) {
            dotProduct += queryEmbedding[i] * (factEmbedding[i] || 0);
            normA += queryEmbedding[i] * queryEmbedding[i];
            normB += (factEmbedding[i] || 0) * (factEmbedding[i] || 0);
          }
          const cosineSim = normA && normB ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
          similarities.set(fact.id || "", Math.max(0, cosineSim));
        }
      } catch {
        // Individual fact embedding failed — skip it
        similarities.set(fact.id || "", 0);
      }
    }
  } else {
    // Fallback: keyword overlap (original behavior)
    const queryWords = userQuery.toLowerCase().split(/\s+/);
    for (const fact of allFacts) {
      const factWords = (fact.content ?? "").toLowerCase().split(/\s+/);
      const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
      const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
      similarities.set(fact.id || "", Math.min(1, similarity * 1.5));
    }
  }

  // 2. Context Synthesis
  let factContext = "";
  let intelligentFacts = rankMemoriesIntelligently(allFacts, similarities, userQuery);

  if (agentMode === 'reasoning' && !effectivelyDisabled) {
    // Use DeepSeek to synthesize context
    factContext = await synthesizeContextWithReasoning(intelligentFacts.slice(0, 15), userQuery);
    // Prepend header as synthesizeContextWithReasoning returns raw summary
    if (factContext) {
      factContext = `\n## Synthesized Context (DeepSeek-R1)\n${factContext}\n`;
    }
  } else {
    // Standard ranking
    factContext = effectivelyDisabled ? "" : formatFactsForPrompt(intelligentFacts);
  }

  // ─── UCOL Confidence-Aware Provider Override ────────────────────────────────
  // Only applies to 'standard' mode — explicit mode selections (quality, reasoning)
  // represent the user's intent and are never overridden.
  //
  // Logic: score the top-5 retrieved facts. Low confidence → novel context →
  // route to a more capable model. High confidence → known pattern → stay fast.
  //
  //   > 0.85  → Gemini Flash  (default, no change)
  //   0.5–0.85 → DeepSeek R1  (moderate confidence — balanced reasoning)
  //   < 0.5   → Claude Sonnet (low confidence — novel query, max capability)
  let confidenceSignal: ReturnType<typeof scoreContextForRouting> | null = null;
  let confidenceOverrideApplied = false;

  if (agentMode === 'standard' && !effectivelyDisabled && intelligentFacts.length > 0) {
    try {
      confidenceSignal = scoreContextForRouting(intelligentFacts.slice(0, 5), 'minimum');

      if (confidenceSignal.recommendedTier !== 'gemini-flash') {
        const upgradeMode = confidenceSignal.recommendedTier === 'claude-sonnet'
          ? 'quality'
          : 'reasoning';
        const upgraded = getProviderForMode(upgradeMode);
        provider = upgraded.provider;
        actualModelId = upgraded.modelId;
        confidenceOverrideApplied = true;

        console.log(
          `[ConversationEngine] Confidence override: ${DEFAULT_MODEL} → ${actualModelId}` +
          ` (ctx_conf=${confidenceSignal.contextConfidence.toFixed(3)},` +
          ` tier=${confidenceSignal.recommendedTier},` +
          ` facts=${confidenceSignal.factCount})`
        );
      }
    } catch (e: any) {
      // Non-blocking — confidence scoring failure falls back to default provider
      console.warn('[ConversationEngine] Confidence scoring failed (non-blocking):', e.message);
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  // RAG memory context — always attempt, graceful fallback on failure
  let ragResult: { contextString: string; sources: Source[] } = { contextString: "", sources: [] };
  if (!effectivelyDisabled) {
    try {
      ragResult = await getRAGMemoryContext(userId, userQuery, "conversation");
    } catch (e: any) {
      console.warn('[ConversationEngine] RAG context failed:', e.message || e);
    }
  }

  const memoryContext = ragResult.contextString;
  const memorySources = ragResult.sources;

  const userProfileContext = effectivelyDisabled ? "" : formatUserProfileForPrompt(userProfileMemories);

  const enhancedSystemInstruction = getSystemInstruction() +
    "\n\n" + userContextPrompt +
    userProfileContext +
    factContext +
    graphContext +
    searchContext +
    memoryContext;

  // Format history for provider
  const history: ChatMessage[] = [
    { role: "assistant", text: GREETING },
    ...messages.map(msg => ({
      role: msg.role === "bot" ? "assistant" : "user",
      text: msg.text
    } as ChatMessage))
  ];

  // Attach file to the last message if present
  if (fileData && mimeType) {
    const lastMsg = history[history.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.attachments = [{
        name: parsed.fileName || 'attached_file',
        mimeType: mimeType,
        base64Data: fileData
      }];
    }
  }

  // ── World Model: instantiate detectors (lightweight, no I/O) ─────────────────
  // Created here so both the logQuery() call below and the flush() side-effect
  // share the same instances without re-allocating on every chunk.
  const wmDetector  = createDistributionShiftDetector(supabase);
  const wmModelStore = new ModelStore();
  const { benchmark: wmBenchmark } = createBenchmarkingPipeline(supabase, wmModelStore);

  // Classify this query's domain once — used by both logQuery and scoreResponse.
  const wmDomain = (() => {
    try { return wmDetector.classifyDomain(userQuery); }
    catch { return 'general' as const; }
  })();

  // Track stream start time for latency scoring in flush().
  const streamStartMs = Date.now();

  // ── logQuery(): fire-and-forget — never blocks the user response ─────────────
  void (async () => {
    try {
      await wmDetector.logQuery({
        session_id: userId,
        domain: wmDomain,
        keywords: wmDetector.extractKeywords(userQuery),
        timestamp: new Date(),
        model_used: actualModelId,
      });
    } catch (e) {
      console.warn('[WorldModel] logQuery failed (non-blocking):', e);
    }
  })();
  // ─────────────────────────────────────────────────────────────────────────────

  const streamResult = await provider.generateStream(history, enhancedSystemInstruction, {
    model: actualModelId,
    temperature: 0.9,
    maxTokens: 2048
  });

  const { stream: originalStream } = streamResult;

  // Wrap stream to capture full text for side effects
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  let fullText = '';

  // Snapshot facts at call time so the closure captures the ranked list
  const factsForRouting = intelligentFacts.slice(0, 5);

  const transformedStream = new TransformStream({
    transform(chunk, controller) {
      const text = textDecoder.decode(chunk, { stream: true });
      fullText += text;
      controller.enqueue(chunk);
    },
    flush() {
      // Side effects after stream completes
      if (!options.disableSideEffects && fullText) {
        waitUntil((async () => {
          try {
            const tokensUsed = estimateTokenCount(userQuery + fullText);
            const tags = extractTags(userQuery);
            const summary = generateSummary([
              { role: 'user', content: userQuery },
              { role: 'assistant', content: fullText },
            ]);

            const formattedMessages = messages.map((msg) => ({
              role: (msg.role === 'bot' ? 'assistant' : 'user') as 'user' | 'assistant' | 'system',
              content: msg.text,
            }));

            await captureMemory(
              userId,
              'conversation',
              userQuery.substring(0, 50) || 'Conversation',
              summary,
              formattedMessages,
              tokensUsed,
              tags,
              {
                userName: userContext.fullName,
                userEmail: userContext.email,
                responseLength: fullText.length,
                interactionStyle: userContext.interactionStyle,
                agentMode,
              }
            );

            // LLM-powered fact extraction + graph updates are gated by ENABLE_HEAVY_CONTEXT.
            // When false, only lightweight captureMemory runs (no extra LLM calls).
            if (process.env.ENABLE_HEAVY_CONTEXT === 'true') {
              try {
                const extractedFacts = await extractFactsFromConversation(userQuery, fullText);
                console.log(`[ConversationEngine] Extracted ${extractedFacts.length} structured facts`);
              } catch (factErr) {
                console.warn('[ConversationEngine] Fact extraction failed (non-blocking):', factErr);
              }
            }

            // Knowledge graph update — extract ALL tags and link co-occurring concepts
            if (process.env.ENABLE_HEAVY_CONTEXT === 'true' && tags.length > 0) {
              const nodeIds: (string | null)[] = await Promise.all(
                tags.slice(0, 10).map(tag =>
                  addNode(userId, tag, 'concept', `Extracted from conversation: "${userQuery.substring(0, 80)}"`)
                )
              );

              // Strengthen edges between co-occurring concepts (weight increases with repetition)
              const validNodes = nodeIds.filter((id): id is string => id !== null);
              if (validNodes.length > 1) {
                const edgePromises: Promise<string | null>[] = [];
                for (let i = 0; i < validNodes.length; i++) {
                  for (let j = i + 1; j < validNodes.length; j++) {
                    edgePromises.push(
                      strengthenEdge(userId, validNodes[i], validNodes[j], 'co-occurred')
                    );
                  }
                }
                await Promise.allSettled(edgePromises);
              }
            }
            // ── World Model: Delta Engine (Phase 3) ──────────────────────────
            // Fire-and-forget: audit AI output against world model (never blocks response)
            if (process.env.ENABLE_DELTA_AUDIT !== 'false') {
              void deltaEngine.scoreClaims(
                fullText,        // the assembled response string
                userId,          // sessionId (using userId as session scope for now)
                actualModelId,   // the model that generated this response
              ).catch((err) => console.error('[DeltaEngine] audit failed:', err));
            }

            // ── OutputCritic: async quality gate (fire-and-forget) ───────────────
            // Never awaited — critic must never add latency to the hot path.
            // block verdicts → console.error; warn verdicts → console.warn.
            critiqueLLMOutput(fullText, { userId, taskType: agentMode }).then(verdict => {
              if (verdict.severity === 'block') {
                // TODO: persist to ucol_critic_verdicts Supabase table (next PR)
                console.error('[OutputCritic] BLOCK verdict:', verdict.overallReason);
              }
              if (!verdict.passed) {
                console.warn('[OutputCritic] Warnings:', verdict.checks.filter(c => !c.passed));
              }
            }).catch(() => { /* critic never crashes the hot path */ });
            // ────────────────────────────────────────────────────────────────────

            // ── World Model: score this response via ModelSelfBenchmark ────────
            // Records latency, claim quality, and graph utilization for the
            // feedback loop. Stub audit is used until the Delta Engine is wired.
            // TODO: replace stubAudit with real Delta Engine claim verdicts once
            //       DeltaEngine.auditResponse() is integrated here.
            try {
              const stubAudit: AIOutputAudit = {
                id: crypto.randomUUID(),
                created_at: new Date(),
                session_id: userId,
                model: actualModelId,
                claims: [],
                overall_delta_score: 0,    // placeholder until Delta Engine wired
                hallucination_rate: 0,     // placeholder until Delta Engine wired
                domain: wmDomain,
              };
              await wmBenchmark.scoreResponse({
                sessionId: userId,
                model: actualModelId,
                domain: wmDomain,
                audit: stubAudit,
                latencyMs: Date.now() - streamStartMs,
              });
            } catch (e) {
              console.warn('[WorldModel] scoreResponse failed (non-blocking):', e);
            }
            // ────────────────────────────────────────────────────────────────────

          } catch (e) {
            console.error('Side effect processing failed', e);
          }
        })());
      }

      // ── UCOL Agent Router: confidence-aware fire-and-forget dispatch ──────────
      // Passes the ranked memory facts so the router can use confidence scoring
      // to make a smarter dispatch decision. Never blocks the user response.
      if (!options.disableSideEffects && fullText && process.env.JKLAW_API_KEY) {
        waitUntil((async () => {
          try {
            // Pass factsForRouting — enables the two-axis (task + confidence) routing
            const decision = await classifyQuery(
              userQuery,
              fullText.substring(0, 400),
              factsForRouting,
            );

            if (decision.targetNode === 'jklaw') {
              const { getAgentRouter } = await import('@/lib/ucol/agentRouter');
              const router = getAgentRouter();
              await router.dispatchToJKlaw(
                {
                  query: userQuery,
                  context: fullText.substring(0, 400),
                  userId, // tenant scope — required
                  goalContext: {
                    // Surface the "why" behind this task to JKlaw (T-007)
                    sessionIntent: messages.at(-2)?.text?.substring(0, 150),
                    recentTopics: extractTags(userQuery).slice(0, 5),
                    userTier: 'free', // Tier inference from T-004 budgetGuard; wire here when exposed on userContext
                  },
                },
                decision,
                false // fire-and-forget
              );
              console.log(
                `[UCOL] Dispatched "${userQuery.substring(0, 60)}" to JKlaw` +
                ` (type=${decision.taskType}` +
                `${decision.memorySignal ? `, ctx_conf=${decision.memorySignal.contextConfidence.toFixed(2)}` : ''})`
              );
            }
          } catch (e) {
            // Non-blocking — never surface routing errors to users
            console.warn('[UCOL] Agent router dispatch failed (non-blocking):', e);
          }
        })());
      }
    }
  });

  const stream = originalStream.pipeThrough(transformedStream);

  return {
    stream,
    sources: [
      ...intelligentFacts.map(f => ({ id: f.id || `fact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, title: (f.content || "").substring(0, 50) + "...", type: 'fact', similarity: 1 })),
      ...(memorySources || [])
    ],
    debug: {
      model: actualModelId,
      userQuery,
      // Surface confidence signal in debug output for observability
      ...(confidenceSignal ? {
        confidenceSignal: {
          contextConfidence: confidenceSignal.contextConfidence,
          recommendedTier: confidenceSignal.recommendedTier,
          overrideApplied: confidenceOverrideApplied,
        }
      } : {}),
      context: {
        factsCount: intelligentFacts.length,
        graphEntitiesCount: Array.isArray(graphData) ? graphData.length : undefined,
        researchResultsCount: Array.isArray(researchResult?.results) ? researchResult.results.length : undefined,
      },
    },
  };
}
