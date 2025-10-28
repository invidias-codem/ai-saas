// app/api/code/route.ts
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { env } from '@/lib/env';

const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash", // Model supports file input
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

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

export async function POST(req: Request) {
  try {
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { messages, currentUserPrompt, fileData } = body;

    if (!messages && (!currentUserPrompt && !fileData)) {
      return new NextResponse("Messages or prompt/file are required", { status: 400 });
    }

    // Adapt history (strip file placeholders)
    const history = (messages || []).slice(0, -1).map((msg: { role: string; text: string; }) => {
        const textContent = String(msg.text || '');
        return {
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: textContent.replace(/\[(?:Attached|Analysing) File:.*?\]/g, '').trim() }],
        };
    });

    // Construct the current user message parts
    const currentUserParts: Part[] = [];

    // ✅ Add TEXT part FIRST
    const promptText = (currentUserPrompt || '').trim();
    // Use a default instruction if only a file is attached
    const textInstruction = promptText || `Please analyze the attached file: ${fileData?.name || 'attached file'}`;
    currentUserParts.push({ text: textInstruction });

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
    console.log("Sending to Gemini - Current Turn Parts:", JSON.stringify(currentUserParts.map(p => p.text ? `Text: ${p.text.substring(0,50)}...` : `File: ${p.inlineData?.mimeType}`))); // Log structure summary


    const chat = model.startChat({
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