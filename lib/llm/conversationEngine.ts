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
import { DeepSeekProvider } from "./providers/deepseek";
import { NIM_MODEL_KIMI_K3 } from "./providers/nvidiaNim";
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
import { logEvent } from "@/lib/telemetry";
import { encodeMediaEvent, hasMediaEnvelope, MediaEnvelope, encodeApprovalEvent } from "@/lib/media/envelope";
import { emitInteractionAudit } from "@/lib/telemetry/emit";
import { deriveContextRole } from "@/lib/telemetry/governance";
import { emitRiskEvent } from "@/lib/telemetry/riskAdapter";
// ── World Model: Distribution Shift + Self-Benchmarking ──────────────────────
import { createDistributionShiftDetector } from '@/lib/world-model/distribution-shift';
import { createBenchmarkingPipeline } from '@/lib/world-model/benchmarking';
import { ModelStore } from '@/lib/world-model/ml/ModelStore';
import { supabase, supabaseAdmin } from '@/lib/supabaseClient';
import type { AIOutputAudit } from '@/lib/world-model/types';
import { deltaEngine } from '@/lib/world-model/delta';
import { critiqueLLMOutput } from '@/lib/ucol/critics/OutputCritic';
import type { UcolMemoryPlan, UcolMemoryScope } from '@/lib/ucol/routing/types';
import { getEffectiveProviderKeys } from '@/lib/userProviderKeys';
import { createTrace } from '@/lib/observability/langfuse';
import { loadSudoPrompt } from '@/lib/ucol/sudoLoader';
import { createQuarantinePromotionManager } from '@/lib/execution/quarantinePromotionManager';
import { sandboxManager } from '@/lib/execution/sandboxManager';

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

  /** Optional SudoLang prompt names to inject into the system instruction for this request. */
  sudoPromptNames?: string[];

  /** Optional synthesized persona/system instruction to prepend to the base system prompt. */
  systemInstruction?: string;

  /** Optional persona session for the Chameleon Consultant layer. */
  personaSession?: import("@/lib/consultant/personaSession").PersonaSession;
};

export type ConversationEngineResult = {
  stream: ReadableStream;
  thoughtSignaturePromise?: Promise<string | null>;
  sources?: Source[];
  modelId?: string;
  requestedModelId?: string;
  actualModelId?: string;
  systemProvider?: string;
  debug?: {
    promptVersion?: string | null;
    model?: string;
    userQuery?: string;
    personaInjected?: boolean;
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
    pdfExtractionError?: string;
    error?: string;
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

CITATION RULES:
- When you retrieve sources from the Data Refinery (query_workspace_sources), each result contains content and optional lineage.
- The content field is the factual text. Cite it using [1], [2], etc.
- The lineage field contains optional transition metadata (SUPERSEDES, CAUSES edges).
- Use lineage ONLY to explain WHY state changed (e.g., "X changed to Y in January"). Never cite lineage as a source.
- If a source has lineage showing SUPERSEDES: mention the transition in your prose, then cite the current content.

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
import { getUserProviderApiKeys } from '@/lib/userProviderKeys';

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
  const providerKeys = await getUserProviderApiKeys(userId);
  const nativeProviderKeys = await (await import('@/lib/native/providerSecretHydrator')).hydrateNativeProviderKeys(providerKeys);

  // ---------------------------------------------------------
  // UCOL AGENTIC MODE — Kimi K3 (NVIDIA NIM) + ReAct Loop
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
    const { generateMusicTool } = await import('@/lib/agents/tools/generateMusic');
    const { generateImageTool } = await import('@/lib/agents/tools/generateImage');
    const { generateVideoTool } = await import('@/lib/agents/tools/generateVideo');
    const { readFileTool, writeFileTool, patchFileTool } = await import('@/lib/agents/tools/harnessTools');
    const { executeCommandTool } = await import('@/lib/agents/tools/executionTools');
    const { discoverDocumentsTool, extractTextTool, summarizeRepoTool, semanticSearchTool, workspaceSourcesSearchTool } = await import('@/lib/agents/tools/intelligenceTools');

    // 1. Initialize Registry with all agentic tools
    const registry = new ToolRegistry();
    registry.register(dealSentinelTool);
    registry.register(webSearchTool);
    registry.register(researchWriterTool);
    registry.register(novelWriterTool);
    registry.register(searchCodebaseTool);
    registry.register(generateMusicTool);
    registry.register(generateImageTool);
    registry.register(generateVideoTool);

    if (request.mode === 'agentic') {
      // Phase 1: Local Mutable Capabilities
      registry.register(readFileTool);
      registry.register(writeFileTool);
      registry.register(patchFileTool);
      registry.register(executeCommandTool);

      // Phase 3 & 4: Intelligence Capabilities
      registry.register(discoverDocumentsTool);
      registry.register(extractTextTool);
      registry.register(summarizeRepoTool);
      registry.register(semanticSearchTool);
      registry.register(workspaceSourcesSearchTool);
    }

    // 2. Construct Prompt (Multimodal support)
    const userQuery = parsed.messages[parsed.messages.length - 1]?.text || "";
    // Strip file metadata tags appended by the client (e.g., "[Attached File: ...]")
    // to prevent the router from being distracted by file metadata
    const sanitizedQuery = userQuery.replace(/\n*\[Attached File:[^\]]*\]\s*/g, '').trim();
    let promptInput: string | any[] = userQuery;

    if (parsed.fileData && parsed.fileData.mimeType && parsed.fileData.base64Data) {
      promptInput = [
        { text: userQuery },
        {
          inlineData: {
            mimeType: parsed.fileData.mimeType,
            data: parsed.fileData.base64Data
          }
        }
      ];
    } else if (parsed.fileUri) {
      const uriMimeType = parsed.mimeType || parsed.fileData?.mimeType;
      if (uriMimeType) {
        promptInput = [
          { text: userQuery },
          {
            fileData: {
              mimeType: uriMimeType,
              fileUri: parsed.fileUri
            }
          }
        ];
      }
    }

    // 3. Execute ReAct Loop (Non-streaming for now, wrapped in stream)
    // Note: ReAct loop takes time. We will await it and then stream the result all at once.
    // Future optimization: Stream individual thought steps.
    if (!parsed.workspaceId) {
      throw new Error("LatticeSecurityError: workspaceId is strictly required for agentic execution.");
    }

    // --- EPISODIC MEMORY RECALL PHASE ---
    if (options.ioHarness) {
        try {
            console.log("[EpisodicMemory] Recalling historical context...");
            const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const authToken = process.env.LATTICE_AUTH_TOKEN || '';
            
            const embedResp = await fetch(`${apiBaseUrl}/api/harness/embeddings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
              },
              body: JSON.stringify({ texts: [userQuery] })
            });

            if (embedResp.ok) {
              const embedData = await embedResp.json();
              const embedding = embedData.embeddings?.[0];
              if (embedding) {
                const searchRes = await options.ioHarness.searchEpisodicEvents(parsed.workspaceId, embedding, 3);
                if (searchRes.ok && searchRes.output) {
                  const episodes = JSON.parse(searchRes.output);
                  if (episodes && episodes.length > 0) {
                    const memoryStr = episodes.map((e: any) => `- [${e.event.created_at}] ${e.event.content}`).join('\n');
                    const memoryContext = `\n\n<EpisodicMemory>\nHere are some relevant architectural decisions and lessons learned from past sessions in this workspace:\n${memoryStr}\n</EpisodicMemory>\n\n`;
                    
                    if (typeof promptInput === 'string') {
                        promptInput = memoryContext + promptInput;
                    } else if (Array.isArray(promptInput) && promptInput.length > 0) {
                        promptInput[0].text = memoryContext + promptInput[0].text;
                    }
                  }
                }
              }
            }
        } catch(e) {
            console.error("[EpisodicMemory] Recall failed:", e);
        }
    }
    // ------------------------------------

    // --- P1 ORG CONTEXT RESOLUTION ---
    let orgContext = undefined;
    try {
      const workspaceId = parsed.workspaceId;
      if (workspaceId && supabaseAdmin) {
        const { data: ws } = await supabaseAdmin
          .from('workspaces')
          .select('org_id')
          .eq('id', workspaceId)
          .maybeSingle();

        const orgId = ws?.org_id;
        if (orgId) {
          const { data: member } = await supabaseAdmin
            .from('organization_members')
            .select('role')
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .maybeSingle();

          const roleToPermissions: Record<string, string[]> = {
            owner: ['org:read','org:update','org:delete','member:invite','member:update','member:remove','sensitive_tools:use','external_actions:use','audit:read'],
            admin: ['org:read','member:invite','member:update','member:remove','sensitive_tools:use','audit:read'],
            developer: ['org:read','external_actions:use'],
            auditor: ['org:read','audit:read'],
          };

          const permissions = member?.role ? roleToPermissions[member.role] ?? [] : [];
          if (permissions.length > 0) {
            orgContext = { orgId, userId, permissions };
          }
        }
      }
    } catch (e) {
      console.error('[OrgContext] Resolution failed, using zero-trust fallback:', e);
    }
    if (!orgContext) {
      orgContext = { orgId: '', userId, permissions: [] };
    }
    // ------------------------------------

    // Agentic execution uses the NVIDIA NIM Kimi K3 model (see providerResolver.ts).
    const onReasoning = (text: string) => {
      console.log(`[AgenticReasoning] ${String(text).slice(0, 400)}`);
    };

    const textEncoder = new TextEncoder();

    const workspaceRoot = process.cwd();
    const sessionId = 'agentic-' + Date.now();
    const promotionManager = createQuarantinePromotionManager(
      workspaceRoot,
      workspaceRoot,
      (event, payload) => {
        void emitRiskEvent({
          eventType: event as any,
          traceId: sessionId,
          workspaceId: parsed.workspaceId || undefined,
          userId,
          metadata: payload,
        });
      },
    );
    const { sandboxManager } = await import('@/lib/execution/sandboxManager');
    sandboxManager.setPromotionManager(promotionManager);
    // Initialize JEPA trace emitter for execution trace capture
    const { getDefaultTraceEmitter } = await import('@/lib/jepa');
    const traceEmitter = await getDefaultTraceEmitter();
    sandboxManager.setTraceEmitter(traceEmitter);

    // We execute the ReAct loop and stream UI events back
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const onStreamEvent = (msg: string) => {
          controller.enqueue(textEncoder.encode(`${msg}\n\n`));
        };

        try {
          // Hydrate the agent's role for the mutative-tool gate: admins/owners
          // (with `sensitive_tools:use`) are 'admin'; everyone else is 'user'.
          const isAdmin = Boolean(
            orgContext?.permissions && orgContext.permissions.includes('sensitive_tools:use')
          );

          const agentContext = {
            userId,
            sessionId,
            workspaceId: parsed.workspaceId,
            history: [],
            enableTelemetry: true,
            rootSpan: undefined,
            orgContext,
            userRole: isAdmin ? ('admin' as const) : ('user' as const),
            ioHarness: options.ioHarness,
            onStep: (step: any) => {
              const text = String(step.thought ?? '');
              onStreamEvent(text);
              onReasoning(text);
              if (options.slackStreamCallback) options.slackStreamCallback(step);
            },
            onToolApproval: (approval: { approvalId: string; toolName: string; params: any }) => {
              controller.enqueue(
                textEncoder.encode(`${encodeApprovalEvent(approval)}\n`)
              );
            },
            promotionManager,
            promotionRejectionCount: 0,
          };

          const reactResult = await runReActLoop(promptInput, agentContext, registry, NIM_MODEL_KIMI_K3);
          const isSuccess = reactResult.status === 'success';

          // Emit structured media events for any media-tool result in the trajectory,
          // so the client can render inline players/grids instead of raw tool text.
          const mediaEnvelopes: MediaEnvelope[] = [];
          for (const step of reactResult.trajectory ?? []) {
            const data = step.observation?.data;
            if (hasMediaEnvelope(data) && data._media) {
              mediaEnvelopes.push(data._media);
            }
          }
          for (const envelope of mediaEnvelopes) {
            controller.enqueue(textEncoder.encode(`${encodeMediaEvent(envelope)}\n`));
          }

          const donePayload = {
            status: reactResult.status,
            answer: reactResult.answer,
            trajectory: reactResult.trajectory,
          };
          controller.enqueue(textEncoder.encode(JSON.stringify(donePayload)));
          controller.close();
        } catch (err: any) {
          const isProviderDown = String(err).includes('1033') || String(err).includes('Tunnel') || String(err).includes('530') || (err?.status && err.status >= 500);
          if (isProviderDown) {
            controller.enqueue(textEncoder.encode('The AI provider is temporarily unavailable. Please try again in a few minutes.'));
          } else {
            controller.enqueue(textEncoder.encode(`Agent execution failed: ${err.message}`));
          }
          controller.close();
        }
      }
    });

    return {
      stream,
      sources: [],
      debug: {
        model: `nvidia-nim/${NIM_MODEL_KIMI_K3}`,
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

  // Handle PDF extraction — text is either pre-extracted by the API route
  // or we extract it here if it wasn't done upstream
  const effectiveMimeType: string | undefined = mimeType || fileData?.mimeType || fileData?.type;
  let pdfText: string | null = fileData?.extractedText || null;
  
  // Fallback: extract PDF text if not pre-extracted (e.g., direct engine calls)
  if (!pdfText && fileData && effectiveMimeType === 'application/pdf' && fileData.base64Data) {
    try {
      const { extractPdfText } = await import('@/lib/fileProcessing/pdfExtractor');
      pdfText = await extractPdfText(fileData);
    } catch (err) {
      console.error('[ConversationEngine] PDF extraction failed:', err);
    }
  }

  // Use `let` so the confidence routing layer can upgrade the provider
  // for standard mode when context confidence is low.
  let providerResolution = resolveProviderForMode({ mode: agentMode, hasAttachments: Boolean(fileData && mimeType), providerKeys: nativeProviderKeys, personaSession: options.personaSession });
  let { provider, modelId: actualModelId } = providerResolution.execution;
  // Sovereign telemetry: the initially-requested model (before any confidence
  // override or 429 fallback) and the serving provider id.
  const requestedModelId = actualModelId;
  const systemProvider = providerResolution.providerId;

  const userQuery = messages[messages.length - 1]?.text || "";
  // Strip file metadata tags appended by the client (e.g., "[Attached File: ...]")
  // to prevent the router from being distracted by file metadata
  const sanitizedQuery = userQuery.replace(/\n*\[Attached File:[^\]]*\]\s*/g, '').trim();

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
        providerResolution = resolveProviderForMode({ mode: upgradeMode, hasAttachments: Boolean(fileData && mimeType), providerKeys: nativeProviderKeys, personaSession: options.personaSession });
        provider = providerResolution.execution.provider;
        actualModelId = providerResolution.execution.modelId;
        confidenceOverrideApplied = true;

        console.log(
          `[ConversationEngine] Confidence override → ${actualModelId}` +
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

  let baseSystemInstruction = getSystemInstruction();

  // Append extracted PDF text to the system instruction if available
  // Empty text indicates a scanned/image-only PDF (no text layer)
  if (pdfText && pdfText.trim().length > 0) {
    baseSystemInstruction += `\n\n[Uploaded Document Content]\n${pdfText}\n[End of Document]`;
  } else if (effectiveMimeType === 'application/pdf' && pdfText !== null) {
    // PDF was extracted but returned empty text — likely a scanned document
    const textEncoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(textEncoder.encode(
          "We couldn't detect any readable text in this document. It may be a scanned image or a PDF without a text layer. Please try uploading a text-based PDF or copy and paste the content directly."
        ));
        controller.close();
      },
    });
    return {
      stream,
      sources: [],
      debug: {
        model: "pdf-extraction-empty",
        userQuery,
        pdfExtractionError: "scanned_pdf_no_text_layer",
      },
    };
  }

  // RAG retrieval for follow-up turns (no fileData but documentIds present)
  // On Turn 2+, fileData is undefined but the client may pass documentIds
  // of previously uploaded files. We retrieve semantically relevant chunks
  // instead of injecting the full document text.
  if (!pdfText && documentIds && documentIds.length > 0 && workspaceId) {
    try {
      const { retrieveRelevantChunks } = await import('@/lib/fileProcessing/chunkEmbedder');
      const ragContext = await retrieveRelevantChunks(workspaceId, userQuery, documentIds);
      if (ragContext) {
        baseSystemInstruction += `\n\n${ragContext}`;
      }
    } catch (err) {
      console.error('[ConversationEngine] RAG retrieval failed:', err);
    }
  }

  // ── PERSONA DOMAIN GATE ─────────────────────────────────────────────────────
  // Evaluate the domain gate BEFORE spending tokens on inference.
  // Hard-blocked queries return a zero-token templated refusal.
  // Borderline queries pass through with an outOfDomain warning injected into the persona directive.
  if (options.personaSession) {
    const { evaluateDomainGate } = await import("@/lib/consultant/domainGate");
    const gateResult = evaluateDomainGate(options.personaSession, userQuery);

    if (gateResult.action === "hard_block") {
      // Zero-token refusal — intercept before any LLM calls
      const textEncoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(textEncoder.encode(gateResult.refusalMessage || "This query falls outside the expertise of the active consultant."));
          controller.close();
        },
      });
      return {
        stream,
        sources: [],
        debug: {
          model: "domain-gate-hard-block",
          userQuery,
          personaInjected: true,
          confidenceSignal: { contextConfidence: gateResult.confidence, recommendedTier: "blocked", overrideApplied: false },
        },
      };
    }

    if (gateResult.action === "borderline") {
      // Inject outOfDomain warning into base system instruction
      baseSystemInstruction += `\n\n[SYSTEM NOTICE: The following query is potentially outside the persona's defined domain. Address it strictly through the lens of your persona, or generate a polite, in-character refusal if it is clearly out of scope. Domain confidence: ${gateResult.confidence.toFixed(2)}]`;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Inject persona directive into the system prompt if a persona session is active.
  // This moves persona from a vulnerable user-role message to a structural constraint.
  let personaInjected = false;
  if (options.personaSession) {
    const { buildPersonaDirective } = await import("@/lib/consultant/PersonaContextBuilder");
    const personaBlock = buildPersonaDirective(options.personaSession);
    baseSystemInstruction += "\n\n" + personaBlock;
    personaInjected = true;
  }

  let enhancedSystemInstruction = baseSystemInstruction +
    "\n\n" + allocation.packedContext;

  if (options.sudoPromptNames?.length) {
    const loaded: string[] = [];
    for (const name of options.sudoPromptNames) {
      try {
        const content = await loadSudoPrompt(name);
        if (content) loaded.push(content);
      } catch {}
    }
    if (loaded.length) {
      enhancedSystemInstruction += "\n\n" + loaded.join("\n\n");
    }
  }

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

  // Persona directive is now injected into the system prompt above (see personaSession option).
  // The old user-role injection was removed because it made persona vulnerable to prompt injection (CWE-1427).

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
        .eq('conversation_id', conversationId)
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
  // Skip PDFs that have already been extracted as text — attaching raw binary
  // causes garbled encoded text in the prompt
  if (fileData && effectiveMimeType && effectiveMimeType !== 'application/pdf') {
    const lastMsg = history[history.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.attachments = lastMsg.attachments || [];
      lastMsg.attachments.push({
        name: parsed.fileName || 'attached_file',
        mimeType: mimeType || effectiveMimeType || 'application/octet-stream',
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

  let streamResult;
  const trace = createTrace({
    traceName: 'conversation',
    userId,
    sessionId: conversationId || undefined,
    tags: [agentMode, actualModelId, wmDomain],
    metadata: { hasAttachments: Boolean(fileData && mimeType), contextFactsCount: intelligentFacts.length },
  });

  const updateTrace = (patch: Record<string, unknown>) => {
    try { trace?.update(patch); } catch {}
  };
  try {
    const { executeWithFallback } = await import('@/lib/llm/routing/fallbackRouter');
    const fallbackResult = await executeWithFallback({
      primary: {
        providerId: providerResolution.providerId,
        modelId: actualModelId,
        provider,
      },
      messages: history,
      systemInstruction: enhancedSystemInstruction,
      options: { temperature: 0.9, maxTokens: 2048 },
      enableMiniMax: true,
    });

    streamResult = fallbackResult;
    // Persist the actual serving model so downstream side-effects, telemetry,
    // and the client-facing headers reflect the real (possibly fallback) model.
    if (fallbackResult.switched) {
      actualModelId = fallbackResult.actualModelId;
      console.warn(
        `[ConversationEngine] Fallback engaged: ${fallbackResult.previousModelId} → ${fallbackResult.actualModelId} (${fallbackResult.systemProvider})`
      );
    }
    try {
      updateTrace({
        metadata: {
          completionStatus: 'streaming',
          model: actualModelId,
          ...(fallbackResult.switched
            ? { fallbackFrom: fallbackResult.previousModelId, switched: true }
            : {}),
        },
      });
    } catch {}
  } catch (err: any) {
    try {
      updateTrace({ metadata: { error: err?.message || String(err) } });
    } catch {}

    // Fallback chain exhausted — surface a graceful degradation message stream
    // rather than a hard 500, so the client's streaming reader still consumes a body.
    console.error(`[ConversationEngine] All providers exhausted: ${err?.message || String(err)}`);
    const textEncoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          textEncoder.encode('The AI provider is temporarily unavailable. Please try again in a few minutes.')
        );
        controller.close();
      },
    });
    return {
      stream,
      sources: [],
      debug: {
        model: actualModelId,
        userQuery,
        error: 'all_providers_exhausted',
      },
    };
  }

  // ── Sovereign telemetry: emit UDIF 2.0 interaction-audit (non-blocking) ──
    // Captures requested vs actual model routing + serving provider. The client
    // IndexedDB persistence + enterprise Supabase flush are wired in later phases.
    try {
      const { calculateInteractionCost } = await import("@/lib/subscription/credits");
      const creditCost = calculateInteractionCost({
        hasAttachments: Boolean(fileData && mimeType),
        mode: agentMode as any,
      });
      emitInteractionAudit({
        requestedModelId,
        actualModelId,
        systemProvider,
        agentName: agentMode,
        agentRole: "chat",
        creditCost,
        contextRole: deriveContextRole({ workspaceId, agentMode }),
        macroWorkflowId: conversationId ?? undefined,
      });
    } catch (telemetryErr) {
      // Telemetry must never break the main flow.
      if (process.env.NODE_ENV !== "production") {
        console.debug("[telemetry] conversationEngine emit failed (non-blocking):", telemetryErr);
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
      // Clean fullText once before any side effects
      const cleanedFullText = fullText ? fullText.replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, '').trim() : '';

      try { updateTrace({ metadata: { completionStatus: 'completed', responseLength: cleanedFullText.length } }); } catch {}

      // Side effects after stream completes
      if (!options.disableSideEffects && fullText) {
        waitUntil((async () => {
          try {
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

            // ── OutputCritic + PersonaConsistencyCritic: parallel async quality gate ──
            // Never awaited — critic must never add latency to the hot path.
            // Both critics run in parallel to minimize TTFB impact.
            if (options.personaSession) {
              // Run persona consistency critic alongside existing critic
              Promise.all([
                critiqueLLMOutput(cleanedFullText, { userId, taskType: agentMode }),
                (async () => {
                  const { evaluatePersonaConsistency } = await import("@/lib/consultant/PersonaConsistencyCritic");
                  return evaluatePersonaConsistency(options.personaSession!, userQuery, cleanedFullText);
                })(),
              ]).then(([outputVerdict, personaVerdict]) => {
                // Handle existing OutputCritic verdict
                if (outputVerdict.severity === 'block') {
                  console.error('[OutputCritic] BLOCK verdict:', outputVerdict.overallReason);
                }
                if (!outputVerdict.passed) {
                  console.warn('[OutputCritic] Warnings:', outputVerdict.checks.filter(c => !c.passed));
                }

                // Handle PersonaConsistencyCritic verdict — tiered action
                // Note: Response is already streaming to client. We emit
                // telemetry events that the client subscribes to for UI warnings.
                if (personaVerdict.driftLevel === 'SEVERE_VIOLATION') {
                  console.error('[PersonaCritic] SEVERE VIOLATION:', personaVerdict.reason);
                  // Emit telemetry for client-side warning banner
                  // Client receives this via SSE and overlays a system warning
                  logEvent({
                    eventType: 'persona_critic_verdict',
                    userId,
                    metadata: {
                      driftLevel: 'SEVERE_VIOLATION',
                      reason: personaVerdict.reason,
                      conversationId,
                      personaId: options.personaSession?.personaId,
                      action: 'warn_user',
                    },
                  });
                } else if (personaVerdict.driftLevel === 'DRIFT_DETECTED') {
                  console.warn('[PersonaCritic] Drift detected:', personaVerdict.reason);
                  // Emit telemetry for client-side soft warning
                  logEvent({
                    eventType: 'persona_critic_verdict',
                    userId,
                    metadata: {
                      driftLevel: 'DRIFT_DETECTED',
                      reason: personaVerdict.reason,
                      conversationId,
                      personaId: options.personaSession?.personaId,
                      action: 'flag_response',
                    },
                  });
                }
              }).catch(() => { /* critic never crashes the hot path */ });
            } else {
              // No persona session — run existing critic only
              critiqueLLMOutput(cleanedFullText, { userId, taskType: agentMode }).then(verdict => {
                if (verdict.severity === 'block') {
                  console.error('[OutputCritic] BLOCK verdict:', verdict.overallReason);
                }
                if (!verdict.passed) {
                  console.warn('[OutputCritic] Warnings:', verdict.checks.filter(c => !c.passed));
                }
              }).catch(() => { /* critic never crashes the hot path */ });
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
            // Note: Only pass userQuery as context, NOT the full text
            // The router only needs the user's intent, not the document content
            const decision = await classifyQuery(
              sanitizedQuery,
              sanitizedQuery, // Pass sanitized query only — NOT cleanedFullText (prevents context distraction)
              factsForRouting,
            );

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

  try { updateTrace({ metadata: { completionStatus: 'streaming', model: actualModelId } }); } catch {}

  return {
    stream,
    thoughtSignaturePromise,
    modelId: actualModelId,
    requestedModelId,
    actualModelId,
    systemProvider,
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
