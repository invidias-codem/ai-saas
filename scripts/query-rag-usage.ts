#!/usr/bin/env tsx

/**
 * CLI tool to query RAG usage history
 * Useful for debugging and monitoring
 */

import { supabase } from '../lib/supabaseClient';

interface QueryOptions {
    limit?: number;
    operationType?: string;
    startDate?: string;
    endDate?: string;
}

async function queryUsage(options: QueryOptions = {}) {
    try {
        let query = supabase
            .from('rag_usage')
            .select('*')
            .order('created_at', { ascending: false });

        if (options.operationType) {
            query = query.eq('operation_type', options.operationType);
        }

        if (options.startDate) {
            query = query.gte('created_at', options.startDate);
        }

        if (options.endDate) {
            query = query.lte('created_at', options.endDate);
        }

        if (options.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) throw error;

        console.log('\n📊 RAG Usage History:\n');

        if (!data || data.length === 0) {
            console.log('No usage records found.');
            return;
        }

        let totalCost = 0;
        data.forEach((record: any) => {
            const date = new Date(record.created_at).toLocaleString();
            console.log(`[${date}] ${record.operation_type}`);
            console.log(`   Cost: $${parseFloat(record.cost_usd).toFixed(4)}`);
            if (record.tokens_used) {
                console.log(`   Tokens: ${record.tokens_used}`);
            }
            console.log('');
            totalCost += parseFloat(record.cost_usd);
        });

        console.log(`Total: $${totalCost.toFixed(4)}\n`);

    } catch (error) {
        console.error('Error querying usage:', error);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: QueryOptions = {
    limit: 10 // default
};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
        options.limit = parseInt(args[i + 1]);
        i++;
    } else if (arg === '--type' && args[i + 1]) {
        options.operationType = args[i + 1];
        i++;
    } else if (arg === '--start' && args[i + 1]) {
        options.startDate = args[i + 1];
        i++;
    } else if (arg === '--end' && args[i + 1]) {
        options.endDate = args[i + 1];
        i++;
    } else if (arg === '--help') {
        console.log(`
Usage: npx tsx scripts/query-rag-usage.ts [options]

Options:
  --limit <n>        Number of records to show (default: 10)
  --type <type>      Filter by operation type
  --start <date>     Start date (ISO format)
  --end <date>       End date (ISO format)
  --help             Show this help message

Examples:
  npx tsx scripts/query-rag-usage.ts --limit 20
  npx tsx scripts/query-rag-usage.ts --type qodo_pr_review
  npx tsx scripts/query-rag-usage.ts --start 2026-02-01
    `);
        process.exit(0);
    }
}

queryUsage(options);
