import { NextResponse } from 'next/server';
import { ConversationRequestSchema, generateConversationReply } from '@/lib/llm/conversationEngine';
import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import { buildInitialRoutingDecision } from '@/lib/ucol/routing/decision';
import { createPersonaSession } from '@/lib/consultant/personaSession';
import { fileUploadSchema, ValidationError } from '@/lib/security/inputValidation';
import { MAX_CHAT_IMAGE_BYTES, MAX_CHAT_IMAGES, MAX_CHAT_IMAGE_TOTAL_BYTES } from '@/lib/types/attachments';
import { decompressLzStringPayload } from '@/lib/uploadCompression';

export const dynamic = 'force-dynamic';

function validatePdfFileData(fileData: {
  base64Data?: string;
  fileUri?: string;
  mimeType?: string;
  name?: string;
}): { valid: boolean; reason?: string } {
  const isPdf =
    (fileData.mimeType || '').toLowerCase() === 'application/pdf' ||
    (fileData.name || '').toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    return { valid: true };
  }

  const raw = fileData.base64Data;
  if (!raw) {
    return { valid: true };
  }

  try {
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.byteLength === 0) {
      return { valid: false, reason: 'Empty file' };
    }

    const header = buffer.slice(0, 5).toString('utf-8');
    if (!header.startsWith('%PDF-')) {
      return { valid: false, reason: 'Invalid PDF structure' };
    }

    const tail = buffer.slice(-10).toString('utf-8');
    if (!tail.includes('%%EOF')) {
      return { valid: false, reason: 'Invalid PDF structure' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Invalid PDF structure' };
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const clerkUser = await (await import('@clerk/nextjs/server')).currentUser();
    if (!clerkUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 401 });
    }

    const body = await req.json();
    const hasMultiImageField = body.fileDataList !== undefined;
    if (hasMultiImageField && (body.fileData || !Array.isArray(body.fileDataList)
      || body.fileDataList.length < 2 || body.fileDataList.length > MAX_CHAT_IMAGES)) {
      return NextResponse.json({ message: `Choose between 2 and ${MAX_CHAT_IMAGES} images per message.` }, { status: 400 });
    }

    // Diagnostic hardening: check the RAW incoming payload (pre-decompression)
    // for a compression-metadata mismatch, so we can catch a client that
    // flagged compression but dropped the flag, or vice versa. Raw base64 is
    // the client's normal post-strip form (the data: URI prefix is removed
    // client-side), so absence of a "data:" prefix is EXPECTED and NOT a warning.
    const rawFileData = body.fileData as
      | { base64Data?: string; __compressed?: boolean; __encoding?: string }
      | undefined;

    if (rawFileData?.__compressed && !rawFileData.base64Data) {
      console.warn('[Analyze] Payload flagged as compressed but no base64Data present.');
    }

    const normalized = {
      ...body,
      mode: (body.fileData || hasMultiImageField) ? 'quality' : (body.mode || 'quality'),
      fileData: body.fileData ? decompressLzStringPayload(body.fileData) : undefined,
      fileDataList: hasMultiImageField ? body.fileDataList : undefined,
    };

    if (normalized.fileData) {
      const pdfCheck = validatePdfFileData(normalized.fileData);
      if (!pdfCheck.valid) {
        console.warn('[analyze-upload] pdf-validation failed:', pdfCheck.reason);
        return NextResponse.json(
          { error: pdfCheck.reason || 'Invalid PDF structure', message: pdfCheck.reason, source: 'pdf-validation' },
          { status: 400 }
        );
      }
    }

    const file = normalized.fileData;
    const mimeType = file?.mimeType || file?.type || normalized.mimeType;
    const isImage = typeof mimeType === 'string' && mimeType.startsWith('image/');
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    const multiImages = normalized.fileDataList as Array<{
      name?: string; type?: string; mimeType?: string; sizeBytes?: number;
      base64Data?: string; fileUri?: string; storageProvider?: string;
    }> | undefined;
    if (multiImages) {
      let aggregateBytes = 0;
      let aggregateInlineChars = 0;
      for (const image of multiImages) {
        const imageType = image?.mimeType || image?.type;
        const parsedImage = fileUploadSchema.safeParse({ ...image, type: imageType, mimeType: imageType });
        if (!parsedImage.success || !allowedImageTypes.includes(imageType || '')
          || !parsedImage.data.sizeBytes || !parsedImage.data.name) {
          return NextResponse.json({ message: 'Each attachment must be a valid JPEG, PNG, WebP, HEIC or HEIF image.' }, { status: 400 });
        }
        if (parsedImage.data.sizeBytes > MAX_CHAT_IMAGE_BYTES
          || (parsedImage.data.base64Data?.length ?? 0) > Math.ceil(MAX_CHAT_IMAGE_BYTES / 3) * 4) {
          return NextResponse.json({ message: 'One of the images is too large. Choose a smaller image.' }, { status: 413 });
        }
        aggregateBytes += parsedImage.data.sizeBytes;
        aggregateInlineChars += parsedImage.data.base64Data?.length ?? 0;
      }
      // Only one <=2MB photo can be inline; remaining images use signed GCS
      // references, keeping the API request under serverless body limits.
      if (aggregateBytes > MAX_CHAT_IMAGE_TOTAL_BYTES || aggregateInlineChars > Math.ceil(2 * 1024 * 1024 / 3) * 4) {
        return NextResponse.json({ message: 'The selected images exceed the per-message size limit.' }, { status: 413 });
      }
    }
    if (isImage) {
      const validImage = fileUploadSchema.safeParse({ ...file, type: mimeType, mimeType });
      if (!validImage.success || !allowedImageTypes.includes(mimeType)) {
        return NextResponse.json({ message: 'Attach a JPEG, PNG, WebP, HEIC, or HEIF image and try again.' }, { status: 400 });
      }
      if ((validImage.data.sizeBytes ?? 0) > MAX_CHAT_IMAGE_BYTES || (validImage.data.base64Data?.length ?? 0) > Math.ceil(MAX_CHAT_IMAGE_BYTES / 3) * 4) {
        return NextResponse.json({ message: 'This photo is too large. Attach a smaller image and try again.' }, { status: 413 });
      }
    }

    const validationResult = ConversationRequestSchema.safeParse(normalized);
    if (!validationResult.success) {
      console.warn('[analyze-upload] schema-validation failed:', validationResult.error.flatten());
      return NextResponse.json(
        { error: 'Validation Error', details: validationResult.error.flatten(), source: 'schema-validation' },
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
        attachments: (multiImages ?? (file ? [file] : [])).map((entry, index) => ({
          id: `upload-analyzer-${index}`,
          type: (entry.mimeType || entry.type || '').startsWith('image/') ? 'image' : 'document',
          mimeType: entry.mimeType || entry.type || 'application/octet-stream',
          metadata: {
            name: entry.name || 'uploaded_file',
            sizeBytes: entry.sizeBytes,
            fileUri: entry.fileUri,
            storageProvider: entry.storageProvider,
          },
        })),
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
        hasAttachments: Boolean(validationResult.data.fileData || validationResult.data.fileDataList?.length),
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
        signal: req.signal,
        memoryPlan: routingDecision.memoryPlan,
        personaSession,
      }
    );

    if ((isImage || multiImages?.length) && reply.debug?.error === 'all_providers_exhausted') {
      await reply.stream.cancel();
      return NextResponse.json({ message: 'The image couldn’t be analyzed right now. Try sending it again.' }, { status: 503 });
    }

    return new NextResponse(reply.stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Debug-Model': reply.debug?.model || 'unknown',
        'X-UCOL-Task': 'file_upload_analyzer',
        'X-UCOL-Target': routingDecision.providerPlan?.preferredModelRefs?.join(',') || '',
      },
    });
  } catch (error: any) {
    const handled = handleAuthError(error);
    if (handled) return handled;
    if (error instanceof ValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal Server Error', details: process.env.NODE_ENV === 'production' ? 'Unexpected error' : error.message },
      { status: 500 }
    );
  }
}
