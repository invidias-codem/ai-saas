import { NextResponse } from 'next/server';
import { authenticateZapierRequest, assertZapierWorkspaceAccess, getZapierWorkspaceApiKeyConfigHint } from '@/lib/integrations/zapier/auth';
import { createZapierErrorResponse, createZapierSuccessResponse } from '@/lib/integrations/zapier/responses';
import { zapierRetrieveContextRequestSchema } from '@/lib/integrations/zapier/schemas';
import { logZapierIntegrationEvent } from '@/lib/integrations/zapier/telemetry';
import { getWorkspaceMemoryContext } from '@/lib/ragMemory';

export const dynamic = 'force-dynamic';

const OPERATION = 'retrieve_relevant_context';

function mapAuthErrorToResponse(error: unknown, workspaceId: string | null) {
  const code = error instanceof Error ? error.message : 'unknown_error';

  if (code === 'auth_required') {
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code,
        message: 'Authorization header required.',
        warnings: [getZapierWorkspaceApiKeyConfigHint()],
      }),
      { status: 401 }
    );
  }

  if (code === 'invalid_api_key') {
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code,
        message: 'Invalid Zapier API key.',
      }),
      { status: 401 }
    );
  }

  if (code === 'workspace_required' || code === 'workspace_not_allowed') {
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code,
        message: 'Workspace access denied for this Zapier credential.',
      }),
      { status: 403 }
    );
  }

  return null;
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;

  try {
    const auth = await authenticateZapierRequest(req);
    const body = await req.json();
    const parsed = zapierRetrieveContextRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createZapierErrorResponse({
          operation: OPERATION,
          workspaceId: typeof body?.workspaceId === 'string' ? body.workspaceId : null,
          code: 'invalid_payload',
          message: 'Invalid Zapier context retrieval payload.',
          warnings: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
        }),
        { status: 400 }
      );
    }

    const input = parsed.data;
    workspaceId = input.workspaceId;

    await assertZapierWorkspaceAccess(auth, workspaceId);

    const ragContext = await getWorkspaceMemoryContext(
      auth.ownerUserId,
      workspaceId,
      input.payload.query,
      input.payload.maxResults
    );

    const items = ragContext.sources.map((source) => ({
      id: source.id,
      title: source.title,
      content: source.content || '',
      type: source.type,
      similarity: source.similarity ?? null,
    }));

    logZapierIntegrationEvent('context_retrieved', {
      workspaceId,
      sourceApp: input.sourceApp,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      resultCount: items.length,
      ownerUserId: auth.ownerUserId,
    });

    return NextResponse.json(
      createZapierSuccessResponse({
        operation: OPERATION,
        workspaceId,
        result: {
          contextSummary: ragContext.contextString,
          items,
          resultCount: items.length,
        },
      })
    );
  } catch (error) {
    const authResponse = mapAuthErrorToResponse(error, workspaceId);
    if (authResponse) return authResponse;

    console.error('[ZAPIER_CONTEXT_RETRIEVE] Error:', error);
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code: 'retrieval_unavailable',
        message: 'Context retrieval unavailable.',
        retryable: true,
      }),
      { status: 500 }
    );
  }
}
