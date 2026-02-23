#!/usr/bin/env tsx

/**
 * PR RAG Enrichment CLI
 * Analyzes a PR diff and retrieves relevant context from Genie's memory.
 * 
 * Usage:
 *   npx tsx scripts/pr-rag-enrichment.ts --pr-number=1 --diff-file=diff.txt --output=context.json
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { enrichPRContext, PRData } from '../lib/rag/prContextEnricher';

async function main() {
    const args = process.argv.slice(2);
    const options: Record<string, string> = {};

    for (const arg of args) {
        const [key, value] = arg.replace('--', '').split('=');
        if (key && value) options[key] = value;
    }

    if (!options['pr-number']) {
        console.error('❌ Missing required argument: --pr-number');
        process.exit(1);
    }

    console.log(`🔍 Enriching context for PR #${options['pr-number']}...`);

    // Read diff file if provided
    let diff = '';
    if (options['diff-file'] && fs.existsSync(options['diff-file'])) {
        diff = fs.readFileSync(options['diff-file'], 'utf-8');
    }

    // Extract file list from diff
    const files = extractFilesFromDiff(diff);

    const prData: PRData = {
        files,
        diff,
        title: options['title'] || `PR #${options['pr-number']}`,
        description: options['description'] || ''
    };

    const context = await enrichPRContext(prData);

    // Output results
    if (options['output']) {
        fs.writeFileSync(options['output'], JSON.stringify(context, null, 2));
        console.log(`✅ Context written to ${options['output']}`);
    } else {
        console.log('\n' + context.summary);
    }

    // Also write markdown summary for PR comment
    if (options['output']) {
        const mdPath = options['output'].replace('.json', '.md');
        fs.writeFileSync(mdPath, context.summary);
        console.log(`📝 Markdown summary written to ${mdPath}`);
    }

    process.exit(0);
}

/**
 * Extract changed files from a unified diff.
 */
function extractFilesFromDiff(diff: string): string[] {
    const files: string[] = [];
    const lines = diff.split('\n');

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            // Format: diff --git a/path/to/file b/path/to/file
            const match = line.match(/b\/(.+)$/);
            if (match) files.push(match[1]);
        } else if (line.startsWith('+++')) {
            // Format: +++ b/path/to/file
            const match = line.match(/\+\+\+ b\/(.+)$/);
            if (match && !files.includes(match[1])) {
                files.push(match[1]);
            }
        }
    }

    return files;
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
