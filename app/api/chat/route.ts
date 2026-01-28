// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
import {
    captureMemory,
    extractTags,
    generateSummary,
    estimateTokenCount,
    gatherUserContext,
    formatUserContextForPrompt,
    getHighConfidenceFacts,
    formatFactsForPrompt,
    getRAGMemoryContext
} from '@/lib/ragMemory';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

const SYSTEM_INSTRUCTION = {
    role: "user",
    parts: [{
        text: "You are 'Genie', a highly intelligent and helpful AI assistant. You have access to the user's personal context, facts, and memories. Use this information to provide personalized and accurate responses. If files are attached, analyze them thoroughly."
    }],
};

export async function POST(req: Request) {
    try {
        // 1. Authenticate User
        const { userId } = auth();
        const clerkUser = await currentUser();

        if (!userId || !clerkUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const body = await req.json();
        const { prompt, conversationId, fileData, messages } = body;

        if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });

        // 3. Persist USER Message to Supabase (Immediate UI feedback handled by frontend usually, but we ensure DB consistency)
        if (conversationId && supabaseAdmin) {
            const { error: dbError } = await supabaseAdmin
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    role: 'user',
                    content: prompt
                });
            if (dbError) console.error("Failed to persist user message:", dbError);
        }

        // 4. Gather RAG Context (Parallel)
        const userQuery = prompt;
        const [
            userContext,
            allFacts,
            researchResult,
            graphData,
            userProfileMemories,
            ragMemory
        ] = await Promise.all([
            gatherUserContext(userId, clerkUser),
            getHighConfidenceFacts(userId),
            performResearch(userQuery), // Light web search
            findRelatedEntities(userId, userQuery),
            getUserProfile(userId),
            getRAGMemoryContext(userId, userQuery, 'conversation')
        ]);

        // Format Contexts
        const userContextPrompt = formatUserContextForPrompt(userContext);
        const factContext = formatFactsForPrompt(allFacts); // We can add intelligent ranking later if needed
        const searchContext = formatSearchResults(researchResult.results);
        const graphContext = formatGraphContext(graphData);
        const profileContext = formatUserProfileForPrompt(userProfileMemories);

        // 5. Construct Prompt
        const currentUserParts: Part[] = [];

        const enhancedPromptText =
            userContextPrompt +
            profileContext +
            factContext +
            graphContext +
            searchContext +
            ragMemory +
            `\nUser Query: ${prompt}`;

        currentUserParts.push({ text: enhancedPromptText });

        // Attach File if present
        if (fileData && fileData.base64Data && fileData.type) {
            console.log(`Attaching file ${fileData.name} (${fileData.type})`);
            currentUserParts.push({
                inlineData: {
                    mimeType: fileData.type,
                    data: fileData.base64Data
                }
            });
        }

        // 6. Call Gemini
        console.log(`[Genie] Sending request to Gemini 2.0 Flash for user ${userId}...`);

        // Adapt history if provided
        const adaptedHistory = (messages || []).slice(0, -1).map((msg: any) => ({
            role: msg.role === 'bot' ? 'model' : 'user',
            parts: [{ text: msg.text || '' }]
        }));

        const chat = model.startChat({
            history: [SYSTEM_INSTRUCTION, ...adaptedHistory],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 4096,
            }
        });

        const result = await chat.sendMessage(currentUserParts);
        const responseText = result.response.text();

        console.log(`[Genie] Response received (${responseText.length} chars).`);

        // 7. Persist BOT Response to Supabase (CRITICAL for frontend to see it)
        if (conversationId && supabaseAdmin) {
            const { error: botDbError } = await supabaseAdmin
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    role: 'bot', // Frontend likely expects 'bot' or 'assistant'
                    content: responseText
                });

            if (botDbError) {
                console.error("Failed to persist bot response:", botDbError);
                throw new Error("Database Write Failed");
            }
        }

        // 8. Capture Memory (Async)
        const summary = generateSummary([
            { role: 'user', content: prompt },
            { role: 'assistant', content: responseText }
        ]);

        captureMemory(
            userId,
            'conversation',
            prompt.substring(0, 50),
            summary,
            [
                { role: 'user', content: prompt },
                { role: 'assistant', content: responseText }
            ],
            estimateTokenCount(prompt + responseText),
            extractTags(prompt),
            {
                userName: userContext.fullName,
                hasFileAttachment: !!fileData
            }
        ).catch(err => console.error("Memory capture failed:", err));

        // 9. Return Success
        return NextResponse.json({
            success: true,
            message: "Response generated and saved.",
            // We can optionally return text here if we update frontend later
            text: responseText
        });

    } catch (error: any) {
        console.error('Genie API Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error.message
        }, { status: 500 });
    }
}

