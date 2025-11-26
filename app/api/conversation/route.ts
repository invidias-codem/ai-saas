// app/api/conversation/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env';
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
const SYSTEM_INSTRUCTION = {
    role: "user", // System instructions often go under the 'user' role for initial setup
    parts: [{
      text: "You are 'Genie', a helpful AI assistant. Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization. When you see 'User's Relevant Previous Work' or 'About This User' sections below, use that context to personalize your responses and maintain continuity with their previous interactions and preferences."
    }],
};

// Optional: Initial greeting from the model
const GREETING = {
    role: "model",
    parts: [{ text: "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights."}]
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
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // ✅ Gather comprehensive user context
    const userContext = await gatherUserContext(userId, clerkUser);
    const userContextPrompt = formatUserContextForPrompt(userContext);

    // ✅ Retrieve high-confidence facts for accurate responses (prevents hallucinations)
    const facts = await getHighConfidenceFacts(userId);
    const factContext = formatFactsForPrompt(facts);

    // ✅ Retrieve relevant memories for context
    const userQuery = messages[messages.length - 1]?.text || '';
    const memoryContext = await getRAGMemoryContext(userId, userQuery, 'conversation');

    // Adapt messages for GenAI history format
    const history = messages.map((msg: { role: string; text: string; }) => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    const lastUserMessage = history.pop();
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
       return new NextResponse("Invalid prompt", { status: 400 });
    }

    // ✅ Inject user context + facts (HIGH PRIORITY) + memory context into the prompt
    const enhancedPromptText = userContextPrompt + factContext + memoryContext + lastUserMessage.parts[0].text;

    const chat = model.startChat({
      // ✅ Prepend system instruction and greeting to history
      history: [SYSTEM_INSTRUCTION, GREETING, ...history],
      generationConfig: {
        // Your generation config
        temperature: 0.9,
        topK: 40,
        topP: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(enhancedPromptText);
    const responseText = result.response.text();

    // ✅ Capture this interaction for future context
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    ]);

    // ✅ Send to Cloud Function for async memory capture with user metadata
    captureMemory(
      userId,
      'conversation',
      userQuery.substring(0, 50) || 'Conversation',
      summary,
      messages,
      tokensUsed,
      tags,
      {
        userName: userContext.fullName,
        userEmail: userContext.email,
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
      }
    ).catch(err => console.error('Memory capture failed:', err));

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