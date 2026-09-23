/**
 * Backfill content_search for legacy memory_bank rows.
 *
 * Run: npx tsx scripts/backfill-content-search.ts
 *
 * Idempotent: only touches rows WHERE content_search IS NULL. Reads each
 * legacy row's LZ-compressed content, safeDecompress()es it in-app, and
 * writes the plain-text shadow column so those memories participate in
 * lexical (degraded) retrieval — currently the PRIMARY path while Google
 * embedding access is denied.
 *
 * ponytail: batched at 500 with a modest concurrency; single-instance script,
 * fine at current memory_bank scale (~10^4). Re-run safe — skips filled rows.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}
const admin = createClient(url, key);

// LZ-string decompress — EXACTLY matching lib/compression.safeDecompress:
// '::LZ::' prefix marker + compressToUTF16, raw passthrough otherwise.
const LZ = require('lz-string');
const PREFIX = '::LZ::';

function safeDecompress(s: string | null): string {
  if (!s) return '';
  if (s.startsWith(PREFIX)) {
    const out = LZ.decompressFromUTF16(s.slice(PREFIX.length));
    return out ?? '';
  }
  // Legacy uncompressed row — content IS the plain text.
  return s;
}

const BATCH = 500;

async function main() {
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const { data, error } = await admin
      .from('memory_bank')
      .select('id, content')
      .is('content_search', null)
      .not('content', 'is', null)
      .limit(BATCH);

    if (error) {
      console.error('fetch failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    let failCount = 0;
    for (const row of data as Array<{ id: string; content: string }>) {
      const { error: upErr } = await admin
        .from('memory_bank')
        .update({ content_search: safeDecompress(row.content).slice(0, 100_000) })
        .eq('id', row.id);
      if (upErr) {
        failCount++;
        console.error('update failed:', row.id, upErr.message);
        // Mark as processed to avoid an infinite loop on a poison row.
        await admin.from('memory_bank').update({ content_search: '' }).eq('id', row.id);
      } else {
        updated++;
      }
    }
    skipped += failCount;

    processed += data.length;
    console.log(`[backfill] ${processed} rows processed (${updated} updated, ${failCount} failed)…`);
    if (data.length < BATCH) break;
  }

  console.log(`[backfill] done: ${updated} rows backfilled, ${skipped} skipped.`);
}

main();
