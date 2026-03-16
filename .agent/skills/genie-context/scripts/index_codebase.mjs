#!/usr/bin/env node
/**
 * Genie Context - Codebase Indexer
 * 
 * Indexes the ai-saas repository structure into Supabase for
 * semantic code search. Run this once initially, then on major changes.
 * 
 * Usage: node index_codebase.mjs
 * 
 * Rate Limited: 5 runs per day (see lite_config.mjs)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const PROJECT_ROOT = '/Users/jroot/Desktop/ai-nexus/ai-saas';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// File types to index
const INDEXABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.md', '.json', '.sql'];

// Directories to skip
const SKIP_DIRS = ['node_modules', '.next', '.git', '.venv', 'dist', 'build', 'coverage'];

/**
 * Generate embedding using Gemini API
 */
async function generateEmbedding(text) {
    const truncated = text.substring(0, 8000); // API limit

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text: truncated }] },
                taskType: 'RETRIEVAL_DOCUMENT'
            })
        }
    );

    const data = await response.json();
    return data.embedding?.values || [];
}

/**
 * Recursively get all indexable files
 */
function getFiles(dir, files = []) {
    const items = readdirSync(dir);

    for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
            if (!SKIP_DIRS.includes(item)) {
                getFiles(fullPath, files);
            }
        } else if (INDEXABLE_EXTENSIONS.includes(extname(item))) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * Extract meaningful content from a file
 */
function extractContent(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const ext = extname(filePath);
    const name = basename(filePath);
    const relativePath = filePath.replace(PROJECT_ROOT + '/', '');

    // Create a summary combining path context and content
    let summary = `File: ${relativePath}\n`;

    // Extract key patterns based on file type
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        // Extract exports, functions, classes
        const exports = content.match(/export\s+(default\s+)?(function|class|const|interface|type)\s+(\w+)/g) || [];
        if (exports.length > 0) {
            summary += `Exports: ${exports.slice(0, 10).join(', ')}\n`;
        }

        // Extract imports (dependencies)
        const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
        if (imports.length > 0) {
            summary += `Dependencies: ${imports.slice(0, 10).join(', ')}\n`;
        }
    }

    // Add truncated content
    summary += `\nContent:\n${content.substring(0, 2000)}`;

    return {
        relativePath,
        summary,
        metadata: {
            extension: ext,
            filename: name,
            lines: content.split('\n').length
        }
    };
}

/**
 * Index a single file to Supabase
 */
async function indexFile(filePath) {
    const { relativePath, summary, metadata } = extractContent(filePath);

    console.log(`📄 Indexing: ${relativePath}`);

    const embedding = await generateEmbedding(summary);

    if (embedding.length === 0) {
        console.log(`   ⚠️  Skipped (embedding failed)`);
        return false;
    }

    // Upsert to graph_nodes table
    const { error } = await supabase
        .from('graph_nodes')
        .upsert({
            id: `codebase:${relativePath}`,
            node_type: 'code_file',
            content: summary,
            metadata: metadata,
            embedding: embedding,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'id'
        });

    if (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return false;
    }

    console.log(`   ✅ Indexed (${metadata.lines} lines)`);
    return true;
}

/**
 * Main indexing function
 */
async function indexCodebase() {
    console.log('🚀 Genie Context - Codebase Indexer\n');
    console.log('═══════════════════════════════════\n');

    const files = getFiles(PROJECT_ROOT);
    console.log(`📁 Found ${files.length} files to index\n`);

    let indexed = 0;
    let failed = 0;

    // Process files with rate limiting (2 concurrent to save resources)
    for (let i = 0; i < files.length; i++) {
        try {
            const success = await indexFile(files[i]);
            if (success) indexed++;
            else failed++;

            // Rate limit: 100ms between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            console.log(`   ❌ Error: ${err.message}`);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════');
    console.log(`✅ Indexed: ${indexed} files`);
    console.log(`❌ Failed: ${failed} files`);
    console.log('═══════════════════════════════════\n');
}

// Validate environment
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

if (!GOOGLE_API_KEY) {
    console.error('❌ Missing GOOGLE_API_KEY');
    process.exit(1);
}

indexCodebase().catch(err => console.error('Fatal error:', err));
