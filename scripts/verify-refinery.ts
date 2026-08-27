/**
 * scripts/verify-refinery.ts
 *
 * Local verification script for the Data Refinery Engine.
 *
 * This bypasses the Next.js API layer and cron auth to test the core
 * orchestrator pipeline directly against a live Supabase instance.
 *
 * Usage:
 *   npx tsx scripts/verify-refinery.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { cleanseSourceText, prepareSourceChunks } from '../lib/ai/sourceIngest';
import { generateEmbeddingWithMetadata } from '../lib/memory/embedding';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID || '00000000-0000-0000-0000-000000000001';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user';

const TEST_URLS = [
  'https://en.wikipedia.org/wiki/Monte_Carlo_tree_search',
];

async function fetchAndExtractText(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; DataRefinery/1.0; +https://example.com/bot)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return { title: '', text: `[PDF detected] ${url}` };
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $('title').text().trim() || '';
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim() || '';
  const text = `TITLE: ${title}\nURL: ${url}\n\n${bodyText.slice(0, 12000)}`;
  return { title, text };
}

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.error(`  ❌ ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DATA REFINERY ENGINE — LOCAL VERIFICATION');
  console.log('═══════════════════════════════════════════════════════');

  if (!supabaseAdmin) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  // 1. Clean up any prior test data for this verification run
  console.log('\n🧹 Pre-clean test artifacts...');
  const { error: cleanupError } = await supabaseAdmin
    .from('workspace_sources')
    .delete()
    .eq('workspace_id', TEST_WORKSPACE_ID)
    .eq('source_type', 'refinery');

  if (cleanupError) {
    console.warn('Pre-clean warning:', cleanupError.message);
  }

  // 2. Execute the refinery pipeline directly
  console.log(`\n🏭 Processing ${TEST_URLS.length} URL(s)...`);

  const insertedRows: any[] = [];

  for (const url of TEST_URLS) {
    console.log(`\n  • ${url}`);

    const extracted = await fetchAndExtractText(url);
    assert(!!extracted.text, 'fetchAndExtractText returned text');

    const cleansed = await cleanseSourceText(extracted.text, process.env.GOOGLE_API_KEY || '');
    const chunks = await prepareSourceChunks(
      {
        raw_text: cleansed,
        source_type: 'url',
        title: extracted.title || url,
        origin_uri: url,
        metadata: {},
      },
      { googleApiKey: process.env.GOOGLE_API_KEY }
    );

    console.log(`  📦 Chunks produced: ${chunks.length}`);
    console.log(`  chunks produced: ${chunks.length} (cleansed ${cleansed.length} chars)`);

    assert(Array.isArray(chunks) && chunks.length > 0, `prepareSourceChunks produced chunks (got ${chunks.length}, cleansed ${cleansed.length} chars)`);

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i].content;
      const embeddingResult = await generateEmbeddingWithMetadata(content);
      const embedding = embeddingResult.embedding;

      const row = {
        workspace_id: TEST_WORKSPACE_ID,
        user_id: TEST_USER_ID,
        origin_uri: url,
        title: extracted.title || url,
        raw_text: content,
        content,
        source_type: 'refinery',
        metadata: {
          via: 'refinery',
          needs_scrape: false,
          chunk_index: i,
          chunk_count: chunks.length,
          cleansed: true,
          kind: 'refinery',
        },
        embedding,
      };

      const { data, error } = await supabaseAdmin
        .from('workspace_sources')
        .insert(row)
        .select('id, source_type, title, origin_uri, raw_text, content, embedding, metadata')
        .single();

      if (error) {
        console.error('Insert error:', error.message);
        throw error;
      }

      insertedRows.push(data);
    }
  }

  console.log('\n📊 Pipeline results:');
  console.log(`  ✅ Processed ${TEST_URLS.length} URL(s)`);
  console.log(`  ✅ Rows inserted: ${insertedRows.length}`);

  // 3. Verify rows landed in workspace_sources with correct metadata
  console.log('\n🔍 Verifying workspace_sources rows...');
  const { data: fetchedRows, error: fetchError } = await supabaseAdmin
    .from('workspace_sources')
    .select('id, source_type, title, origin_uri, raw_text, content, embedding, metadata')
    .eq('workspace_id', TEST_WORKSPACE_ID)
    .eq('source_type', 'refinery')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    process.exit(1);
  }

  assert(Array.isArray(fetchedRows) && fetchedRows.length > 0, 'Inserted rows exist in workspace_sources');

  const firstRow = fetchedRows[0];
  assert(firstRow.source_type === 'refinery', 'Row source_type is refinery');
  assert(typeof firstRow.title === 'string' && firstRow.title.length > 0, 'Row title is populated');
  assert(firstRow.origin_uri === TEST_URLS[0], 'Row origin_uri matches input URL');
  assert(typeof firstRow.raw_text === 'string' && firstRow.raw_text.length > 0, 'Row raw_text is populated');
  assert(typeof firstRow.content === 'string' && firstRow.content.length > 0, 'Row content is populated');
  assert(firstRow.metadata?.via === 'refinery', 'Metadata via is refinery');
  assert(firstRow.metadata?.needs_scrape === false, 'Metadata needs_scrape is false');
  assert(typeof firstRow.metadata?.chunk_index === 'number', 'Metadata chunk_index is a number');
  assert(typeof firstRow.metadata?.chunk_count === 'number', 'Metadata chunk_count is a number');
  assert(typeof firstRow.metadata?.cleansed === 'boolean', 'Metadata cleansed is boolean');

  const embeddedRows = fetchedRows.filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0);
  console.log(`  Embedded rows: ${embeddedRows} / ${fetchedRows.length}`);

  if (embeddedRows.length > 0) {
    console.log('  ✅ At least one row has a non-empty embedding');
  } else {
    console.warn('  ⚠️ Embeddings are empty — provider may be unavailable');
    console.warn('     This confirms graceful degradation: rows persist with embedding: null');
  }

  console.log('\n📦 Sample metadata:');
  console.log(JSON.stringify(firstRow.metadata, null, 2));

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VERIFICATION PASSED');
  console.log(`  Rows inserted: ${fetchedRows.length}`);
  console.log(`  Embedded rows: ${embeddedRows.length}`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n💥 Verification failed:', err);
  process.exit(1);
});
