#!/usr/bin/env node
/**
 * Genie Context - RAG Query Script
 * 
 * Queries the Supabase vector store for relevant context from the
 * Genie AI SaaS codebase.
 * 
 * Usage: node query_rag.mjs "your search query"
 * 
 * Lite Mode: All embeddings generated via API (no local processing)
 */

import { createClient } from '@supabase/supabase-js';

// Load from environment or ai-saas .env.local
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Generate embedding using Gemini API (lite mode - no local processing)
 */
async function generateEmbedding(text) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text }] },
                taskType: 'RETRIEVAL_QUERY'
            })
        }
    );

    const data = await response.json();
    if (data.error) {
        console.error('❌ Embedding API Error:', JSON.stringify(data.error, null, 2));
    }
    return data.embedding?.values || [];
}

/**
 * Query the Supabase vector store for relevant context
 */
async function queryRAG(query, limit = 5) {
    console.log(`🔍 Searching for: "${query}"`);

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    if (queryEmbedding.length === 0) {
        console.error('❌ Failed to generate embedding');
        return [];
    }

    // Search memory_bank table (768-dim vectors)
    const { data: memoryResults, error: memoryError } = await supabase.rpc(
        'match_memories',
        {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: limit
        }
    );

    if (memoryError) {
        console.log('⚠️  Memory search skipped (function may not exist)');
    }

    // Search graph_nodes table
    const { data: graphResults, error: graphError } = await supabase.rpc(
        'match_graph_nodes',
        {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: limit
        }
    );

    if (graphError) {
        console.log('⚠️  Graph search skipped (function may not exist)');
    }

    // Combine and format results
    const results = [
        ...(memoryResults || []).map(r => ({ ...r, source: 'memory_bank' })),
        ...(graphResults || []).map(r => ({ ...r, source: 'graph_nodes' }))
    ];

    // Sort by similarity and limit
    results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return results.slice(0, limit);
}

/**
 * Format results for display
 */
function formatResults(results) {
    if (results.length === 0) {
        return '📭 No relevant context found in the RAG memory.';
    }

    let output = `📚 Found ${results.length} relevant context(s):\n\n`;

    for (const result of results) {
        const similarity = ((result.similarity || 0) * 100).toFixed(1);
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `📌 Source: ${result.source}\n`;
        output += `🎯 Relevance: ${similarity}%\n`;

        if (result.content) {
            output += `📝 Content:\n${result.content.substring(0, 500)}${result.content.length > 500 ? '...' : ''}\n`;
        }

        if (result.metadata) {
            output += `🏷️  Metadata: ${JSON.stringify(result.metadata, null, 2)}\n`;
        }

        output += '\n';
    }

    return output;
}

// Main execution
const query = process.argv[2];

if (!query) {
    console.log('Usage: node query_rag.mjs "query"');
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
}

if (!GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY for embedding generation');
    process.exit(1);
}

queryRAG(query)
    .then(results => console.log(formatResults(results)))
    .catch(err => console.error('❌ Error:', err.message));
