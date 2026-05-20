import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { requireAuth, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { validateRequestSize } from '@/lib/security/inputValidation';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import type { UcolRequestPacket, UcolRoutingDecision } from '@/lib/ucol/routing/types';
import type { RuntimeContextResult } from '@/lib/ucol/runtimeContextResolver';
import type { User } from '@clerk/nextjs/server';
import type { FileAttachmentInput } from '@/lib/types/attachments';

export interface SessionSetupOptions {
    req: Request;
    maxRequestSizeBytes: number;
    surface: 'web' | 'api';
    rateLimitFeature?: 'ai' | 'query' | 'mutation' | 'webhook';
    strictValidation?: boolean;
}

export interface SessionSetupResult {
    errorResponse?: NextResponse;
    user?: any;
    clerkUser?: User;
    ip?: string;
    body?: any;
    resolvedContext?: RuntimeContextResult;
    requestPacket?: UcolRequestPacket;
    routingDecision?: UcolRoutingDecision;
}

export async function setupUcolSession({
    req,
    maxRequestSizeBytes,
    surface,
    rateLimitFeature = 'ai',
    strictValidation = false
}: SessionSetupOptions): Promise<SessionSetupResult> {
    const user = await requireAuth();
    const clerkUser = await currentUser();
    const ip = getClientIP(req);

    if (!clerkUser) {
        return { errorResponse: NextResponse.json({ error: 'User profile not found' }, { status: 401 }) };
    }

    const rateLimit = await limitApiEndpoint(user.userId, ip, rateLimitFeature);
    if (!rateLimit.success) {
        return {
            errorResponse: NextResponse.json(
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
            )
        };
    }

    const body = await req.json();
    validateRequestSize(body, maxRequestSizeBytes);

    const rawInput = body.prompt || body.currentUserPrompt || '';
    const fileData = body.fileData as FileAttachmentInput | undefined;
    const messages = body.messages || [];

    if (rawInput && (typeof rawInput !== 'string' || rawInput.length > 50000)) {
        return { errorResponse: NextResponse.json({ error: 'Validation Error', details: 'Prompt must be a string up to 50,000 characters' }, { status: 400 }) };
    }

    if (messages && Array.isArray(messages) && messages.length > 100) {
        return { errorResponse: NextResponse.json({ error: 'Validation Error', details: 'Maximum 100 messages allowed in history' }, { status: 400 }) };
    }

    const conversationId = body.conversationId;
    const workspaceId = body.workspaceId;
    const operatingProfileId = body.operatingProfileId;
    const operatingProfileMode = body.operatingProfileMode;

    const resolvedContext = await resolveRuntimeContext({ 
        userId: user.userId, 
        surface, 
        conversationId, 
        workspaceId, 
        operatingProfileId, 
        fallbackMode: operatingProfileMode,
        strictValidation 
    });

    if (resolvedContext.error) {
        return { errorResponse: NextResponse.json({ error: resolvedContext.error.message }, { status: resolvedContext.error.status || 400 }) };
    }

    const requestPacket: UcolRequestPacket = {
        requestId: req.headers.get('x-request-id') || randomUUID(),
        userId: user.userId,
        workspaceId: resolvedContext.workspaceId || resolvedContext.ucolContext?.workspaceId || '',
        conversationId: resolvedContext.conversationId || conversationId,
        surface,
        rawInput,
        attachments: fileData ? [{
            id: 'primary-upload',
            type: 'document',
            mimeType: fileData.mimeType || fileData.type || 'text/plain',
            metadata: {
                providedByRoute: true,
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
        context: resolvedContext.ucolContext,
        agentMode: resolvedContext.mode,
        signals: {
            hasAttachments: Boolean(fileData),
            messageHistoryCount: Array.isArray(messages) ? messages.length : 0,
            profile: resolvedContext.profile,
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

    return {
        user,
        clerkUser,
        ip,
        body,
        resolvedContext,
        requestPacket,
        routingDecision,
    };
}
