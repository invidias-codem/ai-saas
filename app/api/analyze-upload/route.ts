import { NextResponse } from 'next/server';
import { ConversationRequestSchema, generateConversationReply } from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { createPersonaSession } from '@/lib/consultant/personaSession';
import { decompressLzStringPayload } from '@/lib/uploadCompression';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const clerkUser = await (await import('@clerk/nextjs/server')).currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
    }

    const body = await req.json();

    const normalized = {
      ...body,
      mode: body.mode || 'quality',
      fileData: body.fileData ? decompressLzStringPayload(body.fileData) : undefined,
    };

    const validationResult = ConversationRequestSchema.safeParse(normalized);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const resolved = await resolveRuntimeContext({
      userId: user.userId,
      surface: 'web',
      conversationId: null,
      strictValidation: false,
    });

    const routingDecision = buildInitialRoutingDecision({
      request: {
        requestId: crypto.randomUUID(),
        userId: user.userId,
        workspaceId: resolved.ucolContext.workspaceId,
        surface: 'api',
        rawInput: validationResult.data.messages.at(-1)?.text || '',
        attachments: validationResult.data.fileData
          ? [
              {
                id: 'upload-analyzer',
                type: 'document',
                mimeType: validationResult.data.fileData.mimeType || validationResult.data.fileData.type || 'application/octet-stream',
                metadata: {
                  name: validationResult.data.fileData.name || 'uploaded_file',
                  sizeBytes: validationResult.data.fileData.sizeBytes,
                  fileUri: validationResult.data.fileData.fileUri,
                  storageProvider: validationResult.data.fileData.storageProvider,
                },
              },
            ]
          : [],
        trustContext: {
          canUseExternalActions: false,
          canUseSensitiveTools: false,
          requestSourceTrust: 'direct_user',
        },
        createdAt: new Date().toISOString(),
      },
      context: resolved.ucolContext,
      agentMode: normalized.mode,
      signals: {
        hasAttachments: Boolean(validationResult.data.fileData),
        messageHistoryCount: Array.isArray(validationResult.data.messages) ? validationResult.data.messages.length : 0,
        profile: resolved.profile,
      },
    });

    const workspacePersona = resolved.ucolContext.workspaceId
      ? await (async () => {
          const { supabaseAdmin } = await import('@/lib/supabaseClient');
          if (!supabaseAdmin) return null;
          const { data } = await supabaseAdmin
            .from('workspace_personas')
            .select('content')
            .eq('workspace_id', resolved.ucolContext.workspaceId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return data?.content || null;
        })()
      : null;

    const personaSession = workspacePersona
      ? createPersonaSession('custom', crypto.randomUUID(), workspacePersona)
      : undefined;

    const reply = await generateConversationReply(
      {
        userId: user.userId,
        clerkUser,
        request: validationResult.data,
        conversationId: null,
      },
      {
        mode: normalized.mode,
        memoryPlan: routingDecision.memoryPlan,
        personaSession,
      }
    );

    return new NextResponse(reply.stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Debug-Model': reply.debug?.model || 'unknown',
        'X-UCOL-Task': 'file_upload_analyzer',
        'X-UCOL-Target': routingDecision.targetNode || '',
      },
    });
  } catch (error: any) {
    const handled = handleAuthError(error);
    if (handled) return handled;
    return NextResponse.json(
      { error: 'Internal Server Error', details: process.env.NODE_ENV === 'production' ? 'Unexpected error' : error.message },
      { status: 500 }
    );
  }
}
