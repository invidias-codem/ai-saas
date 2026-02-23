#!/usr/bin/env tsx

/**
 * Integration Test Script for Hybrid RAG System
 * Tests all components end-to-end
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { rateLimiter, COST_ESTIMATES } from '../lib/rag/rateLimiter';
import { CodebaseIndexer } from '../lib/rag/codebaseIndexer';
import { enrichPRContext } from '../lib/rag/prContextEnricher';
import { classifySuggestions, Suggestion } from '../lib/rag/verificationLayer';
import { autoImplementSafeSuggestions } from '../lib/rag/autoImplementer';

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
        await fn();
        results.push({ name, passed: true, duration: Date.now() - start });
        console.log(`✅ ${name}`);
    } catch (error: any) {
        results.push({ name, passed: false, error: error.message, duration: Date.now() - start });
        console.log(`❌ ${name}: ${error.message}`);
    }
}

async function main() {
    console.log('🧪 Running Hybrid RAG Integration Tests\n');
    console.log('='.repeat(50) + '\n');

    // Test 1: Rate Limiter
    await runTest('Rate Limiter - Check Budget', async () => {
        const status = await rateLimiter.getCurrentUsage();
        if (typeof status.spent !== 'number') throw new Error('Invalid spent value');
        if (typeof status.remaining !== 'number') throw new Error('Invalid remaining value');
        if (status.limit !== 5.00) throw new Error(`Expected limit 5.00, got ${status.limit}`);
    });

    await runTest('Rate Limiter - Cost Estimates', async () => {
        if (COST_ESTIMATES.QODO_PR_REVIEW !== 0.10) throw new Error('Invalid Qodo cost');
        if (COST_ESTIMATES.GENIE_PR_REVIEW !== 0.05) throw new Error('Invalid Genie cost');
        if (COST_ESTIMATES.CODEBASE_INDEX_PER_FILE !== 0.002) throw new Error('Invalid indexing cost');
    });

    // Test 2: Codebase Indexer (dry-run)
    await runTest('Codebase Indexer - Dry Run', async () => {
        const indexer = new CodebaseIndexer();
        const result = await indexer.index({
            basePath: process.cwd(),
            dryRun: true,
            excludePatterns: [],
            includeExtensions: ['.ts', '.tsx', '.md']
        });

        if (result.indexedFiles.length === 0) throw new Error('No files found to index');
        console.log(`   Found ${result.indexedFiles.length} files to index`);
    });

    // Test 3: Verification Layer
    await runTest('Verification Layer - Safe Classification', async () => {
        const suggestions: Suggestion[] = [{
            file: 'components/Button.tsx',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'const x=1',
            suggestedCode: 'const x = 1',
            reason: 'Formatting fix',
            confidence: 0.9,
            category: 'formatting',
            source: 'qodo',
        }];

        const classified = classifySuggestions(suggestions);
        if (classified.safe.length !== 1) throw new Error('Formatting should be safe');
    });

    await runTest('Verification Layer - Dangerous Classification', async () => {
        const suggestions: Suggestion[] = [{
            file: 'lib/auth/password.ts',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'password',
            suggestedCode: 'hashedPassword',
            reason: 'Use hashed password',
            confidence: 0.9,
            category: 'security',
            source: 'genie',
        }];

        const classified = classifySuggestions(suggestions);
        if (classified.dangerous.length !== 1) throw new Error('Auth changes should be dangerous');
    });

    await runTest('Verification Layer - Approval Required', async () => {
        const suggestions: Suggestion[] = [{
            file: 'app/api/users/route.ts',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'return data',
            suggestedCode: 'return { data }',
            reason: 'Better format',
            confidence: 0.8,
            category: 'logic',
            source: 'qodo',
        }];

        const classified = classifySuggestions(suggestions);
        if (classified.requiresApproval.length !== 1) throw new Error('API routes should require approval');
    });

    // Test 4: Auto Implementer (dry-run)
    await runTest('Auto Implementer - Dry Run', async () => {
        const suggestions: Suggestion[] = [{
            file: 'test.ts',
            lineStart: 1,
            lineEnd: 5,
            originalCode: 'const x=1',
            suggestedCode: 'const x = 1',
            reason: 'Formatting',
            confidence: 0.9,
            category: 'formatting',
            source: 'qodo',
        }];

        const result = await autoImplementSafeSuggestions(suggestions, '.', true);
        if (result.applied.length !== 1) throw new Error('Should apply 1 safe suggestion in dry-run');
    });

    // Test 5: PR Context Enricher (will fail without API key, but should handle gracefully)
    await runTest('PR Context Enricher - Graceful Handling', async () => {
        try {
            const context = await enrichPRContext({
                files: ['lib/test.ts'],
                diff: '',
                title: 'Test PR',
                description: 'Test'
            });

            // Should return a context object even if enrichment fails
            if (!context.hasOwnProperty('summary')) throw new Error('Missing summary');
            if (!context.hasOwnProperty('relatedPatterns')) throw new Error('Missing patterns');
        } catch (e: any) {
            // If it throws due to missing API key, that's acceptable for now
            if (!e.message.includes('API_KEY')) throw e;
            console.log('   (Skipped - API key not configured)');
        }
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Test Summary:\n');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total:  ${results.length}`);
    console.log(`   Time:   ${totalTime}ms`);

    if (failed > 0) {
        console.log('\n❌ Failed Tests:');
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.name}: ${r.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
