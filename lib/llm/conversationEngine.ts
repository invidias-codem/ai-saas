import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { z } from "zod";

import { env } from "@/lib/env";
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
import { sanitizeHistory } from "@/lib/gemini";
import { findRelatedEntities, formatGraphContext, addNode } from "@/lib/memory/graphStore";
import { performResearch, formatSearchResults } from "@/lib/agents/researcher";
import { getUserProfile, formatUserProfileForPrompt } from "@/lib/memoryPromotion";

export const ChatMessageSchema = z.object({
  role: z.string(),
  text: z.string(),
});

export const ConversationRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1),
  fileData: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
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
};

export type ConversationEngineResult = {
  text: string;
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

function getGenAI() {
  return new GoogleGenerativeAI(getGoogleApiKey());
}

const DEFAULT_MODEL = "gemini-2.0-flash";

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

function getSystemInstruction() {
  return {
    role: "user",
    parts: [
      {
        text: `You are 'Genie', a helpful AI assistant. 
Current Date: ${new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}.

Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization. When you see 'User's Relevant Previous Work' or 'About This User' sections below, use that context to personalize your responses and maintain continuity with their previous interactions and preferences.`,
      },
    ],
  };
}

const GREETING = {
  role: "model",
  parts: [
    {
      text: "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.",
    },
  ],
};

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

  const modelId = options.model ?? DEFAULT_MODEL;
  const model = getGenAI().getGenerativeModel({
    model: modelId,
    safetySettings,
  });

  const { messages, fileData, mimeType } = parsed;

  // Gather user context
  const userContext = await gatherUserContext(userId, clerkUser);
  const userContextPrompt = formatUserContextForPrompt(userContext);

  const userQuery = messages[messages.length - 1]?.text || "";

  // Tiered context gathering
  let allFacts: any[] = [];
  let researchResult: any = { results: [] };
  let graphData: any = [];
  let userProfileMemories: any = null;

  if (!options.disableExternalContext) {
    [allFacts, researchResult, graphData, userProfileMemories] = await Promise.all([
      getHighConfidenceFacts(userId),
      performResearch(userQuery, userContextPrompt),
      findRelatedEntities(userId, userQuery),
      getUserProfile(userId),
    ]);
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

  const memoryContext = options.disableExternalContext ? "" : await getRAGMemoryContext(userId, userQuery, "conversation");

  // History for GenAI
  let history = messages.map((msg) => ({
    role: msg.role === "bot" ? "model" : "user",
    parts: [{ text: msg.text }],
  }));

  const lastUserMessage = history.pop();
  if (!lastUserMessage || lastUserMessage.role !== "user") {
    throw new Error("Invalid prompt: last message must be user");
  }

  const userProfileContext = options.disableExternalContext ? "" : formatUserProfileForPrompt(userProfileMemories);

  let enhancedPromptText =
    userContextPrompt +
    userProfileContext +
    factContext +
    graphContext +
    searchContext +
    memoryContext +
    lastUserMessage.parts[0].text;

  const fullHistory = [getSystemInstruction(), GREETING, ...history];
  const { sanitizedHistory, prependToPrompt } = sanitizeHistory(fullHistory);

  if (prependToPrompt) {
    enhancedPromptText = prependToPrompt + "\n\n" + enhancedPromptText;
  }

  const chat = model.startChat({
    history: sanitizedHistory,
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const promptParts: any[] = [enhancedPromptText];
  if (fileData && mimeType) {
    promptParts.push({
      inlineData: {
        data: fileData,
        mimeType,
      },
    });
  }

  const result = await chat.sendMessage(promptParts);
  const responseText = result.response.text();

  if (!options.disableSideEffects) {
    // Capture interaction for future context
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: "user", content: userQuery },
      { role: "assistant", content: responseText },
    ]);

    const formattedMessages = messages.map((msg) => ({
      role: (msg.role === "bot" ? "assistant" : "user") as "user" | "assistant" | "system",
      content: msg.text,
    }));

    captureMemory(
      userId,
      "conversation",
      userQuery.substring(0, 50) || "Conversation",
      summary,
      formattedMessages,
      tokensUsed,
      tags,
      {
        userName: userContext.fullName,
        userEmail: userContext.email,
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
      }
    ).catch((err) => console.error("Memory capture failed:", err));

    // Knowledge graph update (best-effort)
    (async () => {
      try {
        if (tags.length > 0) {
          await addNode(userId, tags[0], "concept", `Automatically extracted from conversation`);
        }
      } catch (e) {
        console.error("Graph update failed", e);
      }
    })();
  }

  return {
    text: responseText,
    debug: {
      model: modelId,
      userQuery,
      context: {
        factsCount: intelligentFacts.length,
        graphEntitiesCount: Array.isArray(graphData) ? graphData.length : undefined,
        researchResultsCount: Array.isArray(researchResult?.results) ? researchResult.results.length : undefined,
      },
    },
  };
}
