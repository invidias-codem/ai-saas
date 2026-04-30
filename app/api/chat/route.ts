// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { waitUntil } from '@vercel/functions';
import {
    generateConversationReply,
    ConversationRequestSchema
} from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { promptSchema, validateRequestSize, ValidationError } from '@/lib/security/inputValidation';
import { resolveAgentModeFromProfile } from '@/lib/workspaces/runtimeMode';
import type { AgentMode } from '@/lib/llm/types';

async function resolveRuntimeMode(userId: string, conversationId?: string): Promise<AgentMode> {
    if (!conversationId || !supabaseAdmin) {
        return 'quality';
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .select('id, user_id, operating_profile_id, workspace_id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (conversationError || !conversation) {
        return 'quality';
    }

    let operatingProfileId = conversation.operating_profile_id ?? null;

    if (!operatingProfileId && conversation.workspace_id) {
        const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('default_operating_profile_id')
            .eq('id', conversation.workspace_id)
            .eq('user_id', userId)
            .maybeSingle();

        operatingProfileId = workspace?.default_operating_profile_id ?? null;
    }

    if (!operatingProfileId) {
        return 'quality';
    }

    const { data: profile } = await supabaseAdmin
        .from('operating_profiles')
        .select('mode, latency_preference, allow_agentic_runs, tool_use_level, retrieval_depth, default_output_style')
        .eq('id', operatingProfileId)
        .eq('user_id', userId)
        .maybeSingle();

    return resolveAgentModeFromProfile(profile);
}

export async function POST(req: Request) {
    try {
        const user = await requireAuth();
        const clerkUser = await currentUser();
        const ip = getClientIP(req);

        if (!clerkUser) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
        }

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

        const body = await req.json();
        validateRequestSize(body, 5 * 1024 * 1024);

        const { prompt, conversationId, fileData, messages } = body;

        const promptValidation = promptSchema.safeParse(prompt);
        if (!promptValidation.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: 'Prompt must be between 1 and 50,000 characters' },
                { status: 400 }
            );
        }

        if (messages && Array.isArray(messages) && messages.length > 100) {
            return NextResponse.json(
                { error: 'Validation Error', details: 'Maximum 100 messages allowed in history' },
                { status: 400 }
            );
        }

        const effectiveMode = await resolveRuntimeMode(user.userId, conversationId);

        const requestPayload = {
            messages: [...(messages || []), { role: 'user', text: prompt }],
            fileData: fileData?.base64Data,
            mimeType: fileData?.type,
            mode: effectiveMode
        };

        const validationResult = ConversationRequestSchema.safeParse(requestPayload);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Validation Error', details: validationResult.error.flatten() }, { status: 400 });
        }

        if (conversationId && supabaseAdmin) {
            const { error: dbError } = await supabaseAdmin
                .from('messages')
                .insert({
                    conversation_id: conversationId,
                    role: 'user',
                    content: prompt
                });
            if (dbError) console.error('Failed to persist user message:', dbError);
        }

        const result = await generateConversationReply(
            {
                userId: user.userId,
                clerkUser,
                request: validationResult.data
            },
            {
                mode: effectiveMode
            }
        );

        const [clientStream, dbStream] = result.stream.tee();

        waitUntil((async () => {
            try {
                const reader = dbStream.getReader();
                const decoder = new TextDecoder();
                let fullText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullText += decoder.decode(value, { stream: true });
                }

                if (conversationId && supabaseAdmin && fullText) {
                    const { error: botDbError } = await supabaseAdmin
                        .from('messages')
                        .insert({
                            conversation_id: conversationId,
                            role: 'bot',
                            content: fullText
                        });
                    if (botDbError) console.error('Failed to persist bot response:', botDbError);
                }
            } catch (err) {
                console.error('Background DB persistence failed:', err);
            }
        })());

        return new NextResponse(clientStream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'X-Debug-Model': result.debug?.model || 'unknown',
                'X-Debug-Agent-Mode': effectiveMode,
            }
        });

    } catch (error: any) {
        console.error('Genie API Error:', error);

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: 'Validation Error',
                details: error.message
            }, { status: 400 });
        }

        if (error?.status === 429 || error?.toString().includes('429')) {
            return NextResponse.json({
                error: 'Too Many Requests',
                details: 'The agent is currently experiencing high load. Please try again in a moment.'
            }, { status: 429 });
        }

        return NextResponse.json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : error.message
        }, { status: 500 });
    }
}
