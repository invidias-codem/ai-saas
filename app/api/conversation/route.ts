// app/api/conversation/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env'; // Import our new env file

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  // Add your safety settings here
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // ... add other settings
  ],
});

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { messages } = body; // Pass the whole message history

    if (!messages) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // Adapt messages for GenAI history format
    const history = messages.map((msg: { role: string; text: string; }) => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    // Remove the last message (which is the new user prompt)
    // The GenAI SDK uses the last item in 'history' as the context,
    // and sends the new prompt via `sendMessage`.
    const lastUserMessage = history.pop();
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
       return new NextResponse("Invalid prompt", { status: 400 });
    }

    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(lastUserMessage.parts[0].text);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });

  } catch (error) {
    console.error("[CONVERSATION_API_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}