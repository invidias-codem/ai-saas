// app/api/code/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
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
import { findRelatedEntities, formatGraphContext, addNode } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { storeMemory } from '@/lib/memory/vectorStore';
// Removed manual compression - relying on native HTTP compression (Brotli/Gzip)

// Initialize lazily
function getModel() {
  const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash", // Model supports file input
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });
}

// System instruction - slightly refined to emphasize using provided content
const CODE_SYSTEM_INSTRUCTION = {
  role: "user",
  parts: [{
    text: "You are 'Genie Code', an expert coding assistant. Analyze provided code snippets or file content, explain concepts, generate code, and answer questions related to programming. **If file content data is provided along with a text prompt, focus your analysis on the file data based on the instructions in the text prompt.** Use markdown code blocks with language identifiers. For non-coding questions, politely decline."
  }],
};

// Greeting message (Optional)
const CODE_GREETING = {
  role: "model",
  parts: [{
    text: "Ready to code! Ask a question or attach a file."
  }]
};

export const maxDuration = 60; // Set max duration for long running RAG ops

// Helper to chunk text
function chunkText(text: string, size: number = 2000): string[] {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get full Clerk user object for context
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return new NextResponse("User not found", { status: 401 });
    }

    const body = await req.json();
    const { messages, currentUserPrompt, fileData } = body;

    if (!messages && (!currentUserPrompt && !fileData)) {
      return new NextResponse("Messages or prompt/file are required", { status: 400 });
    }

    // Adapt history (strip file placeholders)
    // Adapt history (restore files from persistent history)
    const history = (messages || []).slice(0, -1).map((msg: {
      role: string;
      text: string;
      fileData?: { mimeType?: string; type?: string; base64Data: string; name: string }
    }) => {
      const parts: Part[] = [{ text: msg.text || '' }];

      // Re-attach file if present in history
      if (msg.fileData && msg.fileData.base64Data) {
        parts.push({
          inlineData: {
            mimeType: msg.fileData.mimeType || msg.fileData.type || 'text/plain',
            data: msg.fileData.base64Data
          }
        });
      }

      return {
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: parts,
      };
    });

    // Gather comprehensive user context
    const userContext = await gatherUserContext(userId, clerkUser);
    const userContextPrompt = formatUserContextForPrompt(userContext);

    // Get current user query for context retrieval
    const userQuery = currentUserPrompt || 'code assistance';

    // [Step 1] Parallel Context Gathering (Tiered Memory for Code)
    const [
      allFacts,
      researchResult,
      graphData,
      userProfileMemories  // User-scoped memories (coding preferences, patterns)
    ] = await Promise.all([
      getHighConfidenceFacts(userId),
      performResearch(userQuery, userContextPrompt), // Web Search for latest docs/libraries
      findRelatedEntities(userId, userQuery),         // Knowledge Graph (projects, technologies)
      getUserProfile(userId)                          // User profile (coding style, preferences)
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

    console.log(`[Code Memory Intelligence] Retrieved ${intelligentFacts.length} intelligently ranked facts for user ${userId}`);
    const factContext = formatFactsForPrompt(intelligentFacts);

    // Retrieve relevant memories for context
    // Retrieve relevant memories for context with filtering
    const memoryContext = await getRAGMemoryContext(userId, userQuery, 'code');

    // Format user profile context
    const userProfileContext = formatUserProfileForPrompt(userProfileMemories);


    // Construct the current user message parts
    const currentUserParts: Part[] = [];

    // ✅ Add TEXT part FIRST with enhanced context
    const promptText = (currentUserPrompt || '').trim();
    // Use a default instruction if only a file is attached
    const baseInstruction = promptText || `Please analyze the attached file: ${fileData?.name || 'attached file'}`;

    // Inject user context + profile + facts + graph + search + memory into the prompt
    const enhancedPromptText =
      userContextPrompt +
      userProfileContext +    // User coding preferences and patterns
      factContext +           // High-confidence facts
      graphContext +          // Knowledge Graph (projects, technologies)
      searchContext +         // Web Search (latest docs/libraries)
      memoryContext +         // RAG memories from past code sessions
      baseInstruction;

    currentUserParts.push({ text: enhancedPromptText });

    // ✅ Add FILE data SECOND if present
    if (fileData && fileData.base64Data && fileData.type) {
      // Log the MIME type being sent
      console.log(`Attaching file ${fileData.name} with MIME type: ${fileData.type}`);
      currentUserParts.push({
        inlineData: {
          mimeType: fileData.type, // Ensure this is accurate (e.g., 'text/plain', 'text/javascript')
          data: fileData.base64Data
        }
      });
    }

    if (currentUserParts.length === 0 || (currentUserParts.length === 1 && !currentUserParts[0].text && !currentUserParts[0].inlineData)) {
      return new NextResponse("Invalid prompt or file data", { status: 400 });
    }

    console.log("Sending to Gemini - History:", JSON.stringify(history.map((h: { parts: { text: any; }[]; }) => h.parts[0].text))); // Log history text only for brevity
    console.log("Sending to Gemini - Current Turn Parts:", JSON.stringify(currentUserParts.map(p => p.text ? `Text: ${p.text.substring(0, 50)}...` : `File: ${p.inlineData?.mimeType}`))); // Log structure summary


    const chat = getModel().startChat({
      history: [CODE_SYSTEM_INSTRUCTION, CODE_GREETING, ...history],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const result = await chat.sendMessage(currentUserParts);
    if (!result.response) {
      throw new Error("No response received from the model.");
    }
    const responseText = result.response.text();

    // Capture this interaction for future context
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    ]);

    // Format messages for memory capture
    const formattedMessages = (messages || []).map((msg: { role: string; text: string }) => ({
      role: (msg.role === 'bot' ? 'assistant' : 'user') as "user" | "assistant" | "system",
      content: msg.text
    }));

    // Add current interaction
    formattedMessages.push(
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    );

    // Send to memory capture (async, fire-and-forget)
    captureMemory(
      userId,
      'code',
      userQuery.substring(0, 50) || 'Code Assistance',
      summary,
      formattedMessages,
      tokensUsed,
      tags,
      {
        userName: userContext.fullName,
        userEmail: userContext.email,
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
        hasFileAttachment: !!fileData,
        fileName: fileData?.name
      }
    ).catch(err => console.error('Memory capture failed:', err));

    // [New] Code RAG Indexing (Explicit Save)
    const { saveToMemory } = body;
    if (saveToMemory && fileData && fileData.base64Data) {
      (async () => {
        try {
          // Decode file
          const decodedContent = Buffer.from(fileData.base64Data, 'base64').toString('utf-8');
          const fileName = fileData.name || 'uploaded_file';

          // Basic check to avoid indexing binary garbage if someone uploads an image as "code"
          // Mime type check is good but not foolproof. Heuristic check:
          if (/[\x00-\x08\x0E-\x1F]/.test(decodedContent.substring(0, 100))) {
            console.warn(`[Code RAG] Skipping indexing for ${fileName} - appears binary.`);
            return;
          }

          const chunks = chunkText(decodedContent, 3000); // ~750 tokens
          console.log(`[Code RAG] Indexing ${fileName} into ${chunks.length} chunks...`);

          let indexedCount = 0;
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const contextPrefix = `[File: ${fileName} | Part ${i + 1}/${chunks.length}]\n`;

            await storeMemory(
              userId,
              contextPrefix + chunk,
              'fact', // storing as 'fact' for now, or could use a new type if migration allowed
              {
                featureType: 'code', // CRITICAL: This enables the filtering we added
                fileName: fileName,
                chunkIndex: i,
                totalChunks: chunks.length,
                language: fileData.type
              }
            );
            indexedCount++;
          }
          console.log(`[Code RAG] Successfully indexed ${indexedCount} chunks for ${fileName}`);
        } catch (err) {
          console.error('[Code RAG] Indexing failed:', err);
        }
      })();
    }

    // [New] Knowledge Graph Extraction for Code (Async)
    // Extract programming languages, frameworks, and concepts
    (async () => {
      try {
        if (tags.length > 0) {
          // Auto-add top coding-related tag as a technology/concept node
          const codeRelatedTags = tags.filter(tag =>
            /react|node|python|javascript|typescript|java|api|database|framework|library/i.test(tag)
          );
          if (codeRelatedTags.length > 0) {
            await addNode(userId, codeRelatedTags[0], 'technology', `Extracted from code session: ${userQuery.substring(0, 30)}`);
          }
        }
      } catch (e) {
        console.error('Graph update failed', e);
      }
    })();

    // Log successful code interaction
    console.log(`[CODE] User: ${userContext.fullName} (${userId}) | Query: ${userQuery.substring(0, 50)}... | Tokens: ${tokensUsed}`);

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("[CODE_API_ERROR]", error);
    if (error.response?.data?.error) {
      console.error("Gemini API Error:", error.response.data.error);
    }
    const errorMessage = error.response?.data?.error?.message || error.message || "An unknown error occurred";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}