import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { LLMArithmeticCompressor } from '@/lib/documents/compressor';
import { Receiver } from "@upstash/qstash";
import { deltaEngine } from '@/lib/world-model/delta/DeltaEngine';
import { chunkDocumentText } from '@/lib/documents/chunkDocument';

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
    const { oldDocId, newDocId, workspaceId, driftedChunks } = body;

    if (!oldDocId || !newDocId || !driftedChunks) {
      return NextResponse.json({ error: 'Missing required payload parameters' }, { status: 400 });
    }

    if (driftedChunks.length === 0) {
      return NextResponse.json({ message: 'No drifted chunks to audit' }, { status: 200 });
    }

    // 2. Hydrate the COLD blob for the old document
    const { data: oldDoc, error: oldFetchErr } = await supabaseAdmin
      .from('workspace_documents')
      .select('storage_uri, storage_state')
      .eq('id', oldDocId)
      .single();
      
    if (oldFetchErr || !oldDoc || oldDoc.storage_state !== 'COLD' || !oldDoc.storage_uri) {
       return NextResponse.json({ error: 'Old document is not in COLD storage or missing URI' }, { status: 400 });
    }

    const { data: blobData, error: blobError } = await supabaseAdmin
       .storage
       .from('archived_documents')
       .download(oldDoc.storage_uri);
       
    if (blobError || !blobData) throw blobError || new Error("Old blob missing");

    const buffer = Buffer.from(await blobData.arrayBuffer());
    const hydratedOldText = await LLMArithmeticCompressor.decompress(buffer);

    // 3. Slice the decompressed blob deterministically
    const oldChunks = chunkDocumentText(hydratedOldText, { maxTokens: 512, overlapPercentage: 0.1 });

    // 4. Fetch the drifted WARM chunks from Postgres
    const newChunkIndices = driftedChunks.map((c: any) => c.newChunkIndex);
    const { data: newChunksData, error: newFetchErr } = await supabaseAdmin
      .from('document_chunks')
      .select('chunk_index, content')
      .eq('document_id', newDocId)
      .in('chunk_index', newChunkIndices);

    if (newFetchErr || !newChunksData) throw newFetchErr;

    // 5. Run Deep Audit (Delta Engine)
    const auditResults = [];
    let cumulativeDeltaScore = 0;

    for (const newChunk of newChunksData) {
      if (!newChunk.content) continue;
      
      const drifted = driftedChunks.find((d: any) => d.newChunkIndex === newChunk.chunk_index);
      
      // Extract the old chunk text using the exact identical token parameters
      let oldTextContext = "";
      if (drifted && drifted.oldChunkIndex !== null && oldChunks[drifted.oldChunkIndex]) {
        oldTextContext = oldChunks[drifted.oldChunkIndex].content;
      }
      
      // The Delta Engine typically evaluates aiOutput. 
      // We feed it a string that clearly delineates the modification.
      const evaluationText = `
        OLD DOCUMENT CONTEXT:
        ${oldTextContext || "(None - this is a net new addition)"}
        
        NEW DOCUMENT MODIFICATION:
        ${newChunk.content}
      `;

      const results = await deltaEngine.scoreClaims(
        evaluationText,
        newDocId, // session ID
        'DeepAuditWorker' // model name
      );

      const chunkDeltaScore = deltaEngine.computeDeltaScore(results);
      cumulativeDeltaScore += chunkDeltaScore;
      
      auditResults.push({
         newChunkIndex: newChunk.chunk_index,
         oldChunkIndex: drifted?.oldChunkIndex || null,
         reason: drifted?.reason || 'UNKNOWN',
         deltaScore: chunkDeltaScore,
         claims: results
      });
    }

    const globalDriftScore = newChunksData.length > 0 ? cumulativeDeltaScore / newChunksData.length : 0;
    const finalVerdict = globalDriftScore > 0.5 ? 'CONTRADICTION_DETECTED' : 'PASSED';

    // 6. Log the results in the new specialized table
    const { error: insertErr } = await supabaseAdmin
      .from('document_delta_audits')
      .insert({
         workspace_id: workspaceId,
         old_document_id: oldDocId,
         new_document_id: newDocId,
         drift_score: globalDriftScore,
         audit_verdict: finalVerdict,
         delta_payload: auditResults
      });

    if (insertErr) {
       console.error("[AuditWorker] Failed to insert audit log", insertErr);
       return NextResponse.json({ error: 'Audit log insert failed' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Deep Audit Completed successfully', verdict: finalVerdict });
  } catch (err: any) {
    console.error('[AuditWorker] Task failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
