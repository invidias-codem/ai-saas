// app/api/guest-chat/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { env } from '@/lib/env';
import { z } from "zod";

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

// Guest-specific system instruction
const GUEST_SYSTEM_INSTRUCTION = {
    role: "user",
    parts: [{
        text: `You are 'Genie', a friendly and helpful AI assistant. You're chatting with a guest who hasn't signed up yet.
    
Be warm, helpful, and showcase your capabilities. Keep responses concise but informative.
When appropriate, subtly mention that signing up unlocks more features like:
- Persistent memory across sessions
- Code generation and debugging
- Image and video creation
- Slack integration

Always be helpful first - don't be pushy about sign-ups.`
    }],
};

const GUEST_GREETING = {
    role: "model",
    parts: [{ text: "Hey! 👋 I'm Genie. I'm here to help you brainstorm, answer questions, or tackle any project. What's on your mind?" }]
};

// Request schema
const guestChatSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "bot"]),
        text: z.string()
    })).min(1, "At least one message is required"),
    interactionCount: z.number().min(0).max(10)
});

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const validationResult = guestChatSchema.safeParse(body);

        if (!validationResult.success) {
            return new NextResponse(JSON.stringify({
                error: "Validation Error",
                details: validationResult.error.flatten()
            }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { messages, interactionCount } = validationResult.data;

        // Check if guest has exceeded free limit
        if (interactionCount >= 10) {
            return new NextResponse(JSON.stringify({
                error: "Free limit reached",
                message: "You've used all 10 free messages! Sign up to continue chatting with Genie.",
                requiresSignup: true
            }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Convert messages to Gemini format
        let history = messages.map((msg: { role: string; text: string }) => ({
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: msg.text }],
        }));

        const lastUserMessage = history.pop();
        if (!lastUserMessage || lastUserMessage.role !== 'user') {
            return new NextResponse("Invalid prompt", { status: 400 });
        }

        // Build history with system instruction and greeting
        const fullHistory = [GUEST_SYSTEM_INSTRUCTION, GUEST_GREETING, ...history];

        // Ensure proper role alternation
        const sanitizedHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        let lastRole = '';

        for (const msg of fullHistory) {
            if (msg.role !== lastRole) {
                sanitizedHistory.push(msg);
                lastRole = msg.role;
            } else {
                // Merge consecutive same-role messages
                const lastMsg = sanitizedHistory[sanitizedHistory.length - 1];
                if (lastMsg) {
                    lastMsg.parts[0].text += '\n\n' + msg.parts[0].text;
                }
            }
        }

        // Ensure history ends with model role for proper alternation
        if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
            // Add a brief acknowledgment to fix alternation
            sanitizedHistory.push({
                role: 'model',
                parts: [{ text: 'I understand. Let me help with that.' }]
            });
        }

        const chat = model.startChat({
            history: sanitizedHistory,
            generationConfig: {
                temperature: 0.9,
                topK: 40,
                topP: 0.7,
                maxOutputTokens: 1024, // Slightly shorter for guests
            },
        });

        const result = await chat.sendMessage(lastUserMessage.parts[0].text);
        const responseText = result.response.text();

        console.log(`[GUEST_CHAT] Interaction #${interactionCount + 1} | Query: ${lastUserMessage.parts[0].text.substring(0, 50)}...`);

        return NextResponse.json({
            text: responseText,
            remainingMessages: 10 - (interactionCount + 1)
        });

    } catch (error: any) {
        console.error("[GUEST_CHAT_API_ERROR]", error);
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
