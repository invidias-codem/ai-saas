// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { waitUntil } from '@vercel/functions';
import {
    generateConversationReply,
    ConversationRequestSchema
} from '@/lib/llm/conversationEngine';

export async function POST(req: Request) {
    try {
        // 1. Authenticate User
        const { userId } = await auth();
        const clerkUser = await currentUser();

        if (!userId || !clerkUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validate Input
        const body = await req.json();
        const { prompt, conversationId, fileData, messages, mode } = body;

        // Ensure payload matches schema (adapter)
        const requestPayload = {
            messages: [...(messages || []), { role: 'user', text: prompt }],
            fileData: fileData?.base64Data, // conversationEngine expects base64 string
            mimeType: fileData?.type,
            mode: mode // Pass agent mode
        };

        const validationResult = ConversationRequestSchema.safeParse(requestPayload);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Validation Error', details: validationResult.error.flatten() }, { status: 400 });
        }

        // 3. Persist USER Message to Supabase (Immediate consistency)
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

        // 4. Generate Reply (Stream)
        const result = await generateConversationReply(
            {
                userId,
                clerkUser,
                request: validationResult.data
            },
            {
                mode: mode // explicitly pass mode option
            }
        );

        // 5. Tee the stream: One for Client, One for DB Persistence
        const [clientStream, dbStream] = result.stream.tee();

        // 6. Background: Accumulate stream and save to Supabase
        waitUntil((async () => {
            try {
                const reader = dbStream.getReader();
                const decoder = new TextDecoder();
                let fullText = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullText += decoder.decode(value, { stream: true });
                }

                // Determine user intent for graph
                // (Done inside conversationEngine side-effects, but we need DB persistence here)

                if (conversationId && supabaseAdmin && fullText) {
                    const { error: botDbError } = await supabaseAdmin
                        .from('messages')
                        .insert({
                            conversation_id: conversationId,
                            role: 'bot',
                            content: fullText
                        });
                    if (botDbError) console.error("Failed to persist bot response:", botDbError);
                }
            } catch (err) {
                console.error("Background DB persistence failed:", err);
            }
        })());

        // 7. Return Stream to Client
        return new NextResponse(clientStream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "X-Debug-Model": result.debug?.model || "unknown",
            }
        });

    } catch (error: any) {
        console.error('Genie API Error:', error);

        // Handle Rate Limits gracefully
        if (error?.status === 429 || error?.toString().includes('429')) {
            return NextResponse.json({
                error: 'Too Many Requests',
                details: 'The agent is currently experiencing high load. Please try again in a moment or switch to "Standard" mode.'
            }, { status: 429 });
        }

        return NextResponse.json({
            error: 'Internal Server Error',
            details: error.message
        }, { status: 500 });
    }
}
