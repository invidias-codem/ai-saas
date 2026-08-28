/**
 * lib/refinery/orchestrator.ts
 *
 * Data Refinery Engine batch processor.
 *
 * Reuses the existing chameleon-consultant ingest primitives:
 *  - fetchAndExtractText: lightweight HTTP + cheerio extraction
 *  - cleanseSourceText: optional Gemini Flash normalization
 *  - prepareSourceChunks: paragraph-aware chunking with overlap
 *  - detectDelta / supersedeAndCreateCausalLinks: delta detection + lineage
 *  - processChunkForKnowledgeGraph: entity extraction into knowledge graph
 *  - generateEmbedding: batched embedding with null-safe fallback
 *
 * Output rows are inserted as source_type = 'refinery' into workspace_sources,
 * which means the Chameleon Consultant RAG layer consumes them natively.
 */

import { supabaseAdmin } from '@/lib/supabaseClient';
import { cleanseSourceText, prepareSourceChunks } from '@/lib/ai/sourceIngest';
import { detectDelta, supersedeAndCreateCausalLinks } from '@/lib/workspace/delta-detection';
import { processChunkForKnowledgeGraph } from '@/lib/workspace/entity-extraction';
import { generateEmbedding } from '@/lib/memory/embedding';
import { extractDeterministicEntities } from './nlp';

export interface RefineryJobResult {
  url: string;
  status: 'success' | 'failed';
  error?: string;
}

/**
 * Fetch and extract raw text from a URL.
 * Imported lazily from the onboarding worker to avoid circular module graph
 * issues between server routes and library modules.
 */
async function fetchAndExtractText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; DataRefinery/1.0; +https://gen1e.xyz/bot)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return `[PDF detected] ${url}`;
  }
  const html = await res.text();
  const { load } = await import('cheerio');
  const $ = load(html);
  const title = $('title').text().trim() || '';
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim() || '';
  return `TITLE: ${title}\nURL: ${url}\n\n${bodyText.slice(0, 12000)}`;
}

/**
 * Process a batch of refinery URLs for a single workspace/user.
 */
export async function processRefineryBatch(
  workspaceId: string,
  userId: string,
  targetUrls: string[],
): Promise<RefineryJobResult[]> {
  const results: RefineryJobResult[] = [];

  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not initialized');
  }

  const googleApiKey = process.env.GOOGLE_API_KEY;

  for (const url of targetUrls) {
    try {
      // 1. Lightweight HTTP extraction
      const rawText = await fetchAndExtractText(url);
      if (!rawText) {
        throw new Error(`Extraction returned empty text for ${url}`);
      }

      // 2. Deterministic NLP extraction before LLM cleanse
      const entities = extractDeterministicEntities(rawText);

      // 3. Anchored cleanse pass for web-scraped content
      let workingText = rawText;
      let cleansed = false;
      if (googleApiKey) {
        try {
          workingText = await cleanseSourceText(rawText, googleApiKey, entities);
          cleansed = true;
        } catch {
          workingText = rawText;
        }
      }

      // 4. Chunk using existing paragraph-aware chunker
      const chunks = await prepareSourceChunks({
        source_type: 'refinery',
        raw_text: workingText,
        metadata: { via: 'refinery' },
      });

      // 5. Generate embeddings for delta detection
      const chunksWithEmbeddings = await Promise.all(
        chunks.map(async (chunk) => ({
          content: chunk.content,
          embedding: await generateEmbedding(chunk.content).catch(() => null),
        })),
      );

      // 5. Delta detection: skip UNCHANGED to save tokens/IO
      const delta = await detectDelta(workspaceId, url, chunksWithEmbeddings);
      if (delta.verdict === 'UNCHANGED') {
        results.push({ url, status: 'success' });
        continue;
      }

      // 6. Build rows for insertion
      const rows = chunksWithEmbeddings
        .filter((c) => c.embedding !== null)
        .map((c, i) => ({
          workspace_id: workspaceId,
          user_id: userId,
          source_type: 'refinery',
          title: new URL(url).hostname,
          origin_uri: url,
          raw_text: workingText,
          content: c.content,
          embedding: c.embedding,
          metadata: {
            via: 'refinery',
            needs_scrape: false,
            chunk_index: i,
            chunk_count: chunks.length,
            cleansed,
            kind: 'scraped_web',
            origin_uri: url,
            extracted_entities: entities,
          },
        }));

      if (rows.length === 0) {
        results.push({ url, status: 'success' });
        continue;
      }

      // 7. Insert rows
      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from('workspace_sources')
        .insert(rows)
        .select('id, content, origin_uri');

      if (insertError || !insertedRows || insertedRows.length === 0) {
        throw new Error(`workspace_sources insert failed: ${insertError?.message || 'no rows returned'}`);
      }

      const newIds = insertedRows.map((r) => r.id);

      // 8. For UPDATED: supersede old versions and create causal links
      if (delta.verdict === 'UPDATED') {
        await supersedeAndCreateCausalLinks(workspaceId, url, newIds);
      }

      // 9. Knowledge-graph entity extraction for inserted rows
      for (let i = 0; i < insertedRows.length; i++) {
        try {
          await processChunkForKnowledgeGraph({
            workspaceId,
            userId,
            sourceChunkId: newIds[i],
            content: insertedRows[i].content,
            originUri: insertedRows[i].origin_uri,
          });
        } catch {
          // Non-fatal: knowledge graph extraction is best-effort
        }
      }

      results.push({ url, status: 'success' });
    } catch (error: any) {
      results.push({ url, status: 'failed', error: error?.message || 'unknown_error' });
    }
  }

  return results;
}
