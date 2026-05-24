import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security/apiAuth';
import { StorageState, EmbeddingTier, UploadDocumentRequest } from '@/lib/types/documents';
import { createDocument, saveDocumentChunks } from '@/lib/documents/store';
import { extractDocumentText } from '@/lib/documents/extractText';
import { chunkDocumentText } from '@/lib/documents/chunkDocument';
import { embedDocumentChunk } from '@/lib/documents/indexDocument';
import { getStorageClient, getStorageProjectId } from '@/lib/gcp/storage';

export async function POST(req: Request) {
  try {
    const user = await requireAuth();

    let body: UploadDocumentRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { workspaceId, filename, mimeType, storageUri, base64Data, parentId } = body;

    if (!workspaceId || !filename || !mimeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!storageUri && !base64Data) {
      return NextResponse.json({ error: 'Must provide either storageUri or base64Data' }, { status: 400 });
    }

    let buffer: Buffer;

    if (base64Data) {
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      // Fetch from GCS
      try {
        const storage = getStorageClient();
        const projectId = getStorageProjectId();
        const bucketName = `genie-uploads-${projectId}`;
        
        // storageUri is expected to be gs://bucketName/path/to/file
        const filePath = storageUri!.replace(`gs://${bucketName}/`, '');
        const file = storage.bucket(bucketName).file(filePath);
        
        const [fileContents] = await file.download();
        buffer = fileContents;
      } catch (gcsErr: any) {
        console.error('[UploadRoute] Failed to download from GCS:', gcsErr);
        return NextResponse.json({ error: 'Failed to retrieve file from storage' }, { status: 500 });
      }
    }

    // 1. Extract Text
    const extracted = await extractDocumentText(buffer, mimeType);
    const rawText = extracted.text;

    // 2. Determine Embedding Tier
    // High res for PDFs or large documents, Standard for small text.
    let tier = EmbeddingTier.STANDARD_768;
    if (mimeType === 'application/pdf' || rawText.length > 20000) {
      tier = EmbeddingTier.HIGH_RES_3076;
    }

    // 3. Create Document Row (WARM)
    let nextVersion = 1;
    if (parentId) {
      const { getDocument } = await import('@/lib/documents/store');
      const parentDoc = await getDocument(parentId, workspaceId);
      if (parentDoc) {
         nextVersion = (parentDoc.version || 1) + 1;
      }
    }

    const doc = await createDocument({
      workspace_id: workspaceId,
      user_id: user.userId,
      filename,
      mime_type: mimeType,
      storage_uri: storageUri || '',
      storage_state: StorageState.WARM,
      content_raw: rawText,
      embedding_tier: tier,
      parent_id: parentId,
      version: nextVersion
    });

    // 4. Chunk Text
    const textChunks = chunkDocumentText(rawText, { maxTokens: 512, overlapPercentage: 0.1 });

    // 5. Generate Embeddings and Save Chunks
    // We batch process embeddings to avoid hitting rate limits instantly, but for now map sequentially or in small parallel batches.
    const chunksToSave = [];
    for (const chunk of textChunks) {
      const embedding = await embedDocumentChunk(chunk.content, tier);
      
      chunksToSave.push({
        document_id: doc.id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        embedding_768: tier === EmbeddingTier.STANDARD_768 ? embedding : undefined,
        embedding_3076: tier === EmbeddingTier.HIGH_RES_3076 ? embedding : undefined,
      });
    }

    if (chunksToSave.length > 0) {
      await saveDocumentChunks(chunksToSave);
    }

    // PHASE 3: Audit Lineage if parent exists
    if (parentId) {
       try {
         const { computeSemanticDrift } = await import('@/lib/documents/delta/vectorDiff');
         const driftedChunks = await computeSemanticDrift(parentId, doc.id, workspaceId);
         
         if (driftedChunks.length > 0) {
            const { Client } = await import("@upstash/qstash");
            const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const targetUrl = `${baseUrl}/api/documents/audit-worker`;

            if (qstash) {
              await qstash.publishJSON({
                 url: targetUrl,
                 body: { oldDocId: parentId, newDocId: doc.id, workspaceId, driftedChunks },
                 retries: 3
              });
            } else {
              // Local fallback for development
              fetch(targetUrl, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ oldDocId: parentId, newDocId: doc.id, workspaceId, driftedChunks })
              }).catch(e => console.error('[Local Audit Fallback] Error:', e));
            }
         }
       } catch (auditErr) {
         console.error('[UploadRoute] Failed to trigger delta audit:', auditErr);
       }
    }

    // 6. Return response
    return NextResponse.json({
      id: doc.id,
      workspaceId: doc.workspace_id,
      filename: doc.filename,
      storageState: doc.storage_state,
      embeddingTier: doc.embedding_tier,
      chunkCount: chunksToSave.length
    });

  } catch (error: any) {
    console.error('[UploadRoute] Error processing document upload:', error);
    if (error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
