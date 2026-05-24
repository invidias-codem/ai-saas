import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/security/apiAuth';
import { getDocument } from '@/lib/documents/store';
import { StorageState } from '@/lib/types/documents';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuth();
    
    // We expect workspaceId to be passed as a search param for scope validation
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    const doc = await getDocument(params.id, workspaceId);

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verify User has access to this workspace/doc (assuming standard ownership or RLS limits getDocument)
    // Note: If this is a team workspace, user.userId validation might need to check workspace members. 
    // For Phase 1, we assume getDocument with RLS enforces correct access, or it's implicitly scoped to the user.
    if (doc.user_id !== user.userId) {
       // Just a strict check for Phase 1.
       return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (doc.storage_state === StorageState.COLD && doc.storage_uri) {
      try {
        let hydratedText: string | null = null;
        const cacheKey = `doc_hydrate:${doc.id}`;

        const { Redis } = await import('@upstash/redis');
        const redis = process.env.UPSTASH_REDIS_REST_URL 
           ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN || '' }) 
           : null;

        if (redis) {
          hydratedText = await redis.get<string>(cacheKey);
        }

        if (!hydratedText) {
          const { supabaseAdmin } = await import('@/lib/supabaseClient');
          const { LLMArithmeticCompressor } = await import('@/lib/documents/compressor');

          const { data: blobData, error: blobError } = await supabaseAdmin
            .storage
            .from('archived_documents')
            .download(doc.storage_uri);

          if (blobError || !blobData) throw blobError || new Error("Blob missing");

          const buffer = Buffer.from(await blobData.arrayBuffer());
          hydratedText = await LLMArithmeticCompressor.decompress(buffer);
          
          if (redis && hydratedText) {
             await redis.set(cacheKey, hydratedText, { ex: 3600 });
          }
        }

        return NextResponse.json({
          id: doc.id,
          filename: doc.filename,
          mimeType: doc.mime_type,
          storageState: doc.storage_state,
          contentRaw: hydratedText,
          hydrated: true
        });
      } catch (err: any) {
        console.error('[PreviewRoute] Failed to hydrate COLD document:', err);
        return NextResponse.json({ error: 'Failed to hydrate document from cold storage' }, { status: 500 });
      }
    }

    if (doc.storage_state === StorageState.COMPRESSING) {
      return NextResponse.json({ 
        error: 'Document is compressing', 
        message: 'Document is currently being processed by the background worker.' 
      }, { status: 409 });
    }

    // WARM Fast Path
    return NextResponse.json({
      id: doc.id,
      filename: doc.filename,
      mimeType: doc.mime_type,
      storageState: doc.storage_state,
      contentRaw: doc.content_raw
    });

  } catch (error: any) {
    console.error('[PreviewRoute] Error fetching document preview:', error);
    if (error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
