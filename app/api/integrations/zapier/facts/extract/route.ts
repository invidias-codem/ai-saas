import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authenticateZapierRequest, assertZapierWorkspaceAccess, getZapierWorkspaceApiKeyConfigHint } from '@/lib/integrations/zapier/auth';
import { createZapierErrorResponse, createZapierSuccessResponse } from '@/lib/integrations/zapier/responses';
import { zapierExtractFactsRequestSchema } from '@/lib/integrations/zapier/schemas';
import { logZapierIntegrationEvent } from '@/lib/integrations/zapier/telemetry';
import { extractFactsFromConversation } from '@/lib/agents/factExtractor';
import { storeMemory } from '@/lib/memory/vectorStore';

export const dynamic = 'force-dynamic';

const OPERATION = 'extract_facts_from_payload';

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
    const parsed = zapierExtractFactsRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        createZapierErrorResponse({
          operation: OPERATION,
          workspaceId: typeof body?.workspaceId === 'string' ? body.workspaceId : null,
          code: 'invalid_payload',
          message: 'Invalid Zapier fact extraction payload.',
          warnings: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
        }),
        { status: 400 }
      );
    }

    const input = parsed.data;
    workspaceId = input.workspaceId;

    await assertZapierWorkspaceAccess(auth, workspaceId);

    const facts = await extractFactsFromConversation(input.payload.text, '');

    const storedMemoryIds: string[] = [];
    for (const fact of facts) {
      const memoryId = await storeMemory(
        auth.ownerUserId,
        fact.value,
        'fact',
        {
          integration: 'zapier',
          sourceApp: input.sourceApp,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
          sourceUrl: input.sourceUrl ?? null,
          title: input.userVisibleTitle ?? null,
          schemaHint: input.payload.schemaHint ?? null,
          extractedFactType: fact.type,
          extractedConfidence: fact.confidence,
          zapierKeyId: auth.integrationKeyId,
          extractionRequestId: randomUUID(),
          ...input.metadata,
        },
        {
          scope: 'workspace',
          workspaceId,
        }
      );

      if (memoryId) {
        storedMemoryIds.push(memoryId);
      }
    }

    logZapierIntegrationEvent('facts_extracted', {
      workspaceId,
      sourceApp: input.sourceApp,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      factCount: facts.length,
      storedMemoryCount: storedMemoryIds.length,
      ownerUserId: auth.ownerUserId,
    });

    return NextResponse.json(
      createZapierSuccessResponse({
        operation: OPERATION,
        workspaceId,
        result: {
          facts: facts.map((fact) => ({
            type: fact.type,
            content: fact.value,
            confidence: fact.confidence,
          })),
          storedMemoryIds,
        },
      })
    );
  } catch (error) {
    const authResponse = mapAuthErrorToResponse(error, workspaceId);
    if (authResponse) return authResponse;

    console.error('[ZAPIER_FACTS_EXTRACT] Error:', error);
    return NextResponse.json(
      createZapierErrorResponse({
        operation: OPERATION,
        workspaceId,
        code: 'fact_extraction_failed',
        message: 'Fact extraction failed.',
        retryable: true,
      }),
      { status: 500 }
    );
  }
}
