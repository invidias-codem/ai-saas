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

    let { workspaceId, filename, mimeType, storageUri, base64Data, parentId } = body;

    if (!filename || !mimeType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalise: frontend sends 'default' when no workspace is selected;
    // null is what the DB column (now nullable) expects.
    if (!workspaceId || workspaceId === 'default') {
      workspaceId = null;
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

    // 1. Check if Image
    const isImage = mimeType.startsWith('image/');
    
    // 2. Extract Text (if not image)
    let rawText = '';
    let textChunks: any[] = [];
    if (!isImage) {
      const extracted = await extractDocumentText(buffer, mimeType);
      rawText = extracted.text;
      textChunks = chunkDocumentText(rawText, { maxTokens: 512, overlapPercentage: 0.1 });
    }

    // 3. Determine Embedding Tier
    // High res for PDFs or large documents, Standard for small text, none needed for images (but we store WARM)
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

    // 5. Generate Embeddings and Save Chunks (only if text exists)
    const chunksToSave = [];
    let embeddingFailed = false;

    if (!isImage) {
      for (const chunk of textChunks) {
      let embedding;
      try {
        if (!embeddingFailed) {
          embedding = await embedDocumentChunk(chunk.content, tier);
        }
      } catch (err) {
        console.warn('[UploadRoute] Embedding failed for chunk, saving without embedding:', err);
        embeddingFailed = true; // Stop trying if we hit a 429 or 404
      }
      
      chunksToSave.push({
        document_id: doc.id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        embedding_768: tier === EmbeddingTier.STANDARD_768 && embedding ? embedding : undefined,
        embedding_3076: tier === EmbeddingTier.HIGH_RES_3076 && embedding ? embedding : undefined,
      });
    }
    }

    if (chunksToSave.length > 0) {
      await saveDocumentChunks(chunksToSave);
    }

    // PHASE 3: Audit Lineage if parent exists
    if (parentId) {
       try {
         const { supabaseAdmin } = await import('@/lib/supabaseClient');
         if (!supabaseAdmin) throw new Error("Supabase admin client not initialized");
         const { computeSemanticDrift } = await import('@/lib/documents/delta/vectorDiff');
         const driftedChunks = await computeSemanticDrift(supabaseAdmin, parentId, doc.id);
         
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
