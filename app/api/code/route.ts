// app/api/code/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
import { tagMessagesForStorage, tagLLMMessage, extractWMRTMetadata } from '@/lib/world-model/trustTag';
import {
  getRAGMemoryContext,
  captureMemory,
  extractTags,
  generateSummary,
  estimateTokenCount,
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt,
  getGitHubContext
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently } from '@/lib/intelligentMemory';
import { findRelatedEntities, formatGraphContext, addNode } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { storeMemory } from '@/lib/memory/vectorStore';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { ChatMessage } from '@/lib/llm/types';
import { checkCredits, deductCredits, spendCreditsAtomic, CREDIT_COSTS } from "@/lib/credits";
import { logger } from "@/lib/logger";

export const runtime = 'nodejs';

// Initialize lazily
function getGeminiModel(modelId: string) {
  const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
  return genAI.getGenerativeModel({
    model: modelId, // Use the passed model ID
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });
}

// System instruction - slightly refined to emphasize using provided content
const CODE_SYSTEM_INSTRUCTION_TEXT = "You are 'Genie Code', an expert coding assistant. Analyze provided code snippets or file content, explain concepts, generate code, and answer questions related to programming. **If file content data is provided along with a text prompt, focus your analysis on the file data based on the instructions in the text prompt.** Use markdown code blocks with language identifiers. For non-coding questions, politely decline.";

const CODE_SYSTEM_INSTRUCTION = {
  role: "user",
  parts: [{
    text: CODE_SYSTEM_INSTRUCTION_TEXT
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
    // 1. Authentication
    const user = await requireAuth();
    const clerkUser = await currentUser();
    const ip = getClientIP(req);

    if (!clerkUser) {
      return new NextResponse("User profile not found", { status: 401 });
    }

    // 2. Rate Limiting (AI endpoint - strict limits)
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: 'Code generation rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining)
          }
        }
      );
    }

    // 3. Validate Request Size
    const body = await req.json();
    validateRequestSize(body, 10 * 1024 * 1024); // 10MB for code files

    const { messages, currentUserPrompt, fileData, model = 'fast', activeRepo } = body;
    const modelConfig = CODE_MODELS[model] || CODE_MODELS.fast;

    // 4. Input Validation
    if (!messages && (!currentUserPrompt && !fileData)) {
      return new NextResponse("Messages or prompt/file are required", { status: 400 });
    }

    // Validate file if provided
    if (fileData) {
      const fileValidation = fileUploadSchema.safeParse(fileData);
      if (!fileValidation.success) {
        return NextResponse.json(
          { error: 'Invalid file data', details: fileValidation.error.flatten() },
          { status: 400 }
        );
      }
      // Size check for base64 data (rough estimate: base64 is ~1.33x original)
      const estimatedSize = fileData.base64Data.length * 0.75;
      if (estimatedSize > 5 * 1024 * 1024) { // 5MB file limit
        return NextResponse.json(
          { error: 'File too large', details: 'Maximum file size is 5MB' },
          { status: 400 }
        );
      }
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

    // 5. Gather comprehensive user context
    const userContext = await gatherUserContext(user.userId, clerkUser);
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
      getHighConfidenceFacts(user.userId),
      performResearch(userQuery, userContextPrompt, { hasFileAttachment: !!(fileData && fileData.base64Data) }), // Web Search for latest docs/libraries
      findRelatedEntities(user.userId, userQuery),         // Knowledge Graph (projects, technologies)
      getUserProfile(user.userId)                          // User profile (coding style, preferences)
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

    console.log(`[Code Memory Intelligence] Retrieved ${intelligentFacts.length} intelligently ranked facts for user ${user.userId}`);
    const factContext = formatFactsForPrompt(intelligentFacts);

    // Retrieve relevant memories for context
    const memoryContext = (await getRAGMemoryContext(user.userId, userQuery, 'code')).contextString;

    // GitHub Context
    let githubContext = '';
    if (activeRepo) {
      try {
        logger.debug(`[Code API] Fetching GitHub context for ${activeRepo}`);
        githubContext = await getGitHubContext(user.userId, userQuery, activeRepo);
      } catch (err) {
        logger.error("[Code API] Failed to fetch GitHub context:", err);
      }
    }

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
      githubContext +         // GitHub repository context
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

    // 4. Rate/Credit Check (Atomic)
    const cost = CREDIT_COSTS.CODE_GENERATION;
    const idempotencyKey = req.headers.get('idempotency-key') || `code-${user.userId}-${Date.now()}`;

    const spendResult = await spendCreditsAtomic(user.userId, cost, idempotencyKey, "Code generation", { model: modelConfig.modelId, activeRepo });

    if (!spendResult.success && !spendResult.duplicate) {
      return NextResponse.json(
        { error: 'Insufficient credits', message: `You need ${cost} credits for this request.`, remaining: spendResult.remaining },
        { status: 402 }
      );
    }

    logger.debug("Sending to Gemini - History:", JSON.stringify(history.map((h: { parts: { text: any; }[]; }) => h.parts[0].text))); // Log history text only for brevity
    logger.debug("Sending to Gemini - Current Turn Parts:", JSON.stringify(currentUserParts.map(p => p.text ? `Text: ${p.text.substring(0, 50)}...` : `File: ${p.inlineData?.mimeType}`))); // Log structure summary

    // ... generation logic ...

    let responseText = "";

    // --- Provider Dispatch ---

    if (modelConfig.provider === 'claude') {
      // Claude Provider Logic
      const provider = new ClaudeProvider();

      // Prepare History
      const chatHistory: ChatMessage[] = (messages || []).map((msg: any) => ({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        text: msg.text
      }));

      // Append current turn
      let currentText = enhancedPromptText;
      if (fileData && fileData.base64Data) {
        // Decode and append file content for Claude (since provider is text-only)
        try {
          const decoded = Buffer.from(fileData.base64Data, 'base64').toString('utf-8');
          // Naive check for binary vs text
          if (!/[\x00-\x08\x0E-\x1F]/.test(decoded.substring(0, 100))) {
            currentText += `\n\n[Attached File: ${fileData.name}]\n\`\`\`${fileData.type || ''}\n${decoded}\n\`\`\``;
          } else {
            currentText += `\n\n[Attached File: ${fileData.name}] (Binary file attached, content omitted for text model)`;
          }
        } catch (e) {
          console.error("Failed to decode file for Claude:", e);
        }
      }

      chatHistory.push({ role: 'user', text: currentText });

      const streamResult = await provider.generateStream(chatHistory, CODE_SYSTEM_INSTRUCTION_TEXT, {
        model: modelConfig.modelId,
        maxTokens: modelConfig.maxTokens,
        temperature: 0.7
      });

      // Consume stream
      const textDecoder = new TextDecoder();
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseText += textDecoder.decode(value, { stream: true });
        }
        responseText += textDecoder.decode(); // flush
      } catch (streamError) {
        console.error('[Code API] Stream read error:', streamError);
        if (!responseText) {
          throw new Error('Failed to read response from Claude');
        }
        // If we have partial content, continue with what we have
      } finally {
        reader.releaseLock();
      }

    } else if (modelConfig.provider === 'deepseek') {
      // DeepSeek Provider Logic (Reasoning)
      const provider = new DeepSeekProvider();

      // Prepare History
      const chatHistory: ChatMessage[] = (messages || []).map((msg: any) => ({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        text: msg.text
      }));

      // Append current turn
      let currentText = enhancedPromptText;
      if (fileData && fileData.base64Data) {
        // For DeepSeek (text-only reasoning), append file content as text block
        try {
          const decoded = Buffer.from(fileData.base64Data, 'base64').toString('utf-8');
          // Limit file size for context window if needed, but R1 has 64k/128k context
          if (!/[\x00-\x08\x0E-\x1F]/.test(decoded.substring(0, 100))) {
            currentText += `\n\n[Attached File: ${fileData.name}]\n\`\`\`${fileData.type || ''}\n${decoded}\n\`\`\``;
          } else {
            currentText += `\n\n[Attached File: ${fileData.name}] (Binary file attached, content omitted)`;
          }
        } catch (e) {
          console.error("Failed to decode file for DeepSeek:", e);
        }
      }

      chatHistory.push({ role: 'user', text: currentText });

      const streamResult = await provider.generateStream(chatHistory, CODE_SYSTEM_INSTRUCTION_TEXT, {
        model: modelConfig.modelId,
        maxTokens: modelConfig.maxTokens,
        temperature: 0.6 // Slightly lower for reasoning
      });

      // Consume stream
      const textDecoder = new TextDecoder();
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseText += textDecoder.decode(value, { stream: true });
        }
        responseText += textDecoder.decode(); // flush
      } finally {
        reader.releaseLock();
      }

    } else {
      // Gemini Logic (Existing robust implementation)
      // Re-use current logic but with getGeminiModel(modelConfig.modelId)

      const chat = getGeminiModel(modelConfig.modelId).startChat({
        history: [CODE_SYSTEM_INSTRUCTION, CODE_GREETING, ...history],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.7,
          maxOutputTokens: modelConfig.maxTokens,
        },
      });

      const result = await chat.sendMessage(currentUserParts);
      if (!result.response) {
        throw new Error("No response received from the model.");
      }
      responseText = result.response.text();
    }

    // Capture this interaction for future context
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    ]);

    // ── RFC-001 WMRT: Tag all messages with trust tier before storage ──
    // Raw LLM output is always UNVERIFIED at write time.
    // Only DeltaEngine can promote to CONFIRMED/SUPPORTED after scoring.
    const rawHistory = (messages || []).map((msg: { role: string; text: string }) => ({
      role: (msg.role === 'bot' ? 'assistant' : 'user') as "user" | "assistant" | "system",
      content: msg.text,
    }));
    const taggedHistory = tagMessagesForStorage(rawHistory, modelConfig.modelId);
    // Append the current turn — assistant response tagged as UNVERIFIED
    taggedHistory.push(
      { role: 'user', content: userQuery, trust_tier: 'UNVERIFIED' as const, tagged_at: new Date().toISOString() },
      tagLLMMessage(responseText, modelConfig.modelId),
    );
    const wmrtMeta = extractWMRTMetadata(taggedHistory, modelConfig.modelId);
    // ──────────────────────────────────────────────────────────────────

    // Send to memory capture (async, fire-and-forget)
    captureMemory(
      user.userId,
      'code',
      userQuery.substring(0, 50) || 'Code Assistance',
      summary,
      taggedHistory,
      tokensUsed,
      tags,
      {
        userName: userContext.fullName,
        userEmail: userContext.email,
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
        hasFileAttachment: !!fileData,
        fileName: fileData?.name,
        ...wmrtMeta,
      }
    ).catch(err => console.error('[WMRT] Memory capture failed:', err));

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
              user.userId,
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
            await addNode(user.userId, codeRelatedTags[0], 'technology', `Extracted from code session: ${userQuery.substring(0, 30)}`);
          }
        }
      } catch (e) {
        console.error('Graph update failed', e);
      }
    })();

    // Log successful code interaction
    console.log(`[CODE] User: ${userContext.fullName} (${user.userId}) | Query: ${userQuery.substring(0, 50)}... | Tokens: ${tokensUsed}`);

    // Deduct credits handled atomically at start
    // await deductCredits(user.userId, CREDIT_COSTS.CODE_GENERATION, "Code generation");

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("[CODE_API_ERROR]", error);

    // Handle auth/validation errors
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({
        error: 'Validation Error',
        details: error.message
      }, { status: 400 });
    }

    if (error.response?.data?.error) {
      logger.error("Gemini API Error:", error.response.data.error);
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