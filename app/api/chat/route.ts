// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { waitUntil } from '@vercel/functions';
import {
    generateConversationReply,
    ConversationRequestSchema
} from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { promptSchema, messageSchema, validateRequestSize, ValidationError } from '@/lib/security/inputValidation';

export async function POST(req: Request) {
    try {
        // 1. Authenticate User
        const user = await requireAuth();
        const clerkUser = await currentUser();
        const ip = getClientIP(req);

        if (!clerkUser) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
        }

        // 2. Rate Limiting (AI endpoints are expensive - strict limits)
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
        if (!rateLimit.success) {
            return NextResponse.json(
                { error: 'Too many requests', message: 'AI generation rate limit exceeded. Please wait before trying again.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
                        'X-RateLimit-Limit': String(rateLimit.limit),
                        'X-RateLimit-Remaining': String(rateLimit.remaining),
                        'X-RateLimit-Reset': String(rateLimit.reset)
                    }
                }
            );
        }

        // 3. Validate Request Size (prevent DoS)
        const body = await req.json();
        validateRequestSize(body, 5 * 1024 * 1024); // 5MB max

        const { prompt, conversationId, fileData, messages, mode } = body;

        // 4. Validate Input
        // Validate prompt
        const promptValidation = promptSchema.safeParse(prompt);
        if (!promptValidation.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: 'Prompt must be between 1 and 50,000 characters' },
                { status: 400 }
            );
        }

        // Validate messages if provided
        if (messages && Array.isArray(messages)) {
            if (messages.length > 100) {
                return NextResponse.json(
                    { error: 'Validation Error', details: 'Maximum 100 messages allowed in history' },
                    { status: 400 }
                );
            }
        }

        // 5. Prepare Request Payload
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

        // 6. Generate Reply (Stream)
        const result = await generateConversationReply(
            {
                userId: user.userId,
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

        // Handle auth/validation errors
        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: 'Validation Error',
                details: error.message
            }, { status: 400 });
        }

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
