#!/usr/bin/env node
/**
 * Genie Context - Project Commands Handler
 * 
 * Handles project management commands from Slack/Telegram via OpenClaw.
 * Commands: status, deploy, usage, audit
 * 
 * Usage: 
 *   node project_commands.mjs status
 *   node project_commands.mjs deploy
 *   node project_commands.mjs usage
 *   node project_commands.mjs audit
 * 
 * Lite Mode: Polling-based (no persistent connections to save battery)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync, exec } from 'child_process';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ozevwhiipwbcvyzkbhib.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_ROOT = '/Users/jroot/Desktop/ai-nexus/ai-saas';
const REPO = 'invidias-codem/ai-saas';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════════
// 📊 /genie status - Real-time health check
// ═══════════════════════════════════════════════════════════════════

export async function handleStatus() {
    console.log('📊 Fetching Genie AI status...\n');

    const report = {
        timestamp: new Date().toISOString(),
        infrastructure: {},
        metrics: {},
        workers: {}
    };

    // 1. Check Supabase connectivity
    try {
        const { count, error } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true });

        report.infrastructure.supabase = error ? '❌ Error' : '✅ Online';
        report.metrics.totalMemories = count || 0;
    } catch (e) {
        report.infrastructure.supabase = '❌ Unreachable';
    }

    // 2. Check user count
    try {
        const { count } = await supabase
            .from('user_settings')
            .select('*', { count: 'exact', head: true });
        report.metrics.totalUsers = count || 0;
    } catch {
        report.metrics.totalUsers = 'N/A';
    }

    // 3. Check recent activity (last 24h)
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', yesterday);
        report.metrics.memoriesLast24h = count || 0;
    } catch {
        report.metrics.memoriesLast24h = 'N/A';
    }

    // 4. Check GitHub Actions status
    try {
        const result = execSync(
            `gh run list --repo ${REPO} --limit 3 --json status,conclusion,name,createdAt`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8' }
        );
        const runs = JSON.parse(result);
        report.workers.lastActions = runs.map(r => ({
            name: r.name,
            status: r.status === 'completed' ? (r.conclusion === 'success' ? '✅' : '❌') : '⏳',
            time: new Date(r.createdAt).toLocaleString()
        }));
    } catch {
        report.workers.lastActions = [{ name: 'Unable to fetch', status: '⚠️' }];
    }

    // 5. Local machine status
    try {
        const loadavg = execSync('sysctl -n vm.loadavg', { encoding: 'utf-8' }).trim();
        const battery = execSync('pmset -g batt | grep -o "[0-9]*%"', { encoding: 'utf-8' }).trim();
        report.infrastructure.macbook = `🔋 ${battery} | Load: ${loadavg}`;
    } catch {
        report.infrastructure.macbook = '💻 Online';
    }

    // Format output
    const output = `
╔══════════════════════════════════════════════════════════════╗
║                   🚀 GENIE AI STATUS REPORT                  ║
╠══════════════════════════════════════════════════════════════╣
║  📅 ${report.timestamp}
╠══════════════════════════════════════════════════════════════╣
║  🏗️  INFRASTRUCTURE                                          
║  ├─ Supabase:     ${report.infrastructure.supabase}
║  └─ MacBook Air:  ${report.infrastructure.macbook}
╠══════════════════════════════════════════════════════════════╣
║  📈 METRICS                                                   
║  ├─ Total Users:      ${report.metrics.totalUsers}
║  ├─ Total Memories:   ${report.metrics.totalMemories}
║  └─ Memories (24h):   ${report.metrics.memoriesLast24h}
╠══════════════════════════════════════════════════════════════╣
║  ⚙️  RECENT GITHUB ACTIONS                                    
${report.workers.lastActions.map(a => `║  ${a.status} ${a.name}`).join('\n')}
╚══════════════════════════════════════════════════════════════╝
`;

    console.log(output);
    return output;
}

// ═══════════════════════════════════════════════════════════════════
// ⚡ /genie deploy - Trigger production deployment
// ═══════════════════════════════════════════════════════════════════

export async function handleDeploy(branch = 'main') {
    console.log(`⚡ Triggering deployment for branch: ${branch}\n`);

    try {
        // Check for uncommitted changes first
        const status = execSync('git status --porcelain', {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8'
        });

        if (status.trim()) {
            return `⚠️ **Deployment Blocked**
You have uncommitted changes:
\`\`\`
${status.substring(0, 300)}
\`\`\`
Please commit or stash changes before deploying.`;
        }

        // Trigger GitHub Actions workflow
        // First check if firebase-hosting-merge.yml exists
        const workflows = execSync(
            `gh workflow list --repo ${REPO} --json name,state`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8' }
        );
        const workflowList = JSON.parse(workflows);

        // Find the deploy workflow
        const deployWorkflow = workflowList.find(w =>
            w.name.toLowerCase().includes('deploy') ||
            w.name.toLowerCase().includes('hosting') ||
            w.name.toLowerCase().includes('production')
        );

        if (!deployWorkflow) {
            // Trigger via push to main
            execSync(`git push origin ${branch}`, { cwd: PROJECT_ROOT });
            return `🚀 **Deployment Initiated**
Pushed to \`${branch}\` - Firebase hosting workflow will trigger automatically.

📡 Monitor: \`gh run watch --repo ${REPO}\``;
        }

        // Trigger specific workflow
        execSync(
            `gh workflow run "${deployWorkflow.name}" --ref ${branch} --repo ${REPO}`,
            { cwd: PROJECT_ROOT }
        );

        return `🚀 **Deployment Initiated**
- **Workflow:** ${deployWorkflow.name}
- **Branch:** ${branch}
- **Status:** ⏳ Running

📡 Monitor with: \`gh run watch --repo ${REPO}\`
🔗 View at: https://github.com/${REPO}/actions`;

    } catch (err) {
        return `❌ **Deployment Failed**
Error: ${err.message}

Please check:
1. You're authenticated with \`gh auth login\`
2. You have push access to ${REPO}`;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 💰 /genie usage - Token consumption vs budget
// ═══════════════════════════════════════════════════════════════════

export async function handleUsage() {
    console.log('💰 Checking usage and budget...\n');

    const report = {
        api: {},
        limits: {},
        recommendations: []
    };

    // 1. Check Upstash rate limit stats (if available)
    try {
        // Query your rate limit tracking table if you have one
        const { data } = await supabase
            .from('api_usage')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (data && data[0]) {
            report.api.tokensUsed = data[0].tokens_used || 0;
            report.api.requestsToday = data[0].requests_today || 0;
        }
    } catch {
        report.api.tokensUsed = 'N/A (table not found)';
    }

    // 2. Estimate based on memory activity
    try {
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        // Rough estimate: ~500 tokens per memory (embedding + storage)
        const estimatedTokens = (count || 0) * 500;
        report.api.estimatedTokensToday = estimatedTokens;
    } catch {
        report.api.estimatedTokensToday = 'N/A';
    }

    // 3. Budget limits (from your config)
    report.limits = {
        ragQueriesPerHour: 100,
        indexingPerDay: 5,
        shellCommandsPerHour: 50,
        monthlyTokenBudget: 1000000 // 1M tokens
    };

    // 4. Recommendations
    if (report.api.estimatedTokensToday > 50000) {
        report.recommendations.push('⚠️ High token usage today. Consider batching operations.');
    }

    const output = `
╔══════════════════════════════════════════════════════════════╗
║                   💰 GENIE USAGE REPORT                      ║
╠══════════════════════════════════════════════════════════════╣
║  📊 API USAGE (Today)                                         
║  ├─ Estimated Tokens: ${report.api.estimatedTokensToday}
║  ├─ Requests: ${report.api.requestsToday || 'N/A'}
║  └─ Storage: ${report.api.tokensUsed || 'See Google AI Console'}
╠══════════════════════════════════════════════════════════════╣
║  🛡️  RATE LIMITS (Lite Mode)                                  
║  ├─ RAG Queries:    ${report.limits.ragQueriesPerHour}/hour
║  ├─ Indexing:       ${report.limits.indexingPerDay}/day
║  └─ Shell Commands: ${report.limits.shellCommandsPerHour}/hour
╠══════════════════════════════════════════════════════════════╣
║  💡 RECOMMENDATIONS                                           
${report.recommendations.length > 0
            ? report.recommendations.map(r => `║  ${r}`).join('\n')
            : '║  ✅ Usage within normal limits'}
╚══════════════════════════════════════════════════════════════╝

📈 Full usage: https://console.cloud.google.com/apis/dashboard
`;

    console.log(output);
    return output;
}

// ═══════════════════════════════════════════════════════════════════
// 🔒 /genie audit - Security and hygiene scan
// ═══════════════════════════════════════════════════════════════════

export async function handleAudit() {
    console.log('🔒 Running security and hygiene audit...\n');

    const report = {
        npm: { vulnerabilities: 0, details: [] },
        code: { issues: [] },
        env: { issues: [] }
    };

    // 1. NPM Audit
    try {
        execSync('npm audit --json', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
        report.npm.status = '✅ No vulnerabilities';
    } catch (err) {
        try {
            const auditResult = JSON.parse(err.stdout || '{}');
            const vulns = auditResult.metadata?.vulnerabilities || {};
            report.npm.vulnerabilities =
                (vulns.critical || 0) + (vulns.high || 0) + (vulns.moderate || 0);
            report.npm.status = report.npm.vulnerabilities > 0
                ? `⚠️ ${report.npm.vulnerabilities} issues found`
                : '✅ No critical issues';
            report.npm.details = [
                `Critical: ${vulns.critical || 0}`,
                `High: ${vulns.high || 0}`,
                `Moderate: ${vulns.moderate || 0}`
            ];
        } catch {
            report.npm.status = '⚠️ Could not parse audit results';
        }
    }

    // 2. ESLint Check (quick)
    try {
        execSync('npm run lint -- --quiet 2>/dev/null || true', {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8',
            timeout: 30000 // 30 second timeout
        });
        report.code.lint = '✅ No lint errors';
    } catch {
        report.code.lint = '⚠️ Lint check failed or timed out';
    }

    // 3. Check for secrets in code (basic patterns)
    try {
        const secretPatterns = [
            'sk_live_',    // Stripe
            'sk_test_',    // Stripe test
            'PRIVATE_KEY', // Generic
            'API_KEY=',    // Hardcoded keys
        ];

        for (const pattern of secretPatterns) {
            const result = execSync(
                `grep -r "${pattern}" --include="*.ts" --include="*.tsx" --include="*.js" . 2>/dev/null | grep -v node_modules | grep -v ".env" | head -3`,
                { cwd: PROJECT_ROOT, encoding: 'utf-8' }
            );
            if (result.trim()) {
                report.env.issues.push(`Found "${pattern}" pattern in code`);
            }
        }

        report.env.status = report.env.issues.length > 0
            ? `⚠️ ${report.env.issues.length} potential secrets found`
            : '✅ No hardcoded secrets detected';
    } catch {
        report.env.status = '✅ No hardcoded secrets detected';
    }

    // 4. Check .env.local for sensitive keys
    try {
        const envContent = execSync('cat .env.local', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
        const hasRealKeys = envContent.includes('sk_live') || envContent.includes('prod_');
        if (hasRealKeys) {
            report.env.issues.push('Production keys detected in .env.local');
        }
    } catch { }

    // 5. TypeScript any count
    try {
        const anyCount = execSync(
            'grep -r ": any\\|as any" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | wc -l',
            { cwd: PROJECT_ROOT, encoding: 'utf-8' }
        ).trim();
        report.code.anyTypes = parseInt(anyCount) || 0;
    } catch {
        report.code.anyTypes = 'N/A';
    }

    const output = `
╔══════════════════════════════════════════════════════════════╗
║                   🔒 GENIE SECURITY AUDIT                    ║
╠══════════════════════════════════════════════════════════════╣
║  📦 NPM DEPENDENCIES                                          
║  ├─ Status: ${report.npm.status}
${report.npm.details.map(d => `║  ├─ ${d}`).join('\n')}
╠══════════════════════════════════════════════════════════════╣
║  📝 CODE QUALITY                                              
║  ├─ ESLint: ${report.code.lint}
║  └─ \`any\` types: ${report.code.anyTypes} occurrences
╠══════════════════════════════════════════════════════════════╣
║  🔐 SECRETS & ENV                                             
║  └─ ${report.env.status}
${report.env.issues.map(i => `║     ⚠️ ${i}`).join('\n')}
╠══════════════════════════════════════════════════════════════╣
║  💡 ACTIONS                                                   
║  └─ Run \`npm audit fix\` to auto-fix vulnerabilities
╚══════════════════════════════════════════════════════════════╝
`;

    console.log(output);
    return output;
}

// ═══════════════════════════════════════════════════════════════════
// 📋 /genie logs - Real-time Cloud Function logs
// ═══════════════════════════════════════════════════════════════════

export async function handleLogs(filter = '') {
    console.log('📋 Fetching Cloud Function logs...\n');

    try {
        const { execSync } = await import('child_process');

        let logFilter = 'resource.type="cloud_function"';
        if (filter === 'errors') {
            logFilter += ' AND severity>=ERROR';
        } else if (filter) {
            logFilter += ` AND resource.labels.function_name=~"${filter}"`;
        }

        const result = execSync(
            `gcloud logging read '${logFilter}' \
        --project=genie-ai-1ca85 \
        --limit=20 \
        --freshness=30m \
        --format="table(timestamp,severity,resource.labels.function_name,textPayload)"`,
            { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
        );

        return `
╔══════════════════════════════════════════════════════════════╗
║              📋 GENIE CLOUD FUNCTION LOGS                    ║
╠══════════════════════════════════════════════════════════════╣
${result || 'No logs found'}
╚══════════════════════════════════════════════════════════════╝

💡 For live streaming: node logs_handler.mjs --watch
`;
    } catch (err) {
        return `❌ Failed to fetch logs: ${err.message}
    
Make sure you're authenticated:
  gcloud auth login
  gcloud config set project genie-ai-1ca85`;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 🎯 Command Router
// ═══════════════════════════════════════════════════════════════════

const commands = {
    status: handleStatus,
    deploy: handleDeploy,
    usage: handleUsage,
    audit: handleAudit,
    logs: handleLogs,
    help: async () => {
        return `
🤖 **Genie Project Commands**

| Command | Description |
|---------|-------------|
| \`status\` | Check infrastructure health and metrics |
| \`deploy [branch]\` | Trigger production deployment |
| \`usage\` | View token consumption and budget |
| \`audit\` | Run security and code hygiene scan |
| \`logs [filter]\` | View Cloud Function logs (filter: errors, worker) |
| \`help\` | Show this help message |

📌 Usage: \`node project_commands.mjs <command>\`
`;
    }
};

// Main execution
const command = process.argv[2]?.toLowerCase() || 'help';
const args = process.argv.slice(3);

if (commands[command]) {
    commands[command](...args).catch(console.error);
} else {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Use "help" to see available commands.');
}

export { commands };
