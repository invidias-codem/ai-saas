// app/api/code/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env'; // Import our env file


const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

// A system instruction for the code model
const CODE_SYSTEM_INSTRUCTION = {
  role: "user",
  parts: [{ 
    text: "You are 'Genie Code', an expert coding assistant. Your sole purpose is to provide high-quality, professional code explanations and snippets. All your responses must be related to programming, software development, or data structures. For any non-coding related questions, you must politely decline and remind the user of your purpose. When providing code, use markdown code blocks with language identifiers." 
  }],
};

// A greeting message
const CODE_GREETING = {
  role: "model",
  parts: [{
    text: "Sounds amazing, what language or technology stack would you like learn?"
  }]
};

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { messages } = body; // Pass the whole message history

    if (!messages || messages.length === 0) {
      return new NextResponse("Messages are required", { status: 400 });
    }

    // Adapt messages for GenAI history format
    const history = messages.map((msg: { role: string; text: string; }) => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    // Remove the last message (which is the new user prompt)
    const lastUserMessage = history.pop();
    if (!lastUserMessage || lastUserMessage.role !== 'user') {
       return new NextResponse("Invalid prompt", { status: 400 });
    }

    const chat = model.startChat({
      // ✅ Add the system instruction and greeting before the rest of the history
      history: [CODE_SYSTEM_INSTRUCTION, CODE_GREETING, ...history],
      generationConfig: {
        temperature: 0.7, // Slightly lower temp for more predictable code
        topK: 40,
        topP: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const result = await chat.sendMessage(lastUserMessage.parts[0].text);
    const responseText = result.response.text();

    return NextResponse.json({ text: responseText });

  } catch (error: any) { // ✅ 1. Add :any to access error.message
    console.error("[CODE_API_ERROR]", error);
    
    // ✅ 2. Create a detailed message
    const errorMessage = error.message || "An unknown error occurred";

    // ✅ 3. Send the 'details' field your client is looking for
    return new NextResponse(JSON.stringify({ 
      error: "Internal Server Error",
      details: errorMessage 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}