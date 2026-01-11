/**
 * Backfill Memory Bank from Existing Conversations
 * 
 * POST /api/memory/backfill
 * Processes all existing conversations and extracts memories
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

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Get all conversations for this user
        const { data: conversations, error: convError } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', userId)
            .eq('is_deleted', false);

        if (convError) {
            console.error('[Memory:Backfill] Error fetching conversations:', convError);
            return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
        }

        if (!conversations || conversations.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No conversations to process",
                conversationsProcessed: 0,
                memoriesCreated: 0
            });
        }

        let totalMemoriesCreated = 0;

        // Process each conversation
        for (const conversation of conversations) {
            // Get messages for this conversation
            const { data: messages, error: msgError } = await supabase
                .from('messages')
                .select('role, content, created_at')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: true });

            if (msgError || !messages || messages.length === 0) {
                continue;
            }

            // Extract memories from messages
            const memories = extractMemoriesFromMessages(messages);

            // Store memories
            for (const memory of memories) {
                const embedding = await generatePlaceholderEmbedding();

                const { error: insertError } = await supabase
                    .from('memory_bank')
                    .insert({
                        user_id: userId,
                        source_conversation_id: conversation.id,
                        content: memory.content,
                        embedding: embedding,
                        type: memory.type,
                        confidence: memory.confidence,
                        scope: 'conversation', // Isolate to source conversation
                        metadata: {
                            backfilled: true,
                            originalDate: memory.originalDate
                        }
                    });

                if (!insertError) {
                    totalMemoriesCreated++;
                }
            }
        }

        console.log(`[Memory:Backfill] Processed ${conversations.length} conversations, created ${totalMemoriesCreated} memories for user ${userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            conversationsProcessed: conversations.length,
            memoriesCreated: totalMemoriesCreated
        });

    } catch (error) {
        console.error('[Memory:Backfill] Error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * Extract memories from messages
 */
function extractMemoriesFromMessages(messages: Array<{ role: string; content: string; created_at: string }>) {
    const memories: Array<{ content: string; type: string; confidence: number; originalDate: string }> = [];

    for (const message of messages) {
        if (message.role !== 'user') continue;

        const content = message.content.toLowerCase();

        // Extract preferences
        if (content.includes('i like') || content.includes('i prefer') || content.includes('my favorite')) {
            memories.push({
                content: message.content,
                type: 'preference',
                confidence: 0.9,
                originalDate: message.created_at
            });
        }

        // Extract personal info
        if (content.includes('my name is') || content.includes('i am') || content.includes('i work')) {
            memories.push({
                content: message.content,
                type: 'personal_info',
                confidence: 0.95,
                originalDate: message.created_at
            });
        }

        // Extract important questions
        if (message.content.length > 50 && message.content.includes('?')) {
            memories.push({
                content: message.content,
                type: 'question',
                confidence: 0.7,
                originalDate: message.created_at
            });
        }

        // Extract general important messages (longer messages)
        if (message.content.length > 100 && memories.length < 50) {
            memories.push({
                content: message.content,
                type: 'general',
                confidence: 0.6,
                originalDate: message.created_at
            });
        }
    }

    return memories;
}

/**
 * Generate placeholder embedding
 * TODO: Replace with actual embedding generation
 */
async function generatePlaceholderEmbedding(): Promise<number[]> {
    const dimension = 768;
    return new Array(dimension).fill(0);
}
