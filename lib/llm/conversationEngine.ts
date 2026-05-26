import { z } from "zod";
import { waitUntil } from "@vercel/functions";
import { budgetKillSwitch } from "@/lib/budget/redisKillSwitch";
import { tagMessagesForStorage, tagLLMMessage, extractWMRTMetadata } from "@/lib/world-model/trustTag";
import { classifyQuery } from '@/lib/ucol/agentRouter';
import { resolveProviderForMode } from '@/lib/ucol/routing/providerResolver';
import { createPreparedContextPlanFromMemoryPlan, prepareContextBundle, layoutPromptContext } from '@/lib/context/preparedContext';
import { ContextTokenManager } from '@/lib/context/ContextTokenManager';

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
import { HermesProvider } from "./providers/hermes";
import {
  captureMemory,
  extractTags,
  generateSummary,
  estimateTokenCount,
} from "@/lib/ragMemory";
// import { sanitizeHistory } from "@/lib/gemini"; // Moved to provider
import { addNode, addEdge, strengthenEdge } from "@/lib/memory/graphStore";
import { extractFactsFromConversation } from "@/lib/agents/factExtractor";
import { SecurityAgent } from "@/lib/security/securityAgent";
// ── World Model: Distribution Shift + Self-Benchmarking ──────────────────────
import { createDistributionShiftDetector } from '@/lib/world-model/distribution-shift';
import { createBenchmarkingPipeline } from '@/lib/world-model/benchmarking';
import { ModelStore } from '@/lib/world-model/ml/ModelStore';
import { supabase } from '@/lib/supabaseClient';
import type { AIOutputAudit } from '@/lib/world-model/types';
import { deltaEngine } from '@/lib/world-model/delta';
import { critiqueLLMOutput } from '@/lib/ucol/critics/OutputCritic';
import type { UcolMemoryPlan, UcolMemoryScope } from '@/lib/ucol/routing/types';

// ChatMessageSchema imported from types

export const ConversationRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(100),
  fileData: z.any().optional(), // updated to any to support the normalizedFileData object
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
  fileUri: z.string().max(1024).optional(),
  documentIds: z.array(z.string()).optional(),
  workspaceId: z.string().nullable().optional(),
  mode: z.enum(['fast', 'quality', 'agentic', 'reasoning']).optional(),
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

  /** Override model id (defaults to gemini-2.5-flash). */
  model?: string;

  /** Operating mode for the agent */
  mode?: AgentMode;

  /**
   * When true, skip web research and rely solely on stored memory/knowledge graph.
   * Recommended for internal agent calls (e.g. JKlaw) where graph facts should dominate.
   */
  skipWebResearch?: boolean;

  /** Optional UCOL-resolved memory plan to drive prepared-context assembly. */
  memoryPlan?: UcolMemoryPlan;

  /** Local workspace execution harness */
  ioHarness?: import('@/lib/harness/IOHarness').IOHarness;

  /** Slack UI update callback for agent loops */
  slackStreamCallback?: (step: import('@/lib/agents/core/types').TrajectoryStep) => void;
};

export type ConversationEngineResult = {
  stream: ReadableStream;
  thoughtSignaturePromise?: Promise<string | null>;
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

const FAST_MODEL = process.env.HERMES_MODEL_ID || "hermes3";
const AGENTIC_MODEL = "claude-sonnet-4-6"; // Claude drives the agentic ReAct loop

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
    conversationId?: string | null;
  },
  options: ConversationEngineOptions = {}
): Promise<ConversationEngineResult> {
  const { userId, clerkUser, request, conversationId } = args;
  const parsed = ConversationRequestSchema.parse(request);
  const agentMode = parsed.mode || options.mode || 'fast';

  // ---------------------------------------------------------
  // UCOL AGENTIC MODE — Claude + ReAct Loop
  // Tools: web_search, write_research_paper, write_creative_content
  // ---------------------------------------------------------
  if (agentMode === 'agentic') {
    const { runReActLoop } = await import('@/lib/agents/core/reactLoop');
    const { ToolRegistry } = await import('@/lib/agents/core/registry');
    const { dealSentinelTool } = await import('@/lib/agents/tools/dealSentinel');
    const { webSearchTool } = await import('@/lib/agents/tools/webSearch');
    const { researchWriterTool } = await import('@/lib/agents/tools/researchWriter');
    const { novelWriterTool } = await import('@/lib/agents/tools/novelWriter');
    const { searchCodebaseTool } = await import('@/lib/agents/tools/searchCodebase');
    const { readFileTool, writeFileTool, patchFileTool, runCommandTool } = await import('@/lib/agents/tools/harnessTools');

    // 1. Initialize Registry with all agentic tools
    const registry = new ToolRegistry();
    registry.register(dealSentinelTool);
    registry.register(webSearchTool);
    registry.register(researchWriterTool);
    registry.register(novelWriterTool);
    registry.register(searchCodebaseTool);
    if (options.ioHarness) {
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(patchFileTool);
      registry.register(runCommandTool);
    }

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
      enableTelemetry: true,
      ioHarness: options.ioHarness,
      onStep: options.slackStreamCallback
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
        model: `claude/${AGENTIC_MODEL}`,
        userQuery,
      }
    };
  }
  // ---------------------------------------------------------

  // ─── Budget Kill Switch: enforce per-user and global LLM spend caps ─────────
  // Non-fatal: if Redis is unavailable the check is skipped and the request
  // is allowed through. Enforcement is gated by ENABLE_LLM_BUDGET_ENFORCEMENT=true.
  const budgetCheck = await budgetKillSwitch.checkBudget(userId);
  if (!budgetCheck.allowed) {
    const limitMsg =
      budgetCheck.reason === "global_budget_exceeded"
        ? "The global AI budget has been reached. Service is temporarily paused. Please contact support."
        : `You've reached your AI spending limit ($${budgetKillSwitch.getLimits().perUserLimitUSD.toFixed(2)} USD). ` +
          `Please upgrade your plan or wait for your budget to reset.`;
    const textEncoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(textEncoder.encode(limitMsg));
        controller.close();
      },
    });
    return { stream, sources: [], debug: { model: "budget-kill-switch", userQuery: "" } };
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const { messages, fileData, mimeType, workspaceId, documentIds: rawDocumentIds } = parsed;

  // Filter out optimistic temp_ IDs that haven't been persisted to DB yet
  const documentIds = rawDocumentIds?.filter((id: string) => id && !id.startsWith('temp_'));

  // Use `let` so the confidence routing layer can upgrade the provider
  // for standard mode when context confidence is low.
  let providerResolution = resolveProviderForMode({ mode: agentMode, hasAttachments: Boolean(fileData && mimeType) });
  let { provider, modelId: actualModelId } = providerResolution.execution;

  const userQuery = messages[messages.length - 1]?.text || "";

  const heavyContextEnabled = process.env.ENABLE_HEAVY_CONTEXT !== 'false';
  const effectivelyDisabled = !heavyContextEnabled || options.disableExternalContext;

  const graphReadScope: UcolMemoryScope[] = agentMode === 'fast' ? [] : ['graph'];
  const fallbackMemoryPlan: UcolMemoryPlan = {
    readScopes: ['conversation', 'user', ...graphReadScope],
    retrievalMode: agentMode === 'reasoning' ? 'deep' : agentMode === 'quality' ? 'standard' : 'light',
    usePreparedContext: true,
    useGraphRecall: agentMode !== 'fast',
    useRecentTaskState: false,
  };

  const contextPreparationPlan = createPreparedContextPlanFromMemoryPlan(options.memoryPlan ?? fallbackMemoryPlan);

  const preparedContext = await prepareContextBundle({
    userId,
    clerkUser,
    userQuery,
    agentMode,
    workspaceId,
    documentIds,
    options: {
      disableExternalContext: effectivelyDisabled,
      skipWebResearch: process.env.ENABLE_WEB_RESEARCH !== 'true' || options.skipWebResearch,
      plan: contextPreparationPlan,
    },
  });

  const userContext = preparedContext.userContext;
  const allFacts = preparedContext.raw.allFacts;
  const intelligentFacts = preparedContext.raw.intelligentFacts;
  const researchResult = { results: preparedContext.raw.researchResults };
  const graphData = preparedContext.raw.graphData;
  const userProfileMemories = preparedContext.raw.userProfileMemories;
  const memorySources = preparedContext.raw.memorySources;

  // ---------------------------------------------------------
  // SPRINT 4: Security & Reasoning Integration
  // ---------------------------------------------------------

  // 1. Security Audit (Firewall)
  // Only run if not disabled and for standard/reasoning modes
  if (!effectivelyDisabled && (agentMode === 'fast' || agentMode === 'reasoning')) {
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

  let confidenceSignal = preparedContext.routing.confidenceSignal;
  let confidenceOverrideApplied = false;

  if (agentMode === 'fast' && confidenceSignal) {
    try {
      if (confidenceSignal.recommendedTier !== 'gemini-flash') {
        const upgradeMode = confidenceSignal.recommendedTier === 'claude-sonnet'
          ? 'quality'
          : 'reasoning';
        providerResolution = resolveProviderForMode({ mode: upgradeMode, hasAttachments: Boolean(fileData && mimeType) });
        provider = providerResolution.execution.provider;
        actualModelId = providerResolution.execution.modelId;
        confidenceOverrideApplied = true;

        console.log(
          `[ConversationEngine] Confidence override: ${FAST_MODEL} → ${actualModelId}` +
          ` (ctx_conf=${confidenceSignal.contextConfidence.toFixed(3)},` +
          ` tier=${confidenceSignal.recommendedTier},` +
          ` facts=${confidenceSignal.factCount})`
        );
      }
    } catch (e: any) {
      console.warn('[ConversationEngine] Confidence scoring failed (non-blocking):', e.message);
    }
  }

  const modelLimits = ContextTokenManager.getModelLimits(actualModelId);
  const GENERATION_HEADROOM = 16000;
  const TOOL_SCHEMA_ESTIMATE = 3000;
  const maxContextBudget = Math.max(0, modelLimits.totalMax - GENERATION_HEADROOM - TOOL_SCHEMA_ESTIMATE);

  const allocation = ContextTokenManager.assembleContext(
    getSystemInstruction(),
    preparedContext.sections,
    {
      modelId: actualModelId,
      userQuery,
      customBudget: maxContextBudget
    }
  );

  let enhancedSystemInstruction = getSystemInstruction() +
    "\n\n" + allocation.packedContext;

  if (allocation.omittedSections && allocation.omittedSections.length > 0) {
    const droppedCount = allocation.omittedSections.length;
    enhancedSystemInstruction += `\n\n[SYSTEM WARNING: ${droppedCount} context blocks were omitted due to length limits. Ask the user for clarification if you lack context.]`;
  }

  // Format history for provider
  const history: ChatMessage[] = [
    { role: "assistant", text: GREETING },
    ...messages.map(msg => ({
      role: msg.role === "bot" ? "assistant" : "user",
      text: msg.text
    } as ChatMessage))
  ];

  // ── Step 5: Tip-of-context thought signature injection ───────────────────────
  // Load the most recent bot message's stored thought signature and append it
  // ONLY to the last model turn. The Gemini API accepts exactly one active
  // scratchpad at the tip of the context window — injecting into older turns
  // causes a 400 Bad Request. This is a no-op for non-Gemini providers.
  if (conversationId && supabase) {
    try {
      const { data: lastBotMsg } = await supabase
        .from('messages')
        .select('metadata')
        .eq('conversation_id', parsed.conversationId)
        .eq('role', 'bot')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastSignature = lastBotMsg?.metadata?.last_thought_signature as string | null | undefined;

      if (lastSignature) {
        // Find the last assistant turn in the constructed history array
        let lastAssistantIdx = -1;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === 'assistant') { lastAssistantIdx = i; break; }
        }

        if (lastAssistantIdx >= 0) {
          // Encode the signature back into the text field using the XML wrapper
          // that gemini.ts's history serializer already knows how to parse.
          // This is safe: the stream processor strips it before display.
          const existingText = history[lastAssistantIdx].text || '';
          history[lastAssistantIdx] = {
            ...history[lastAssistantIdx],
            text: existingText + `\n<thought_signature>${lastSignature}</thought_signature>`,
          };
          console.info('[ConversationEngine] Injected thought signature onto last model turn for reasoning continuity');
        }
      }
    } catch (sigErr) {
      // Non-fatal — a missing signature means Gemini starts a fresh scratchpad, which is fine.
      console.warn('[ConversationEngine] Thought signature injection failed (non-blocking):', sigErr);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Attach explicit files to the last message if present
  if (fileData && mimeType) {
    const lastMsg = history[history.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.attachments = lastMsg.attachments || [];
      lastMsg.attachments.push({
        name: parsed.fileName || 'attached_file',
        mimeType: mimeType,
        base64Data: fileData
      });
    }
  }

  // Attach explicitly selected document images
  if (documentIds && documentIds.length > 0 && supabase) {
    try {
      const { data: docs } = await supabase
        .from('workspace_documents')
        .select('filename, mime_type, storage_uri')
        .in('id', documentIds);

      if (docs) {
        const mediaDocs = docs.filter((d: any) => d.mime_type.startsWith('image/') || d.mime_type.startsWith('video/') || d.mime_type.startsWith('audio/'));
        if (mediaDocs.length > 0) {
          const lastMsg = history[history.length - 1];
          if (lastMsg && lastMsg.role === 'user') {
            lastMsg.attachments = lastMsg.attachments || [];
            for (const mediaDoc of mediaDocs) {
              if (mediaDoc.storage_uri) {
                lastMsg.attachments.push({
                  name: mediaDoc.filename || 'media',
                  mimeType: mediaDoc.mime_type,
                  fileUri: mediaDoc.storage_uri
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[ConversationEngine] Failed to fetch image attachments', e);
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

  // T-040: For Hermes/fast mode, pass agentic flag so the model executes
  // rather than describing what it would do. Also forward any tools defined
  // for this mode so Hermes can make function calls when appropriate.
  const isHermesMode = agentMode === 'fast';
  let streamResult;
  try {
    streamResult = await provider.generateStream(history, enhancedSystemInstruction, {
      model: actualModelId,
      temperature: 0.9,
      maxTokens: 2048,
      ...(isHermesMode ? { agentic: true } : {}),
    });
  } catch (err: any) {
    if (err?.status === 429 || String(err).includes('429')) {
      console.warn(`[ConversationEngine] Model ${actualModelId} rate limited, falling back to fast mode`);
      const fallback = resolveProviderForMode({ mode: 'fast', hasAttachments: Boolean(fileData && mimeType) });
      actualModelId = fallback.execution.modelId;
      streamResult = await fallback.execution.provider.generateStream(history, enhancedSystemInstruction, {
        model: actualModelId,
        temperature: 0.9,
        maxTokens: 2048,
      });
    } else {
      throw err;
    }
  }

  const { stream: originalStream, thoughtSignaturePromise } = streamResult;

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
            const cleanedFullText = fullText.replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, '').trim();
            const tokensUsed = estimateTokenCount(userQuery + cleanedFullText);

            // ── Budget Kill Switch: record actual spend (fire-and-forget) ────
            // Uses estimated token counts since providers stream without usage metadata.
            // estimateTokenCount approximates total tokens; split 30/70 input/output.
            const estimatedInputTokens  = Math.round(tokensUsed * 0.30);
            const estimatedOutputTokens = Math.round(tokensUsed * 0.70);
            budgetKillSwitch
              .recordSpend(userId, estimatedInputTokens, estimatedOutputTokens, actualModelId)
              .catch((err) =>
                console.warn("[BudgetKillSwitch] recordSpend failed (non-blocking):", err)
              );
            // ─────────────────────────────────────────────────────────────────

            const tags = extractTags(userQuery);
            const summary = generateSummary([
              { role: 'user', content: userQuery },
              { role: 'assistant', content: cleanedFullText },
            ]);

            // ── RFC-001 WMRT: Tag all messages with trust tier before storage ──
            // Raw LLM output is always UNVERIFIED at write time.
            // Only DeltaEngine can promote to CONFIRMED/SUPPORTED after scoring.
            const rawMessages = messages.map((msg) => ({
              role: (msg.role === 'bot' ? 'assistant' : 'user') as 'user' | 'assistant' | 'system',
              content: msg.text,
            }));
            const taggedHistory = tagMessagesForStorage(rawMessages, actualModelId);
            // Append the current turn — assistant response tagged as UNVERIFIED
            taggedHistory.push(
              { role: 'user', content: userQuery, trust_tier: 'UNVERIFIED', tagged_at: new Date().toISOString() },
              tagLLMMessage(cleanedFullText, actualModelId),
            );
            const wmrtMeta = extractWMRTMetadata(taggedHistory, actualModelId);
            // ──────────────────────────────────────────────────────────────────

            await captureMemory(
              userId,
              'conversation',
              userQuery.substring(0, 50) || 'Conversation',
              summary,
              taggedHistory,
              tokensUsed,
              tags,
              {
                userName: userContext.fullName,
                userEmail: userContext.email,
                responseLength: cleanedFullText.length,
                interactionStyle: userContext.interactionStyle,
                agentMode,
                ...wmrtMeta,
              }
            );

            // LLM-powered fact extraction + graph updates — runs unless ENABLE_HEAVY_CONTEXT=false.
            // These populate the knowledge graph that the DeltaEngine queries.
            if (process.env.ENABLE_HEAVY_CONTEXT !== 'false') {
              try {
                const extractedFacts = await extractFactsFromConversation(userQuery, cleanedFullText);
                console.log(`[ConversationEngine] Extracted ${extractedFacts.length} structured facts`);
              } catch (factErr) {
                console.warn('[ConversationEngine] Fact extraction failed (non-blocking):', factErr);
              }
            }

            // Knowledge graph update — extract ALL tags and link co-occurring concepts
            if (process.env.ENABLE_HEAVY_CONTEXT !== 'false' && tags.length > 0) {
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
            // ── World Model: Delta Engine + Benchmark (Phase 3 — fully wired) ──
            // Run delta audit and feed real claim verdicts into the benchmark.
            // Both run in the same waitUntil block — still fully non-blocking.
            if (process.env.ENABLE_DELTA_AUDIT !== 'false') {
              try {
                // 1. Score claims — returns real ClaimAuditResult[] from the graph
                const deltaResults = await deltaEngine.scoreClaims(
                  fullText,
                  userId,
                  actualModelId,
                );

                // 2. Build a real AIOutputAudit from delta results
                //    Bridge: delta/types ClaimAuditResult → world-model/types ClaimAuditResult
                const overallDeltaScore = deltaEngine.computeDeltaScore(deltaResults);
                const hallucinationCount = deltaResults.filter(
                  r => r.verdict === 'CONTRADICTED' || r.verdict === 'MISATTRIBUTED'
                ).length;
                const hallucinationRate = deltaResults.length > 0
                  ? hallucinationCount / deltaResults.length
                  : 0;

                const realAudit: AIOutputAudit = {
                  id: crypto.randomUUID(),
                  created_at: new Date(),
                  session_id: userId,
                  model: actualModelId,
                  // Map delta internal ClaimAuditResult → outer ClaimAuditResult shape
                  claims: deltaResults.map(r => ({
                    claim_text: r.claim.text,
                    verdict: r.verdict,
                    confidence: r.claim.confidence,
                    delta_score: r.deltaScore,
                    domain: r.claim.domain,
                    supporting_edge_id: r.graphEdgeId,
                    contradicting_node_id: r.contradictsNodeId,
                    explanation: r.explanation,
                  })),
                  overall_delta_score: overallDeltaScore,
                  hallucination_rate: hallucinationRate,
                  domain: wmDomain,
                };

                // 3. Feed real audit into benchmark (replaces stub)
                await wmBenchmark.scoreResponse({
                  sessionId: userId,
                  model: actualModelId,
                  domain: wmDomain,
                  audit: realAudit,
                  latencyMs: Date.now() - streamStartMs,
                });

                // 4. Trust tier promotion: upgrade taggedHistory messages that were
                //    confirmed/supported by the delta engine.
                //    CONFIRMED claims → promote last assistant turn to SUPPORTED.
                //    (Full CONFIRMED requires ≥3 corroborations per RFC-001.)
                const hasConfirmedClaims = deltaResults.some(r => r.verdict === 'CONFIRMED');
                const hasSupportedClaims = deltaResults.some(r => r.verdict === 'SUPPORTED');
                if (hasConfirmedClaims || hasSupportedClaims) {
                  const promotionTier = hasConfirmedClaims ? 'SUPPORTED' : 'SUPPORTED';
                  // Re-tag the assistant message with promoted tier + avg delta score
                  const lastAssistantIdx = taggedHistory.map(m => m.role).lastIndexOf('assistant');
                  if (lastAssistantIdx >= 0) {
                    const { promoteMessageTrust } = await import('@/lib/world-model/trustTag');
                    taggedHistory[lastAssistantIdx] = promoteMessageTrust(
                      taggedHistory[lastAssistantIdx],
                      promotionTier,
                      overallDeltaScore,
                    );
                  }
                }

                if (overallDeltaScore > 0.6) {
                  console.warn(
                    `[DeltaEngine] High delta score for ${actualModelId}: ${overallDeltaScore.toFixed(2)} ` +
                    `(${hallucinationCount}/${deltaResults.length} hallucinations)`
                  );
                }

              } catch (err) {
                // Delta Engine must never crash the response pipeline
                console.error('[DeltaEngine/Benchmark] wired audit failed (non-blocking):', err);
              }
            }

            // ── OutputCritic: async quality gate (fire-and-forget) ───────────────
            // Never awaited — critic must never add latency to the hot path.
            // block verdicts → console.error; warn verdicts → console.warn.
            critiqueLLMOutput(cleanedFullText, { userId, taskType: agentMode }).then(verdict => {
              if (verdict.severity === 'block') {
                console.error('[OutputCritic] BLOCK verdict:', verdict.overallReason);
                // TODO: persist to ucol_critic_verdicts Supabase table (next PR)
              }
              if (!verdict.passed) {
                console.warn('[OutputCritic] Warnings:', verdict.checks.filter(c => !c.passed));
              }
            }).catch(() => { /* critic never crashes the hot path */ });
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
              cleanedFullText.substring(0, 400),
              factsForRouting,
            );

            // hermes-local: self-hosted Docker Model Runner on Vast.ai — inject knowledge context
            if (decision.targetNode === 'hermes-local') {
              try {
                const { buildOllamaKnowledgeContext } = await import('@/lib/ucol/ollamaKnowledgeContext');
                const knowledgeCtx = await buildOllamaKnowledgeContext(userId, userQuery);
                if (knowledgeCtx.factsUsed > 0 || knowledgeCtx.graphNodesUsed > 0) {
                  console.log(
                    `[UCOL/Ollama] Knowledge context injected — facts=${knowledgeCtx.factsUsed} nodes=${knowledgeCtx.graphNodesUsed}`
                  );
                }
                // HermesProvider picks up Vast.ai Docker Model Runner automatically via LAMBDA_OLLAMA_URL env
                // Knowledge context is surfaced in the next turn via the existing context pipeline
              } catch (e) {
                console.warn('[UCOL/Ollama] Knowledge context injection failed (non-blocking):', e);
              }
            }

            if (decision.targetNode === 'jklaw') {
              const { getAgentRouter } = await import('@/lib/ucol/agentRouter');
              const router = getAgentRouter();
              await router.dispatchToJKlaw(
                {
                  query: userQuery,
                  context: cleanedFullText.substring(0, 400),
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
    thoughtSignaturePromise,
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
        graphEntitiesCount: preparedContext.metrics.graphRelatedCount,
        researchResultsCount: preparedContext.metrics.researchResultsCount,
      },
    },
  };
}
