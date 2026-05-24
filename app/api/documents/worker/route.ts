import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { LLMArithmeticCompressor } from '@/lib/documents/compressor';
import { Receiver } from "@upstash/qstash";

const receiver = process.env.QSTASH_CURRENT_SIGNING_KEY 
  ? new Receiver({
      currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || process.env.QSTASH_CURRENT_SIGNING_KEY,
    })
  : null;

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    
    // 1. Webhook Security: Verify QStash Signature
    if (receiver) {
      const signature = req.headers.get("upstash-signature");
      if (!signature) {
        return NextResponse.json({ error: 'Missing upstash-signature header' }, { status: 401 });
      }
      
      const isValid = await receiver.verify({ signature, body: rawBody });
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
    }

    // 2. Fetch the raw content from the database
    const { data: doc, error: fetchError } = await supabaseAdmin
      .from('workspace_documents')
      .select('content_raw, storage_state')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Worker Idempotency: Return 200 OK immediately if already COLD or content is missing
    if (doc.storage_state === 'COLD' || !doc.content_raw) {
      console.log(`[ArchivalWorker] Document ${documentId} is already archived.`);
      return NextResponse.json({ message: 'Document already compressed' }, { status: 200 });
    }

    // 2. Run the sequence-dimension LLM arithmetic compression (Stubbed)
    const compressedBuffer = await LLMArithmeticCompressor.compress(doc.content_raw);

    // 3. Upload the dense binary blob to the private Supabase Storage bucket
    const storagePath = `${documentId}/compressed_payload.bin`;
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('archived_documents')
      .upload(storagePath, compressedBuffer, {
        contentType: 'application/octet-stream',
        upsert: true
      });

    if (uploadError) {
      console.error('[ArchivalWorker] Storage upload failed:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    // 4. Commit atomic transaction via RPC
    const { error: rpcError } = await supabaseAdmin.rpc('commit_document_archival', {
      p_document_id: documentId,
      p_storage_uri: storagePath
    });

    if (rpcError) {
      console.error('[ArchivalWorker] Atomic commit failed:', rpcError);
      return NextResponse.json({ error: 'Commit failed' }, { status: 500 });
    }

    return NextResponse.json({ message: `Successfully archived document ${documentId}` });

  } catch (err: any) {
    console.error('[ArchivalWorker] Task failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
