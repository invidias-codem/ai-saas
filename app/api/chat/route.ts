// app/api/chat/route.ts
//
// Phase 2 refactor: thin transport into RuntimeBridge.
// Route now owns: auth, rate-limit, validation, context resolution,
// credit/entitlement checks, and graceful degradation.
// Everything else (execution, post-gen pipeline, response) is delegated.
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { generateConversationReply, ConversationRequestSchema } from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { promptSchema, validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { calculateInteractionCost, deductUserCredits, getUserCredits } from '@/lib/subscription/credits';
import { checkDocumentEntitlement } from '@/lib/entitlements/documents';
import { runRuntimeBridge } from '@/lib/ucol/runtimeBridge';
import { logger } from '@/lib/logger';
import type { UcolRequestPacket } from '@/lib/ucol/routing/types';
import type { FileAttachmentInput } from '@/lib/types/attachments';
import { supabaseAdmin } from '@/lib/supabaseClient';

async function loadWorkspacePersona(workspaceId: string): Promise<string | null> {
  try {
    if (!supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin
      .from('workspace_personas')
      .select('content')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.content) return null;
    return data.content;
  } catch {
    return null;
  }
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

        const { prompt, conversationId, documentIds: rawDocumentIds, messages } = body as {
            prompt: string;
            conversationId?: string;
            documentIds?: string[];
            messages?: Array<{ role: string; text: string }>;
        };
        let fileData = body.fileData as FileAttachmentInput | undefined;

        // Filter out optimistic temp_ IDs that haven't been persisted to the DB yet
        let documentIds = rawDocumentIds?.filter(id => id && !id.startsWith('temp_'));

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
        let effectiveMode = resolved.mode;

        // --- CREDIT ENFORCEMENT & GRACEFUL DEGRADATION ---
        // Unified ledger: balance comes from supporter_credits (Supabase),
        // not Clerk metadata — same ledger the payment webhooks credit.
        let computeCredits = await getUserCredits(user.userId);

        let finalCost = calculateInteractionCost({
            hasAttachments: Boolean(fileData),
            mode: effectiveMode
        });

        const entitlement = checkDocumentEntitlement(clerkUser, computeCredits);

        if (!entitlement.allowed || computeCredits <= 0) {
            // Graceful Degradation
            fileData = undefined;
            documentIds = undefined;
            if (effectiveMode === 'agentic' || effectiveMode === 'reasoning') {
                effectiveMode = 'fast';
            }
            finalCost = 0;
        }
        // --------------------------------------------------

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

        const normalizedFileData = fileData
            ? fileData.fileUri
                ? {
                    name: fileData.name,
                    type: fileData.type,
                    mimeType: fileData.mimeType || fileData.type,
                    sizeBytes: fileData.sizeBytes,
                    fileUri: fileData.fileUri,
                    storageProvider: fileData.storageProvider,
                }
                : {
                    name: fileData.name,
                    type: fileData.type,
                    mimeType: fileData.mimeType || fileData.type,
                    sizeBytes: fileData.sizeBytes,
                    base64Data: fileData.base64Data,
                }
            : undefined;

        const requestPayload = {
            messages: [...(messages || []), { role: 'user', text: prompt }],
            fileData: normalizedFileData,
            documentIds,
            workspaceId: resolved.ucolContext.workspaceId,
            mode: effectiveMode
        };

        const validationResult = ConversationRequestSchema.safeParse(requestPayload);
        if (validationResult.success === false) {
            return NextResponse.json({ error: 'Validation Error', details: validationResult.error.flatten() }, { status: 400 });
        }

        const result = await runRuntimeBridge({
            surface: 'chat',
            session: {
                user,
                clerkUser,
                body: {
                    ...body,
                    prompt,
                    messages,
                    fileData,
                    documentIds,
                    conversationId,
                },
                resolvedContext: resolved,
                requestPacket,
                routingDecision,
            },
            requestId: requestPacket.requestId,
            featureType: 'chat',
            body: {
                ...body,
                prompt,
                messages,
                fileData,
                documentIds,
                conversationId,
            },
            billing: async () => ({
                cost: finalCost,
                bypass: finalCost === 0,
                remaining: Math.max(0, computeCredits),
            }),
            execute: async ({ resolved: ctx, rawInput, messages: msgs, fileData: fData }) => {
                const reply = await generateConversationReply(
                    {
                        userId: user.userId,
                        clerkUser,
                        request: validationResult.data,
                        conversationId,
                    },
                    {
                        mode: effectiveMode,
                        memoryPlan: routingDecision.memoryPlan,
                        systemInstruction: resolved.ucolContext.workspaceId ? (await loadWorkspacePersona(resolved.ucolContext.workspaceId)) ?? undefined : undefined,
                    }
                );

                return {
                    stream: reply.stream,
                    thoughtSignaturePromise: reply.thoughtSignaturePromise,
                    modelId: reply.debug?.model || 'unknown',
                    requestedModelId: reply.requestedModelId,
                    actualModelId: reply.actualModelId,
                    systemProvider: reply.systemProvider,
                    routingDecision,
                };
            },
        });

        return result;

    } catch (error: any) {
        const handled = handleAuthError(error);
        if (handled) return handled;

        if (error instanceof ValidationError) {
            return NextResponse.json({
                error: 'Validation Error',
                details: error.message
            }, { status: 400 });
        }

        logger.error('Genie API Error', {
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });

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
