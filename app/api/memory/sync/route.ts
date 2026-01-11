/**
 * Background Memory Sync API
 * 
 * POST /api/memory/sync
 * Processes messages and extracts memories in the background
 * Returns 202 Accepted immediately (fire-and-forget)
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { conversationId, messages } = body;

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
        }

        // Return immediately - process in background
        // We use setImmediate or process.nextTick to defer processing
        setImmediate(async () => {
            try {
                await processMemoriesInBackground(userId, conversationId, messages || []);
            } catch (error) {
                console.error('[Memory:Sync] Background processing error:', error);
            }
        });

        return NextResponse.json(
            {
                success: true,
                message: "Memory sync started in background",
                conversationId
            },
            { status: 202 } // 202 Accepted
        );

    } catch (error) {
        console.error('[Memory:Sync] Error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * Background processing function
 * Extracts memories from messages and stores them in Supabase
 */
async function processMemoriesInBackground(
    userId: string,
    conversationId: string,
    messages: Array<{ role: string; content: string }>
) {
    console.log(`[Memory:Sync] Processing memories for conversation ${conversationId}`);

    try {
        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            console.error('[Memory:Sync] Supabase not configured');
            return;
        }

        // If no messages provided, fetch from database
        let messagesToProcess = messages;
        if (!messages || messages.length === 0) {
            const { data, error } = await supabase
                .from('messages')
                .select('role, content')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[Memory:Sync] Error fetching messages:', error);
                return;
            }

            messagesToProcess = data || [];
        }

        if (messagesToProcess.length === 0) {
            console.log('[Memory:Sync] No messages to process');
            return;
        }

        // Extract important information from conversation
        const memories = await extractMemories(messagesToProcess);

        if (memories.length === 0) {
            console.log('[Memory:Sync] No memories extracted');
            return;
        }

        // Store memories in database
        for (const memory of memories) {
            // Generate embedding (placeholder - you'll need to implement this)
            const embedding = await generateEmbedding(memory.content);

            const { error } = await supabase
                .from('memory_bank')
                .insert({
                    user_id: userId,
                    source_conversation_id: conversationId,
                    content: memory.content,
                    embedding: embedding,
                    type: memory.type || 'general',
                    confidence: memory.confidence || 0.8,
                    scope: 'conversation', // Changed from 'persistent' to isolate conversations
                    metadata: {
                        extractedFrom: 'conversation',
                        messageCount: messagesToProcess.length,
                    }
                });

            if (error) {
                console.error('[Memory:Sync] Error storing memory:', error);
            }
        }

        console.log(`[Memory:Sync] Stored ${memories.length} memories for user ${userId.substring(0, 8)}`);

    } catch (error) {
        console.error('[Memory:Sync] Background processing failed:', error);
    }
}

/**
 * Extract important memories from messages
 * This is a simple implementation - you can enhance with AI
 */
async function extractMemories(messages: Array<{ role: string; content: string }>) {
    const memories: Array<{ content: string; type: string; confidence: number }> = [];

    // Simple extraction: look for user preferences, facts, etc.
    for (const message of messages) {
        if (message.role === 'user') {
            // Extract potential memories from user messages
            const content = message.content.toLowerCase();

            // Example: detect preferences
            if (content.includes('i like') || content.includes('i prefer') || content.includes('my favorite')) {
                memories.push({
                    content: message.content,
                    type: 'preference',
                    confidence: 0.9
                });
            }

            // Example: detect facts about the user
            if (content.includes('my name is') || content.includes('i am') || content.includes('i work')) {
                memories.push({
                    content: message.content,
                    type: 'personal_info',
                    confidence: 0.95
                });
            }

            // Store important questions/topics
            if (message.content.length > 50 && message.content.includes('?')) {
                memories.push({
                    content: message.content,
                    type: 'question',
                    confidence: 0.7
                });
            }
        }
    }

    return memories;
}

/**
 * Generate embedding for text
 * TODO: Implement with your embedding model (OpenAI, Gemini, etc.)
 */
async function generateEmbedding(text: string): Promise<number[]> {
    // Placeholder: return zero vector
    // In production, call your embedding API
    const dimension = 768; // Adjust based on your model
    return new Array(dimension).fill(0);

    /* Example with OpenAI:
    const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-embedding-ada-002',
            input: text
        })
    });
    const data = await response.json();
    return data.data[0].embedding;
    */
}
