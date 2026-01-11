
// scripts/test-memory.ts
import { storeMemory, searchMemories, getMemoryStats } from '../lib/memory/vectorStore';
import { generateEmbedding } from '../lib/memory/embedding';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

async function main() {
    console.log('Testing Memory Bank (Supabase + pgvector)...');

    const userId = 'test-user-' + Date.now();
    const testContent = 'The user prefers coding in TypeScript and using Supabase for the database.';

    // 1. Test Embedding
    console.log('\nGenerating embedding...');
    try {
        const vector = await generateEmbedding(testContent);
        console.log(`Embedding generated. Length: ${vector.length}`);
    } catch (error) {
        console.error('Embedding failed:', error);
        return;
    }

    // 2. Test Storage
    console.log('\nStoring memory...');
    try {
        const id = await storeMemory(userId, testContent, 'preference', { test: true });
        console.log(`Memory stored with ID: ${id}`);
    } catch (error) {
        console.error('Storage failed:', error);
        return;
    }

    // 3. Test Retrieval
    console.log('\nSearching memories...');
    try {
        const query = 'What is the preferred database?';
        const results = await searchMemories(userId, query, 3);

        console.log(`Found ${results.length} results:`);
        results.forEach(r => {
            console.log(`- [${r.similarity?.toFixed(4)}] ${r.content}`);
        });

        if (results.length > 0 && results[0].content.includes('Supabase')) {
            console.log('✅ Retrieval verification SUCCESS');
        } else {
            console.log('❌ Retrieval verification FAILED (or no match found)');
        }

    } catch (error) {
        console.error('Search failed:', error);
    }

    // 4. Test Stats
    console.log('\nChecking stats...');
    try {
        const stats = await getMemoryStats(userId);
        console.log('Stats:', stats);
        if (stats.totalMemories === 1) {
            console.log('✅ Stats verification SUCCESS');
        } else {
            console.log('❌ Stats verification FAILED');
        }
    } catch (error) {
        console.error('Stats failed:', error);
    }
}

main().catch(console.error);
