import { chunkText, prepareSourceChunks } from '../lib/ai/sourceIngest';

// Paragraph-aware chunking sanity checks
const short = 'A short note about reef tank dosing.';
console.log('short:', chunkText(short).length === 1 ? 'OK' : 'FAIL');

// ~10k chars across multiple paragraphs
const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ` + 'word '.repeat(60)).join('\n\n');
const chunks = chunkText(long);
console.log('long chunks:', chunks.length, '| max len:', Math.max(...chunks.map(c => c.length)), '| all<=2400:', chunks.every(c => c.length <= 2400));

// One giant single paragraph (hard-split path)
const giant = 'x'.repeat(7000);
const gchunks = chunkText(giant);
console.log('giant paragraph chunks:', gchunks.length, '| all<=2400:', gchunks.every(c => c.length <= 2400));

// prepareSourceChunks without cleanse (no google key) should not call the API
(async () => {
    const out = await prepareSourceChunks({
        source_type: 'note',
        title: 'Test',
        raw_text: long,
        metadata: { author: 'test' },
    });
    console.log('prepareSourceChunks:', out.length, 'chunks | metadata preserved:',
        out[0].metadata.author === 'test' && typeof out[0].metadata.chunk_count === 'number' ? 'OK' : 'FAIL');
})();
