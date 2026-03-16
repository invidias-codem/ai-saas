#!/usr/bin/env node
/**
 * Genie Context - Cloud Function Logs Handler
 * 
 * Streams real-time logs from GCP Cloud Functions to terminal/Slack.
 * Uses gcloud CLI for log streaming.
 * 
 * Usage:
 *   node logs_handler.mjs              # Stream all functions
 *   node logs_handler.mjs worker       # Filter to genie-worker
 *   node logs_handler.mjs errors       # Only errors
 *   node logs_handler.mjs --slack      # Post to Slack webhook
 * 
 * Lite Mode: Polls every 30s instead of streaming to save resources
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// Configuration
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'genie-ai-1ca85';
const SLACK_WEBHOOK = process.env.SLACK_LOG_WEBHOOK || process.env.SLACK_WEBHOOK_URL;
const PROJECT_ROOT = '/Users/jroot/Desktop/ai-nexus/ai-saas';

// Function names to monitor
const FUNCTIONS = [
    'genie-worker',
    'genie-dispatcher',
    'vector-agent'
];

// ═══════════════════════════════════════════════════════════════════
// 📊 Log Fetching
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch recent logs using gcloud CLI
 */
function fetchLogs(options = {}) {
    const {
        filter = '',
        limit = 50,
        severity = 'INFO',
        functionName = '',
        since = '10m'
    } = options;

    let logFilter = `resource.type="cloud_function"`;

    if (functionName) {
        logFilter += ` AND resource.labels.function_name=~"${functionName}"`;
    }

    if (filter === 'errors') {
        logFilter += ` AND severity>=ERROR`;
    } else if (severity !== 'INFO') {
        logFilter += ` AND severity>=${severity}`;
    }

    try {
        const result = execSync(
            `gcloud logging read '${logFilter}' \
        --project=${PROJECT_ID} \
        --limit=${limit} \
        --freshness=${since} \
        --format="json"`,
            { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
        );

        return JSON.parse(result || '[]');
    } catch (err) {
        console.error('❌ Failed to fetch logs:', err.message);
        return [];
    }
}

/**
 * Format a log entry for display
 */
function formatLogEntry(entry) {
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const severity = entry.severity || 'INFO';
    const functionName = entry.resource?.labels?.function_name || 'unknown';
    const message = entry.textPayload ||
        entry.jsonPayload?.message ||
        JSON.stringify(entry.jsonPayload || {}).substring(0, 200);

    const severityEmoji = {
        DEBUG: '🔍',
        INFO: 'ℹ️',
        WARNING: '⚠️',
        ERROR: '❌',
        CRITICAL: '🔥'
    };

    const emoji = severityEmoji[severity] || '📝';

    return `${emoji} [${timestamp}] ${functionName}: ${message}`;
}

// ═══════════════════════════════════════════════════════════════════
// 📺 Display Modes
// ═══════════════════════════════════════════════════════════════════

/**
 * Display logs in terminal
 */
function displayLogs(logs, options = {}) {
    if (logs.length === 0) {
        console.log('📭 No logs found for the specified criteria.');
        return '';
    }

    const header = `
╔══════════════════════════════════════════════════════════════╗
║              📋 GENIE CLOUD FUNCTION LOGS                    ║
║              Project: ${PROJECT_ID.padEnd(30)}    ║
╠══════════════════════════════════════════════════════════════╣`;

    console.log(header);

    // Reverse to show oldest first (chronological)
    const output = logs.reverse().map(entry => {
        const formatted = formatLogEntry(entry);
        console.log(`║ ${formatted.substring(0, 60).padEnd(60)} ║`);
        return formatted;
    });

    console.log('╚══════════════════════════════════════════════════════════════╝');

    return output.join('\n');
}

/**
 * Stream logs to Slack webhook
 */
async function postToSlack(logs) {
    if (!SLACK_WEBHOOK) {
        console.log('⚠️ No SLACK_LOG_WEBHOOK configured');
        return;
    }

    const errors = logs.filter(l =>
        l.severity === 'ERROR' || l.severity === 'CRITICAL'
    );

    if (errors.length === 0) {
        console.log('✅ No errors to report to Slack');
        return;
    }

    const message = {
        text: `🔥 *Genie Cloud Function Alerts*\n\n${errors.map(formatLogEntry).join('\n')}`
    };

    try {
        const response = await fetch(SLACK_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });

        if (response.ok) {
            console.log('✅ Posted errors to Slack');
        } else {
            console.error('❌ Failed to post to Slack:', response.status);
        }
    } catch (err) {
        console.error('❌ Slack webhook error:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════════
// 🔄 Live Streaming (Lite Mode: Polling)
// ═══════════════════════════════════════════════════════════════════

/**
 * Poll for new logs every interval
 */
async function startPolling(options = {}) {
    const { interval = 30000, slack = false, filter = '' } = options;

    console.log(`\n🔄 Polling logs every ${interval / 1000}s (Lite Mode)`);
    console.log(`   Filter: ${filter || 'all functions'}`);
    console.log(`   Slack: ${slack ? '✅ enabled' : '❌ disabled'}`);
    console.log('\n   Press Ctrl+C to stop\n');

    let lastTimestamp = new Date().toISOString();

    const poll = async () => {
        const logs = fetchLogs({
            filter,
            limit: 20,
            since: '1m',
            functionName: filter !== 'errors' ? filter : ''
        });

        // Filter to new logs only
        const newLogs = logs.filter(l => l.timestamp > lastTimestamp);

        if (newLogs.length > 0) {
            displayLogs(newLogs);
            lastTimestamp = newLogs[newLogs.length - 1].timestamp;

            if (slack) {
                await postToSlack(newLogs);
            }
        }
    };

    // Initial fetch
    await poll();

    // Poll interval
    setInterval(poll, interval);
}

/**
 * Real-time streaming using gcloud (more resource intensive)
 */
function startStreaming(filter = '') {
    console.log('\n📺 Starting real-time log stream...');
    console.log('   Press Ctrl+C to stop\n');

    let logFilter = 'resource.type="cloud_function"';
    if (filter === 'errors') {
        logFilter += ' AND severity>=ERROR';
    } else if (filter) {
        logFilter += ` AND resource.labels.function_name=~"${filter}"`;
    }

    const stream = spawn('gcloud', [
        'logging', 'tail',
        logFilter,
        `--project=${PROJECT_ID}`,
        '--format=json'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    stream.stdout.on('data', (data) => {
        try {
            const entries = data.toString().split('\n').filter(Boolean);
            entries.forEach(entry => {
                try {
                    const log = JSON.parse(entry);
                    console.log(formatLogEntry(log));
                } catch {
                    console.log(entry.substring(0, 100));
                }
            });
        } catch { }
    });

    stream.stderr.on('data', (data) => {
        console.error('Stream error:', data.toString());
    });

    stream.on('close', (code) => {
        console.log(`\n📺 Stream ended (code ${code})`);
    });

    process.on('SIGINT', () => {
        stream.kill();
        process.exit(0);
    });
}

// ═══════════════════════════════════════════════════════════════════
// 🎯 Command Router
// ═══════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const filter = args.find(a => !a.startsWith('--')) || '';
const isSlack = args.includes('--slack');
const isStream = args.includes('--stream');
const isWatch = args.includes('--watch') || args.includes('-w');

console.log('🔍 Genie Cloud Function Logs');
console.log('═══════════════════════════');

// Check gcloud auth
try {
    execSync('gcloud auth print-access-token', { encoding: 'utf-8', stdio: 'pipe' });
} catch {
    console.error('\n❌ Not authenticated with gcloud. Run:');
    console.error('   gcloud auth login');
    console.error('   gcloud config set project genie-ai-1ca85');
    process.exit(1);
}

if (isStream) {
    // Real-time streaming (more resource intensive)
    startStreaming(filter);
} else if (isWatch) {
    // Lite mode polling
    startPolling({ filter, slack: isSlack });
} else {
    // One-shot fetch
    const logs = fetchLogs({
        filter,
        limit: 30,
        functionName: filter !== 'errors' ? filter : ''
    });

    displayLogs(logs);

    if (isSlack) {
        postToSlack(logs);
    }

    console.log('\n💡 Tip: Use --watch for continuous polling, --stream for real-time');
}
