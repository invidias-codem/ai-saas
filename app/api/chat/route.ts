// app/api/chat/route.ts
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { waitUntil } from '@vercel/functions';
import { runPostGenerationPipeline } from '@/lib/ucol/postGenerationPipeline';
import {
    generateConversationReply,
    ConversationRequestSchema
} from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { promptSchema, validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import type { AgentMode } from '@/lib/llm/types';
import type { RuntimeProfileSignals } from '@/lib/workspaces/runtimeMode';
import type { UcolRequestPacket, UcolResolvedContext } from '@/lib/ucol/routing/types';
import type { FileAttachmentInput } from '@/lib/types/attachments';


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

        const { prompt, conversationId, fileData, messages } = body as {
            prompt: string;
            conversationId?: string;
            fileData?: FileAttachmentInput;
            messages?: Array<{ role: string; text: string }>;
        };

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

        if (fileData) {
            const fileValidation = fileUploadSchema.safeParse(fileData);
            if (!fileValidation.success) {
                return NextResponse.json(
                    { error: 'Validation Error', details: fileValidation.error.flatten() },
                    { status: 400 }
                );
            }

            if (fileData.base64Data) {
                const estimatedSize = fileData.base64Data.length * 0.75;
                if (estimatedSize > 5 * 1024 * 1024) {
                    return NextResponse.json(
                        { error: 'File too large', details: 'Maximum inline file size is 5MB' },
                        { status: 400 }
                    );
                }
            }
        }

        const resolved = await resolveRuntimeContext({ userId: user.userId, surface: 'web', conversationId, strictValidation: false });
        const effectiveMode = resolved.mode;

        const requestPacket: UcolRequestPacket = {
            requestId: randomUUID(),
            userId: user.userId,
            workspaceId: resolved.ucolContext.workspaceId,
            conversationId,
            surface: 'web',
            rawInput: prompt,
            attachments: fileData ? [{
                id: 'primary-upload',
                type: 'document',
                mimeType: fileData.mimeType || fileData.type,
                metadata: {
                    providedByChatRoute: true,
                    name: fileData.name,
                    fileUri: fileData.fileUri,
                    sizeBytes: fileData.sizeBytes,
                    storageProvider: fileData.storageProvider,
                },
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
            context: resolved.ucolContext,
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
            fileData: fileData ? {
                name: fileData.name,
                type: fileData.type,
                mimeType: fileData.mimeType || fileData.type,
                sizeBytes: fileData.sizeBytes,
                base64Data: fileData.base64Data,
                fileUri: fileData.fileUri,
                storageProvider: fileData.storageProvider,
            } : undefined,
            mode: effectiveMode
        };

        const validationResult = ConversationRequestSchema.safeParse(requestPayload);
        if (validationResult.success === false) {
            return NextResponse.json({ error: 'Validation Error', details: validationResult.error.flatten() }, { status: 400 });
        }

        const result = await generateConversationReply(
            {
                userId: user.userId,
                clerkUser,
                request: validationResult.data
            },
            {
                mode: effectiveMode,
                memoryPlan: routingDecision.memoryPlan,
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

                if (fullText) {
                    await runPostGenerationPipeline({
                        userId: user.userId,
                        conversationId,
                        workspaceId: resolved.ucolContext.workspaceId,
                        operatingProfileId: resolved.ucolContext.operatingProfileId,
                        operatingProfileMode: effectiveMode,
                        requestId: requestPacket.requestId,
                        userQuery: prompt,
                        responseText: fullText,
                        history: messages || [],
                        fileData: fileData || null,
                        modelId: result.debug?.model || 'unknown',
                        cost: 0,
                        bypassCredits: false,
                        featureType: 'chat',
                        routingDecision,
                        userContext: {
                            fullName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'User',
                            email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
                        },
                        saveToMemory: false,
                        persistUserMessage: true,
                    });
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
