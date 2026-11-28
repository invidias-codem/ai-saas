// app/api/chat/route.ts
//
// Phase 2 refactor: thin transport into RuntimeBridge.
// Route now owns: auth, rate-limit, validation, context resolution,
// credit/entitlement checks, and graceful degradation.
// Everything else (execution, post-gen pipeline, response) is delegated.
import { randomUUID } from 'crypto';
import { withRequestDeadline } from '@/lib/runtime/requestDeadline';
import { withAbort, createDeadline } from '@/lib/runtime/abort';
import { encodeProviderErrorEvent } from '@/lib/media/envelope';
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
import { trackFreeInteraction } from '@/lib/subscription/interaction-tracker';
import { logEvent } from '@/lib/telemetry';

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

export const maxDuration = 300;

export async function POST(req: Request) {
    const requestId = randomUUID();
    try {
        const response = await withRequestDeadline(signal => handleChat(req, signal, requestId), {
            signal: req.signal,
            timeoutMs: 270_000,
            streamError: () => new TextEncoder().encode(encodeProviderErrorEvent({
                provider: 'chat', reason: 'request_deadline',
            })),
        });
        response.headers.set('X-Lattice-Request-Id', requestId);
        return response;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger.warn('[ChatRoute] Request stopped', { requestId, reason });
        if (req.signal.aborted) return new Response(null, { status: 499 });
        const timedOut = reason === 'request_deadline';
        return NextResponse.json({ error: timedOut ? 'Request timed out' : 'Internal Server Error', requestId }, {
            status: timedOut ? 504 : 500,
        });
    }
}

async function handleChat(req: Request, signal: AbortSignal, requestId: string) {
    try {
        const user = await withAbort(requireAuth(), signal);
        const clerkUser = await withAbort(currentUser(), signal);
        const ip = getClientIP(req);

        if (!clerkUser) {
            return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
        }

        const rateLimit = await withAbort(limitApiEndpoint(user.userId, ip, 'ai'), signal);
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

        const body = await withAbort(req.json(), signal);
        validateRequestSize(body, 10 * 1024 * 1024); // 10MB max

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

        const resolved = await withAbort(resolveRuntimeContext({ userId: user.userId, surface: 'web', conversationId, strictValidation: false }), signal);
        let effectiveMode = resolved.mode;

        // --- CREDIT ENFORCEMENT & GRACEFUL DEGRADATION ---
        // Unified ledger: balance comes from supporter_credits (Supabase),
        // not Clerk metadata — same ledger the payment webhooks credit.
        let computeCredits = await withAbort(getUserCredits(user.userId), signal);

        let finalCost = calculateInteractionCost({
            hasAttachments: Boolean(fileData),
            mode: effectiveMode
        });

        const entitlement = checkDocumentEntitlement(clerkUser, computeCredits);

        if (!entitlement.allowed || (!entitlement.isMaster && computeCredits <= 0)) {
            // Graceful Degradation — signal to client that file was gated
            console.error(`[ChatRoute] File upload gated: ${entitlement.reason} — user ${clerkUser.emailAddresses?.[0]?.emailAddress} has ${computeCredits} credits, plan: ${clerkUser.privateMetadata?.plan ?? 'free'}`);
            fileData = undefined;
            documentIds = undefined;
            if (effectiveMode === 'agentic' || effectiveMode === 'reasoning') {
                effectiveMode = 'fast';
            }
            finalCost = 0;
        }
        // --------------------------------------------------

        const requestPacket: UcolRequestPacket = {
            requestId,
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

        // Extract PDF text BEFORE passing to the LLM — intercept and convert binary to text
        let pdfExtractedText: string | null = null;
        if (fileData && (fileData.mimeType === 'application/pdf' || fileData.name?.toLowerCase().endsWith('.pdf'))) {
            try {
                const { extractPdfText } = await import('@/lib/fileProcessing/pdfExtractor');
                pdfExtractedText = await withAbort(extractPdfText(fileData), signal);
                console.error(`[ChatRoute] PDF extracted: ${pdfExtractedText.length} chars from ${fileData.name || 'document'}`);
            } catch (err) {
                signal.throwIfAborted();
                console.error('[ChatRoute] PDF extraction failed:', err);
            }
        }

        // Build the file data for the LLM — strip base64 if PDF was extracted as text
        const normalizedFileData = fileData
            ? pdfExtractedText
                ? {
                    name: fileData.name,
                    type: fileData.type,
                    mimeType: fileData.mimeType || fileData.type,
                    sizeBytes: fileData.sizeBytes,
                    // Send extracted text instead of raw base64
                    extractedText: pdfExtractedText,
                }
                : fileData.fileUri
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

        // Async chunk storage for RAG — fire-and-forget (non-blocking)
        // This runs while the LLM answers Turn 1 using the raw extracted text
        if (pdfExtractedText && pdfExtractedText.trim().length > 0 && resolved.ucolContext.workspaceId && supabaseAdmin) {
            const { storePdfChunks } = await import('@/lib/fileProcessing/chunkEmbedder');
            // Get or create document ID for this file
            const { data: docRecord, error: docError } = await withAbort(supabaseAdmin
                .from('workspace_documents')
                .upsert({
                    workspace_id: resolved.ucolContext.workspaceId,
                    user_id: user.userId,
                    filename: fileData?.name || 'uploaded.pdf',
                    mime_type: 'application/pdf',
                    content_raw: pdfExtractedText.slice(0, 10000), // Store preview
                    embedding_tier: 'STANDARD_768',
                }, { onConflict: 'workspace_id, filename' })
                .select('id')
                .single(), signal);

            if (!docError && docRecord) {
                // Fire-and-forget — don't await, don't block Turn 1 response
                storePdfChunks(docRecord.id, pdfExtractedText)
                    .then(result => {
                        if (result.success) {
                            console.log(`[ChatRoute] RAG chunks stored: ${result.chunkCount} chunks`);
                        } else {
                            console.warn(`[ChatRoute] RAG chunk storage failed: ${result.error}`);
                        }
                    })
                    .catch(err => console.error('[ChatRoute] Unexpected chunk storage error:', err));
            }
        }

        signal.throwIfAborted();
        const result = await withAbort(runRuntimeBridge({
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
                signal.throwIfAborted();
                // Build persona session if workspace has a custom persona
                let personaSession = undefined;
                const workspacePersona = resolved.ucolContext.workspaceId
                    ? await withAbort(loadWorkspacePersona(resolved.ucolContext.workspaceId), signal)
                    : null;
                if (workspacePersona) {
                    const { createPersonaSession } = await import("@/lib/consultant/personaSession");
                    personaSession = createPersonaSession("custom", conversationId || randomUUID(), workspacePersona);
                }

                const reply = await generateConversationReply(
                    {
                        userId: user.userId,
                        clerkUser,
                        request: validationResult.data,
                        conversationId,
                    },
                    {
                        signal,
                        requestId,
                        mode: effectiveMode,
                        memoryPlan: routingDecision.memoryPlan,
                        personaSession,
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
        }), signal);

        // Track free-tier interaction and signal nudge at threshold
        const trackingDeadline = createDeadline(1_000, signal, 'tracking_timeout');
        const tracking = await withAbort(trackFreeInteraction(user.userId), trackingDeadline.signal)
            .catch(() => ({ shouldNudge: false }))
            .finally(trackingDeadline.dispose);
        signal.throwIfAborted();
        if (tracking.shouldNudge) {
            result.headers.set("x-trigger-nudge", "true");
            logEvent({ eventType: 'plg_nudge_shown', userId: user.userId });
        }

        // Signal file upload gated to client
        if (fileData === undefined && body.fileData) {
            result.headers.set("x-file-gated", "true");
        }

        return result;

    } catch (error: any) {
        signal.throwIfAborted();
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
