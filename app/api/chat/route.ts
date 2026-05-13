// app/api/chat/route.ts
import { randomUUID } from 'crypto';
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
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import type { AgentMode } from '@/lib/llm/types';
import type { RuntimeProfileSignals } from '@/lib/workspaces/runtimeMode';
import type { UcolRequestPacket, UcolResolvedContext } from '@/lib/ucol/routing/types';

type ResolvedChatContext = {
    mode: AgentMode;
    context: UcolResolvedContext;
    profile: RuntimeProfileSignals | null;
};

async function resolveChatContext(userId: string, conversationId?: string): Promise<ResolvedChatContext> {
    if (!conversationId || !supabaseAdmin) {
        return {
            mode: 'quality',
            profile: null,
            context: {
                conversationId,
                surface: 'web',
                preWorkspace: true,
                workspaceBacked: false,
                operatingProfileResolved: false,
                allowedMemoryScopes: ['conversation', 'user'],
                notes: ['no conversation id or admin client available; defaulted to general context'],
            },
        };
    }

    const { data: conversation, error: conversationError } = await supabaseAdmin
        .from('conversations')
        .select('id, user_id, operating_profile_id, workspace_id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

    if (conversationError || !conversation) {
        return {
            mode: 'quality',
            profile: null,
            context: {
                conversationId,
                surface: 'web',
                preWorkspace: true,
                workspaceBacked: false,
                operatingProfileResolved: false,
                allowedMemoryScopes: ['conversation', 'user'],
                notes: ['conversation lookup failed or returned no row; defaulted to general context'],
            },
        };
    }

    let operatingProfileId = conversation.operating_profile_id ?? null;
    let workspaceDefaultProfileId: string | null = null;

    if (!operatingProfileId && conversation.workspace_id) {
        const { data: workspace } = await supabaseAdmin
            .from('workspaces')
            .select('default_operating_profile_id')
            .eq('id', conversation.workspace_id)
            .eq('user_id', userId)
            .maybeSingle();

        workspaceDefaultProfileId = workspace?.default_operating_profile_id ?? null;
        operatingProfileId = workspaceDefaultProfileId;
    }

    if (!operatingProfileId) {
        return {
            mode: 'quality',
            profile: null,
            context: {
                workspaceId: conversation.workspace_id ?? undefined,
                conversationId: conversation.id,
                surface: 'web',
                preWorkspace: !conversation.workspace_id,
                workspaceBacked: Boolean(conversation.workspace_id),
                operatingProfileResolved: false,
                allowedMemoryScopes: conversation.workspace_id ? ['conversation', 'workspace', 'user'] : ['conversation', 'user'],
                notes: ['no operating profile resolved from conversation or workspace'],
            },
        };
    }

    const { data: profile } = await supabaseAdmin
        .from('operating_profiles')
        .select('id, mode, latency_preference, allow_agentic_runs, tool_use_level, retrieval_depth, default_output_style')
        .eq('id', operatingProfileId)
        .eq('user_id', userId)
        .maybeSingle();

    const resolvedProfile = (profile as RuntimeProfileSignals | null) ?? null;
    const mode = resolveAgentModeFromProfile(resolvedProfile);

    return {
        mode,
        profile: resolvedProfile,
        context: {
            workspaceId: conversation.workspace_id ?? undefined,
            operatingProfileId: profile?.id,
            conversationId: conversation.id,
            surface: 'web',
            preWorkspace: !conversation.workspace_id,
            workspaceBacked: Boolean(conversation.workspace_id),
            operatingProfileResolved: Boolean(profile?.id),
            allowedMemoryScopes: conversation.workspace_id ? ['conversation', 'workspace', 'user'] : ['conversation', 'user'],
            notes: [
                conversation.operating_profile_id ? 'conversation-specific operating profile resolved' : 'workspace default operating profile resolved',
                workspaceDefaultProfileId ? 'workspace default profile fallback used' : 'no workspace default fallback needed',
            ],
        },
    };
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

        const resolved = await resolveChatContext(user.userId, conversationId);
        const effectiveMode = resolved.mode;

        const requestPacket: UcolRequestPacket = {
            requestId: randomUUID(),
            userId: user.userId,
            workspaceId: resolved.context.workspaceId,
            conversationId,
            surface: 'web',
            rawInput: prompt,
            attachments: fileData ? [{
                id: 'primary-upload',
                type: 'document',
                mimeType: fileData.type,
                metadata: { providedByChatRoute: true },
            }] : [],
            trustContext: {
                canUseExternalActions: false,
                canUseSensitiveTools: false,
                requestSourceTrust: 'direct_user',
            },
            createdAt: new Date().toISOString(),
        };

        const routingDecision = buildInitialRoutingDecision({
            request: requestPacket,
            context: resolved.context,
            agentMode: effectiveMode,
            signals: {
                hasAttachments: Boolean(fileData),
                messageHistoryCount: Array.isArray(messages) ? messages.length : 0,
                profile: resolved.profile,
            },
        });

        console.info('[UCOL] Initial routing decision', {
            requestId: routingDecision.requestId,
            workspaceId: routingDecision.resolvedWorkspaceId,
            operatingProfileId: routingDecision.operatingProfileId,
            intent: routingDecision.intent,
            executionMode: routingDecision.executionPlan.mode,
            providerPlan: routingDecision.providerPlan,
            memoryPlan: routingDecision.memoryPlan,
            rationale: routingDecision.debug.rationale,
        });

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
                'X-Debug-Execution-Mode': routingDecision.executionPlan.mode,
                'X-Debug-Intent': routingDecision.intent.category,
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
