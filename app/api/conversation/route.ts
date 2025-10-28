// app/api/conversation/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env';

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

// ✅ Add instruction for data formatting
const SYSTEM_INSTRUCTION = {
    role: "user", // System instructions often go under the 'user' role for initial setup
    parts: [{
      text: "You are 'Genie', a helpful AI assistant. Provide informative and concise responses. When presenting structured data (like comparisons, statistics, lists suitable for plotting), format it as a standard GitHub Flavored Markdown table whenever possible to facilitate visualization."
    }],
};

// Optional: Initial greeting from the model
const GREETING = {
    role: "model",
    parts: [{ text: "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights."}]
};


export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || messages.length === 0) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // Adapt messages for GenAI history format
    const history = messages.map((msg: { role: string; text: string; }) => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    const lastUserMessage = history.pop();
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
       return new NextResponse("Invalid prompt", { status: 400 });
    }

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

    const result = await chat.sendMessage(lastUserMessage.parts[0].text);
    const responseText = result.response.text();

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