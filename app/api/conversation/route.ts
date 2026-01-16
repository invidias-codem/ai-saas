// app/api/conversation/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env';
import { z } from "zod";
import {
  getRAGMemoryContext,
  captureMemory,
  extractTags,
  generateSummary,
  estimateTokenCount,
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently } from '@/lib/intelligentMemory';
import { sanitizeHistory } from '@/lib/gemini';

// New Integrations
import { findRelatedEntities, formatGraphContext, addNode, addEdge } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, getConversationMemories, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
// Removed manual compression - relying on native HTTP compression (Brotli/Gzip)

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash", // Or your preferred model
  safetySettings: [
    // Your safety settings
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

// ✅ Add instruction for data formatting with RAG context notice
// ✅ Add instruction for data formatting with RAG context notice
const getSystemInstruction = () => ({
  role: "user", // System instructions often go under the 'user' role for initial setup
  parts: [{
    text: `You are 'Genie', a helpful AI assistant. 
Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization. When you see 'User's Relevant Previous Work' or 'About This User' sections below, use that context to personalize your responses and maintain continuity with their previous interactions and preferences.`
  }],
});

// Optional: Initial greeting from the model
const GREETING = {
  role: "model",
  parts: [{ text: "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights." }]
};


export async function POST(req: Request) {
  try {
    // ✅ Get authenticated user from Clerk
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // ✅ Get full Clerk user object for context
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return new NextResponse("User not found", { status: 401 });
    }

    const body = await req.json();



    // Adapt schema structure if needed, or update promptSchema to match expected 'messages' array
    // The current promptSchema is { prompt: string }, but the code expects { messages: [...] }
    // We should probably update the schema or just check the messages here if we stick to existing code logic
    // but the task was to use Zod.
    // Let's check if the existing code uses `messages` or `prompt`.
    // It uses `const { messages } = body;`.
    // And schema says `prompt`. This is a mismatch in the existing codebase vs the schema file I saw.
    // I should probably fix the schema or handle it here.
    // Let's assume for this specific edit we want to validate `messages` specifically.

    // For now, let's stick to the existing logic but wrapped in a manual check or define a local schema if the imported one is wrong.
    // The imported `promptSchema` was just `prompt: z.string()`.
    // The code uses `messages`. 
    // I will define a local schema or just use the messages check for now to avoid breaking it if I can't see the schema update yet.
    // Wait, I saw lib/schemas.ts has `promptSchema = z.object({ prompt: z.string()... })`.
    // But the route uses `messages`.
    // I will add a `chatSchema` here to be safe and clear.

    const chatSchema = z.object({
      messages: z.array(z.object({
        role: z.string(),
        text: z.string()
      })).min(1, "Messages are required"),
      fileData: z.string().optional(),
      fileName: z.string().optional(),
      mimeType: z.string().optional()
    });

    const validationResult = chatSchema.safeParse(body);


    if (validationResult.success) {
      const { messages, fileData, mimeType } = validationResult.data;
    } else {
      return new NextResponse(JSON.stringify({
        error: "Validation Error",
        details: validationResult.error.flatten()
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { messages, fileData, mimeType } = validationResult.data;

    // ✅ Gather comprehensive user context
    const userContext = await gatherUserContext(userId, clerkUser);
    const userContextPrompt = formatUserContextForPrompt(userContext);

    // ✅ Retrieve high-confidence facts with intelligent ranking
    // Uses context relevance and importance scoring for smarter retrieval
    const userQuery = messages[messages.length - 1]?.text || '';

    // [Step 1] Parallel Context Gathering (Tiered Memory)
    const [
      allFacts,
      researchResult,
      graphData,
      userProfileMemories  // User-scoped memories (personality, personal facts)
    ] = await Promise.all([
      getHighConfidenceFacts(userId),
      performResearch(userQuery, userContextPrompt), // Web Search
      findRelatedEntities(userId, userQuery),         // Knowledge Graph
      getUserProfile(userId)                          // User profile (cross-conversation)
    ]);

    // Format new contexts
    const searchContext = formatSearchResults(researchResult.results);
    const graphContext = formatGraphContext(graphData);

    // Create mock vector similarities based on keyword matching
    const similarities = new Map<string, number>();
    const queryWords = userQuery.toLowerCase().split(/\s+/);
    for (const fact of allFacts) {
      const factWords = fact.content.toLowerCase().split(/\s+/);
      const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
      const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
      similarities.set(fact.id || '', Math.min(1, similarity * 1.5)); // Scale up slightly
    }

    const intelligentFacts = rankMemoriesIntelligently(
      allFacts,
      similarities,
      userQuery
    );

    console.log(`[Memory Intelligence] Retrieved ${intelligentFacts.length} intelligently ranked facts for user ${userId}`);
    if (intelligentFacts.length > 0) {
      console.log('[Memory Intelligence] Top facts:', intelligentFacts.slice(0, 2).map(f => ({
        type: f.type,
        content: f.content.substring(0, 40),
        relevance: f.contextRelevance?.toFixed(2)
      })));
    }
    const factContext = formatFactsForPrompt(intelligentFacts);

    // ✅ Retrieve relevant memories for context
    const memoryContext = await getRAGMemoryContext(userId, userQuery, 'conversation');

    // Adapt messages for GenAI history format
    let history = messages.map((msg: { role: string; text: string; }) => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    const lastUserMessage = history.pop();
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
      return new NextResponse("Invalid prompt", { status: 400 });
    }

    // ✅ Inject user context + profile + facts + graph + search + memory into the prompt
    const userProfileContext = formatUserProfileForPrompt(userProfileMemories);

    let enhancedPromptText =
      userContextPrompt +
      userProfileContext +    // [NEW] User personality profile (cross-conversation)
      factContext +
      graphContext +          // Knowledge Graph
      searchContext +         // Web Search
      memoryContext +
      lastUserMessage.parts[0].text;

    // Construct preliminary history with system instruction and greeting
    const fullHistory = [getSystemInstruction(), GREETING, ...history];

    // ✅ Sanitize History using helper
    const { sanitizedHistory, prependToPrompt } = sanitizeHistory(fullHistory);

    if (prependToPrompt) {
      // Prepend the trailing history message to the current prompt to maintain context
      enhancedPromptText = prependToPrompt + "\n\n" + enhancedPromptText;
    }

    const chat = model.startChat({
      // ✅ Use the sanitized history which acts as the "past"
      history: sanitizedHistory,
      generationConfig: {
        // Your generation config
        temperature: 0.9,
        topK: 40,
        topP: 0.7,
        maxOutputTokens: 2048,
      },
    });

    // [NEW] Multimodal Support: Add file data if present
    const promptParts: any[] = [enhancedPromptText];
    if (fileData && mimeType) {
      console.log(`[Multimodal] Attaching file (${mimeType}) of length ${fileData.length}`);
      promptParts.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType
        }
      });
    }

    const result = await chat.sendMessage(promptParts);
    const responseText = result.response.text();

    // ✅ Capture this interaction for future context
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    ]);

    // ✅ Send to Cloud Function for async memory capture with user metadata
    const formattedMessages = messages.map((msg: { role: string; text: string }) => ({
      role: (msg.role === 'bot' ? 'assistant' : 'user') as "user" | "assistant" | "system",
      content: msg.text
    }));

    captureMemory(
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
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
      }
    ).catch(err => console.error('Memory capture failed:', err));

    // [New] Knowledge Graph Extraction (Async)
    // We try to extract entities from the conversation and update the graph
    // Note: In a production environment, this should be a background job (e.g. Inngest/BullMQ)
    // For now, we fire and forget.
    (async () => {
      try {
        // Simple heuristic extraction for now or use a small LLM call
        // For demonstration, we assume if the user mentioned a "Project" in the query, we add it.
        // A real implementation would parse the 'summary' or 'responseText' for entities.
        if (tags.length > 0) {
          // auto-add top tag as a concept
          await addNode(userId, tags[0], 'concept', `Automatically extracted from conversation`);
        }
      } catch (e) {
        console.error('Graph update failed', e);
      }
    })();

    // ✅ Log successful conversation
    console.log(`[CONVERSATION] User: ${userContext.fullName} (${userId}) | Query: ${userQuery.substring(0, 50)}... | Tokens: ${tokensUsed}`);

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("[CONVERSATION_API_ERROR]", error);
    const errorMessage = error.message || "An unknown error occurred";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}