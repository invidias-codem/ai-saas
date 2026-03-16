#!/usr/bin/env node
/**
 * Genie Context - Lite Mode Configuration
 * 
 * Returns the current lite-mode configuration for OpenClaw
 * optimized for MacBook Air (2017) resource constraints.
 */

const config = {
    // === Model Configuration ===
    reasoning: {
        model: 'gemini-1.5-pro',
        provider: 'API',
        description: 'Complex reasoning, architecture decisions, debugging'
    },
    fast: {
        model: 'gemini-1.5-flash',
        provider: 'API',
        description: 'File indexing, quick lookups, heartbeat tasks'
    },

    // === Resource Settings ===
    localVectors: false,  // Use Supabase pgvector instead of local FAISS/Chroma
    localEmbeddings: false, // Generate embeddings via API, not locally
    maxConcurrentTasks: 2,  // Limit parallel operations

    // === Budget Guardrails ===
    limits: {
        ragQueriesPerHour: 100,
        codebaseIndexingPerDay: 5,
        shellCommandsPerHour: 50,
        heartbeatIntervalMinutes: 30,
        maxNotificationsPerHour: 5
    },

    // === Heartbeat Behavior ===
    heartbeat: {
        enabled: true,
        interval: '30m',
        tasks: [
            'check_for_todos',
            'monitor_github_actions'
        ],
        quietHours: {
            enabled: true,
            start: '22:00',
            end: '08:00',
            timezone: 'America/New_York'
        }
    },

    // === Project Paths ===
    paths: {
        aiSaas: '/Users/jroot/Desktop/ai-nexus/ai-saas',
        envFile: '/Users/jroot/Desktop/ai-nexus/ai-saas/.env.local'
    },

    // === Supabase Connection ===
    supabase: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ozevwhiipwbcvyzkbhib.supabase.co',
        vectorDimensions: 768,
        tables: ['memory_bank', 'graph_nodes']
    }
};

// Display formatted config
console.log('🔧 Genie Context - Lite Mode Configuration\n');
console.log('═══════════════════════════════════════════\n');

console.log('📊 Model Configuration:');
console.log(`   Reasoning: ${config.reasoning.model} (${config.reasoning.provider})`);
console.log(`   Fast Tasks: ${config.fast.model} (${config.fast.provider})`);
console.log();

console.log('💻 Resource Settings (Optimized for MacBook Air):');
console.log(`   Local Vectors: ${config.localVectors ? '✅ Enabled' : '❌ Disabled (using Supabase)'}`);
console.log(`   Local Embeddings: ${config.localEmbeddings ? '✅ Enabled' : '❌ Disabled (using API)'}`);
console.log(`   Max Concurrent Tasks: ${config.maxConcurrentTasks}`);
console.log();

console.log('💰 Budget Guardrails:');
console.log(`   RAG Queries: ${config.limits.ragQueriesPerHour}/hour`);
console.log(`   Indexing: ${config.limits.codebaseIndexingPerDay}/day`);
console.log(`   Shell Commands: ${config.limits.shellCommandsPerHour}/hour`);
console.log();

console.log('❤️  Heartbeat:');
console.log(`   Enabled: ${config.heartbeat.enabled ? '✅ Yes' : '❌ No'}`);
console.log(`   Interval: ${config.heartbeat.interval}`);
console.log(`   Tasks: ${config.heartbeat.tasks.join(', ')}`);
console.log(`   Quiet Hours: ${config.heartbeat.quietHours.start} - ${config.heartbeat.quietHours.end} (${config.heartbeat.quietHours.timezone})`);
console.log();

console.log('═══════════════════════════════════════════');
console.log('✅ Configuration loaded successfully');

export default config;
