#!/usr/bin/env tsx

/**
 * CLI tool to check RAG budget status
 * Used in GitHub Actions to determine if operations can proceed
 */

import 'dotenv/config';
import { rateLimiter, COST_ESTIMATES } from '../lib/rag/rateLimiter';

async function main() {
    try {
        console.log('🔍 Checking RAG budget status...\n');

        const status = await rateLimiter.getCurrentUsage();

        console.log('📊 Budget Status:');
        console.log(`   Spent:     $${status.spent.toFixed(2)} / $${status.limit.toFixed(2)}`);
        console.log(`   Remaining: $${status.remaining.toFixed(2)}`);
        console.log(`   Used:      ${status.percentUsed.toFixed(1)}%`);
        console.log('');

        if (status.isApproachingLimit) {
            console.log('⚠️  WARNING: Approaching budget limit!');
            console.log('   Consider pausing non-critical operations.');
            console.log('');
        }

        if (!status.canProceed) {
            console.log('❌ BUDGET EXCEEDED');
            console.log('   Cannot proceed with new operations.');
            console.log('   Budget will reset at the start of next month.');
            process.exit(1);
        }

        console.log('✅ Budget OK - Operations can proceed');
        console.log('');
        console.log('💡 Estimated costs:');
        console.log(`   Qodo PR Review:  $${COST_ESTIMATES.QODO_PR_REVIEW.toFixed(2)}`);
        console.log(`   Genie PR Review: $${COST_ESTIMATES.GENIE_PR_REVIEW.toFixed(2)}`);
        console.log(`   File Indexing:   $${COST_ESTIMATES.CODEBASE_INDEX_PER_FILE.toFixed(4)}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error checking budget:', error);
        // Exit 0 to allow operations to proceed if we can't check
        // Better to proceed than block on a check failure
        process.exit(0);
    }
}

main();
