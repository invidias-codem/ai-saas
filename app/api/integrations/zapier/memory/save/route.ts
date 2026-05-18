import { NextResponse } from 'next/server';
import { authenticateZapierRequest, assertZapierWorkspaceAccess, getZapierWorkspaceApiKeyConfigHint } from '@/lib/integrations/zapier/auth';
import { buildZapierMemoryMetadata, normalizeZapierTags } from '@/lib/integrations/zapier/normalizers';
import { createZapierErrorResponse, createZapierSuccessResponse } from '@/lib/integrations/zapier/responses';
import { zapierSaveMemoryRequestSchema } from '@/lib/integrations/zapier/schemas';
import { logZapierIntegrationEvent } from '@/lib/integrations/zapier/telemetry';
import { storeMemory } from '@/lib/memory/vectorStore';

export const dynamic = 'force-dynamic';

const OPERATION = 'save_memory_to_workspace';

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
    const parsed = zapierSaveMemoryRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createZapierErrorResponse({
          operation: OPERATION,
          workspaceId: typeof body?.workspaceId === 'string' ? body.workspaceId : null,
          code: 'invalid_payload',
          message: 'Invalid Zapier memory save payload.',
          warnings: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
        }),
        { status: 400 }
      );
    }

    const input = parsed.data;
    workspaceId = input.workspaceId;

    await assertZapierWorkspaceAccess(auth, workspaceId);

    const metadata = buildZapierMemoryMetadata(input);
    const tags = normalizeZapierTags(input.payload.tags);

    const memoryId = await storeMemory(
      auth.ownerUserId,
      input.payload.content,
      input.payload.memoryType,
      {
        ...metadata,
        tags,
        zapierKeyId: auth.integrationKeyId,
      },
      {
        scope: 'workspace',
        workspaceId,
      }
    );

    if (!memoryId) {
      logZapierIntegrationEvent('memory_save_failed', {
        workspaceId,
        sourceApp: input.sourceApp,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
      });

      return NextResponse.json(
        createZapierErrorResponse({
          operation: OPERATION,
          workspaceId,
          code: 'memory_write_blocked',
          message: 'Memory could not be stored.',
        }),
        { status: 500 }
      );
    }

    logZapierIntegrationEvent('memory_saved', {
      workspaceId,
      sourceApp: input.sourceApp,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      memoryId,
      ownerUserId: auth.ownerUserId,
    });

    return NextResponse.json(
      createZapierSuccessResponse({
        operation: OPERATION,
        workspaceId,
        result: {
          memoryId,
          stored: true,
          scope: 'workspace',
          tags,
        },
      })
    );
  } catch (error) {
    const authResponse = mapAuthErrorToResponse(error, workspaceId);
    if (authResponse) return authResponse;

    console.error('[ZAPIER_MEMORY_SAVE] Error:', error);
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code: 'internal_error',
        message: 'Internal server error.',
        retryable: false,
      }),
      { status: 500 }
    );
  }
}
