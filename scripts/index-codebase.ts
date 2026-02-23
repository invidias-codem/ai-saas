#!/usr/bin/env tsx

import { config } from 'dotenv';
import path from 'path';
const envPath = path.resolve(process.cwd(), '.env.local');
console.log(`📡 Loading env from: ${envPath}`);
config({ path: envPath });

import { codebaseIndexer } from '../lib/rag/codebaseIndexer';

async function main() {
    const args = process.argv.slice(2);
    const options = {
        basePath: process.cwd(),
        dryRun: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--path' && args[i + 1]) {
            options.basePath = path.resolve(args[i + 1]);
            i++;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--help') {
            console.log(`
Genie Codebase Indexer CLI 🚀

Usage:
  npx tsx scripts/index-codebase.ts [options]

Options:
  --path <path>    Path to index (default: ${process.cwd()})
  --dry-run        Walk the files without generating embeddings
  --help           Show help
            `);
            process.exit(0);
        }
    }

    try {
        console.log('🏗️  Initializing Genie Codebase Indexer...');

        const result = await codebaseIndexer.index({
            basePath: options.basePath,
            dryRun: options.dryRun,
            excludePatterns: [], // Uses defaults in service
            includeExtensions: ['.ts', '.tsx', '.js', '.jsx', '.sql', '.md']
        });

        if (options.dryRun) {
            console.log('\n🔍 Dry run summary:');
            console.log(`Potential files to index: ${result.indexedFiles.length}`);
            console.log('Sample files (first 10):');
            console.log(result.indexedFiles.slice(0, 10).map(f => '   - ' + path.relative(options.basePath, f)).join('\n'));
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Indexing failed:', error);
        process.exit(1);
    }
}

main();
