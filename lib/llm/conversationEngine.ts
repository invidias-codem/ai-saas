import { z } from "zod";
import { waitUntil } from "@vercel/functions";

import { ExtractedFact } from '../intelligentMemory';
import { SearchResult } from '../integrations/anyCrawl';
import { GraphNode } from '../memory/graphStore';
import { PromotableMemory } from '../memoryPromotion';
import { Source } from '../ragMemory';
import { env } from "@/lib/env";
import { LLMProvider, ChatMessage, CompletionOptions, AgentMode, ChatMessageSchema } from "./types";
import { GeminiProvider } from "./providers/gemini";
import { ClaudeProvider } from "./providers/claude";
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
import { rankMemoriesIntelligently } from "@/lib/intelligentMemory";
// import { sanitizeHistory } from "@/lib/gemini"; // Moved to provider
import { findRelatedEntities, formatGraphContext, addNode } from "@/lib/memory/graphStore";
import { performResearch, formatSearchResults } from "@/lib/agents/researcher";
import { getUserProfile, formatUserProfileForPrompt } from "@/lib/memoryPromotion";

// ChatMessageSchema imported from types

export const ConversationRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  fileData: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  fileUri: z.string().optional(),
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
};

export type ConversationEngineResult = {
  stream: ReadableStream;
  sources?: Source[];
  debug?: {
    promptVersion?: string | null;
    model?: string;
    userQuery?: string;
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
  } else {
    // Default / Fast
    return {
      provider: new GeminiProvider(),
      modelId: DEFAULT_MODEL
    };
  }
}

function getSystemInstruction() {
  return `You are 'Genie', a helpful AI assistant. 
Current Date: ${new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}.

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

  const { provider, modelId: actualModelId } = getProviderForMode(agentMode);

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

  // Check if heavy context gathering is enabled (to avoid rate limits on free tier)
  const enableHeavyContext = process.env.ENABLE_HEAVY_CONTEXT === 'true';

  if (!options.disableExternalContext && enableHeavyContext) {
    // Full context gathering (requires higher API quotas)
    [allFacts, researchResult, graphData, userProfileMemories] = await Promise.all([
      getHighConfidenceFacts(userId),
      performResearch(userQuery, userContextPrompt),
      findRelatedEntities(userId, userQuery),
      getUserProfile(userId),
    ]);
  } else if (!options.disableExternalContext) {
    // Lightweight mode: only fetch facts (no embeddings needed for this)
    allFacts = await getHighConfidenceFacts(userId);
    console.log('[ConversationEngine] Running in lightweight mode (ENABLE_HEAVY_CONTEXT=false)');
  }

  const searchContext = options.disableExternalContext ? "" : formatSearchResults(researchResult.results);
  const graphContext = options.disableExternalContext ? "" : formatGraphContext(graphData);

  // Create mock vector similarities based on keyword matching (same as route)
  const similarities = new Map<string, number>();
  const queryWords = userQuery.toLowerCase().split(/\s+/);
  for (const fact of allFacts) {
    const factWords = (fact.content ?? "").toLowerCase().split(/\s+/);
    const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
    const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
    similarities.set(fact.id || "", Math.min(1, similarity * 1.5));
  }

  const intelligentFacts = rankMemoriesIntelligently(allFacts, similarities, userQuery);
  const factContext = options.disableExternalContext ? "" : formatFactsForPrompt(intelligentFacts);

  // Only call RAG if heavy context is enabled
  const ragResult = (!options.disableExternalContext && enableHeavyContext)
    ? await getRAGMemoryContext(userId, userQuery, "conversation")
    : { contextString: "", sources: [] };

  const memoryContext = ragResult.contextString;
  const memorySources = ragResult.sources;

  const userProfileContext = options.disableExternalContext ? "" : formatUserProfileForPrompt(userProfileMemories);

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

            // Knowledge graph update (best-effort)
            if (tags.length > 0) {
              await addNode(userId, tags[0], 'concept', `Automatically extracted from conversation`);
            }
          } catch (e) {
            console.error('Side effect processing failed', e);
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
      context: {
        factsCount: intelligentFacts.length,
        graphEntitiesCount: Array.isArray(graphData) ? graphData.length : undefined,
        researchResultsCount: Array.isArray(researchResult?.results) ? researchResult.results.length : undefined,
      },
    },
  };
}
