// scripts/test-ucol-debate.ts
// End-to-end test of the UCOL debate loop.
// Calls ContextRouter directly (bypassing auth) to observe:
// 1. Whether the debate loop triggers
// 2. Whether Gemini's reviews are substantive
// 3. Whether Claude's revisions address the critiques
//
// Usage: npx tsx scripts/test-ucol-debate.ts

// CRITICAL: dotenv must load BEFORE any lib/ imports (lib/env.ts runs Zod parse at import time)
import { config } from 'dotenv';
config({ path: '.env.local' });

import type { BuildSession, ContextFlowEntry } from '../lib/ucol/types';

// ── Colors for terminal output ──
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

const MODEL_COLORS: Record<string, string> = {
    user: C.cyan,
    gemini: C.blue,
    claude: C.magenta,
    system: C.yellow,
};

// ── Collect all events for analysis ──
const allEvents: ContextFlowEntry[] = [];
let reviewEvents: Array<{ component: string; action: string; reasoning: string; }> = [];

function logEvent(entry: ContextFlowEntry) {
    allEvents.push(entry);

    const srcColor = MODEL_COLORS[entry.source] || C.dim;
    const tgtColor = MODEL_COLORS[entry.target] || C.dim;
    const statusIcon = entry.status === 'complete' ? '✓' : entry.status === 'error' ? '✗' : '●';
    const statusColor = entry.status === 'complete' ? C.green : entry.status === 'error' ? C.red : C.yellow;

    console.log(
        `  ${statusColor}${statusIcon}${C.reset} ` +
        `${srcColor}${entry.source.padEnd(7)}${C.reset} → ` +
        `${tgtColor}${entry.target.padEnd(7)}${C.reset} ` +
        `${C.bold}${entry.action}${C.reset}`
    );

    if (entry.reasoning && entry.reasoning.length > 0) {
        const truncated = entry.reasoning.length > 120
            ? entry.reasoning.substring(0, 120) + '...'
            : entry.reasoning;
        console.log(`    ${C.dim}reason: ${truncated}${C.reset}`);
    }

    // Track review-related events
    if (entry.action.includes('Rejected') || entry.action.includes('approved') || entry.action.includes('Reviewing')) {
        reviewEvents.push({
            component: entry.action,
            action: entry.action,
            reasoning: entry.reasoning,
        });
    }
}

async function runTest() {
    // Dynamic import INSIDE the async function — dotenv is already loaded above
    const { ContextRouter } = await import('../lib/ucol/contextRouter');

    console.log(`\n${C.bold}═══════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  UCOL Debate Loop — End-to-End Test${C.reset}`);
    console.log(`${C.bold}═══════════════════════════════════════════════${C.reset}\n`);

    // Verify env vars
    if (!process.env.GOOGLE_API_KEY) {
        console.error(`${C.red}✗ GOOGLE_API_KEY not set${C.reset}`);
        process.exit(1);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        console.error(`${C.red}✗ ANTHROPIC_API_KEY not set${C.reset}`);
        process.exit(1);
    }
    console.log(`${C.green}✓ API keys found${C.reset}\n`);

    // Create session
    const session: BuildSession = {
        id: 'test-' + Date.now(),
        userId: 'test-user',
        files: [],
        contextFlow: [],
        reviewRounds: 0,
    };

    const router = new ContextRouter({
        onContextFlow: (entry: ContextFlowEntry) => {
            session.contextFlow.push(entry);
            logEvent(entry);
        },
    });

    const prompt = 'Build an e-commerce product dashboard with a product list table, add product form with validation, product detail modal with image gallery, shopping cart sidebar with quantity controls, and a stats overview showing total products, revenue, and top sellers';

    // ── Phase 1: Planning ──
    console.log(`${C.bold}── Phase 1: Gemini Planning ──${C.reset}`);
    console.log(`${C.dim}Prompt: "${prompt}"${C.reset}\n`);

    const startPlan = Date.now();
    let plan;
    try {
        plan = await router.planProject(prompt, session);
    } catch (err: any) {
        console.error(`\n${C.red}✗ Planning failed: ${err.message}${C.reset}`);
        process.exit(1);
    }
    const planTime = ((Date.now() - startPlan) / 1000).toFixed(1);

    console.log(`\n${C.green}✓ Plan generated in ${planTime}s${C.reset}`);
    console.log(`  App: ${C.bold}${plan.appName}${C.reset}`);
    console.log(`  Components: ${plan.components.length}`);
    console.log(`  Tech Stack: ${plan.techStack.join(', ')}`);
    console.log(`  Components: ${plan.components.map(c => c.name).join(', ')}\n`);

    // ── Phase 2: Code Generation with Debate Loop ──
    console.log(`${C.bold}── Phase 2: Claude Coding + Gemini Review Loop ──${C.reset}\n`);

    const startCode = Date.now();
    let files;
    try {
        files = await router.generateCode(plan, session);
    } catch (err: any) {
        console.error(`\n${C.red}✗ Code generation failed: ${err.message}${C.reset}`);
        process.exit(1);
    }
    const codeTime = ((Date.now() - startCode) / 1000).toFixed(1);

    // ── Analysis ──
    console.log(`\n${C.bold}═══════════════════════════════════════════════${C.reset}`);
    console.log(`${C.bold}  Analysis Report${C.reset}`);
    console.log(`${C.bold}═══════════════════════════════════════════════${C.reset}\n`);

    console.log(`${C.bold}Timing:${C.reset}`);
    console.log(`  Planning: ${planTime}s`);
    console.log(`  Coding + Review: ${codeTime}s`);
    console.log(`  Total: ${((Date.now() - startPlan) / 1000).toFixed(1)}s\n`);

    console.log(`${C.bold}Output:${C.reset}`);
    console.log(`  Files generated: ${files.length}`);
    console.log(`  Total review rounds: ${session.reviewRounds}`);
    console.log(`  Components: ${plan.components.length}\n`);

    // ── Debate Analysis: Was the review substantive? ──
    const approvals = allEvents.filter(e => e.action.includes('approved'));
    const rejections = allEvents.filter(e => e.action.includes('Rejected'));
    const autoApprovals = allEvents.filter(e => e.action.includes('Auto-approved'));
    const forceAccepts = allEvents.filter(e => e.action.includes('Force-accepted'));
    const revisions = allEvents.filter(e => e.action.includes('Revising'));

    console.log(`${C.bold}Debate Loop Statistics:${C.reset}`);
    console.log(`  ${C.green}✓ Approvals (first try):${C.reset} ${approvals.length - autoApprovals.length}`);
    console.log(`  ${C.red}✗ Rejections:${C.reset} ${rejections.length}`);
    console.log(`  ${C.yellow}↻ Revisions triggered:${C.reset} ${revisions.length}`);
    console.log(`  ${C.cyan}⚡ Auto-approvals (similarity escape):${C.reset} ${autoApprovals.length}`);
    console.log(`  ${C.yellow}⚠ Force-accepts (max attempts):${C.reset} ${forceAccepts.length}\n`);

    // ── Quality of Reviews ──
    console.log(`${C.bold}Review Quality Analysis:${C.reset}`);

    // Check if rejections had substantive reasons
    const substantiveRejections = rejections.filter(e =>
        e.reasoning.length > 20 &&
        !e.reasoning.toLowerCase().includes('style') &&
        (e.reasoning.toLowerCase().includes('import') ||
            e.reasoning.toLowerCase().includes('type') ||
            e.reasoning.toLowerCase().includes('error') ||
            e.reasoning.toLowerCase().includes('missing') ||
            e.reasoning.toLowerCase().includes('undefined') ||
            e.reasoning.toLowerCase().includes('prop') ||
            e.reasoning.toLowerCase().includes('compil'))
    );

    if (rejections.length === 0) {
        console.log(`  ${C.yellow}⚠ No rejections occurred — Gemini approved everything on first try.${C.reset}`);
        console.log(`  ${C.dim}This either means Claude's code was perfect, or the reviewer is too lenient.${C.reset}`);
        console.log(`  ${C.dim}For a simple counter app, first-pass approval is plausible.${C.reset}`);
    } else {
        console.log(`  Substantive rejections (citing real issues): ${substantiveRejections.length}/${rejections.length}`);
        const ratio = substantiveRejections.length / rejections.length;
        if (ratio >= 0.7) {
            console.log(`  ${C.green}✓ Review quality is HIGH — Gemini is catching real issues${C.reset}`);
        } else if (ratio >= 0.3) {
            console.log(`  ${C.yellow}⚠ Review quality is MIXED — some rejections may be superficial${C.reset}`);
        } else {
            console.log(`  ${C.red}✗ Review quality is LOW — Gemini may be rubber-stamping rejections${C.reset}`);
        }

        // Print rejection details
        console.log(`\n${C.bold}Rejection Details:${C.reset}`);
        for (const rej of rejections) {
            const scoreMatch = rej.action.match(/score: (\d+)/);
            const score = scoreMatch ? scoreMatch[1] : '?';
            console.log(`  ${C.red}✗${C.reset} ${rej.action}`);
            console.log(`    ${C.dim}Reason: ${rej.reasoning.substring(0, 200)}${C.reset}`);
            console.log();
        }
    }

    // ── Were revisions actually different? ──
    if (revisions.length > 0) {
        console.log(`${C.bold}Revision Analysis:${C.reset}`);
        console.log(`  ${C.dim}Claude was asked to revise ${revisions.length} time(s).${C.reset}`);
        if (autoApprovals.length > 0) {
            console.log(`  ${C.yellow}⚡ ${autoApprovals.length} revision(s) triggered the similarity escape hatch.${C.reset}`);
            console.log(`  ${C.dim}This means Claude disagreed with Gemini's critique and kept its code.${C.reset}`);
        }
    }

    // ── Score summary ──
    const scoreEvents = allEvents.filter(e => e.action.match(/score: \d+/));
    if (scoreEvents.length > 0) {
        const scores = scoreEvents.map(e => {
            const match = e.action.match(/score: (\d+)/);
            return match ? parseInt(match[1]) : 0;
        }).filter(s => s > 0);

        if (scores.length > 0) {
            const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);
            console.log(`\n${C.bold}Score Summary:${C.reset}`);
            console.log(`  Average: ${avgScore}/10`);
            console.log(`  Range: ${minScore}-${maxScore}`);
            console.log(`  Scores: [${scores.join(', ')}]`);
        }
    }

    // ── Verdict ──
    console.log(`\n${C.bold}═══════════════════════════════════════════════${C.reset}`);
    const debateHappened = rejections.length > 0 || autoApprovals.length > 0;
    if (debateHappened) {
        console.log(`${C.green}${C.bold}  ✓ DEBATE LOOP IS ACTIVE${C.reset}`);
        console.log(`${C.dim}  Models are genuinely collaborating through the review cycle.${C.reset}`);
    } else {
        console.log(`${C.yellow}${C.bold}  ⚠ NO DEBATE OCCURRED${C.reset}`);
        console.log(`${C.dim}  All components passed first review. Try a more complex prompt${C.reset}`);
        console.log(`${C.dim}  to trigger rejections (e.g., "Build a full e-commerce app").${C.reset}`);
    }
    console.log(`${C.bold}═══════════════════════════════════════════════${C.reset}\n`);

    // ── Dump all generated file paths ──
    console.log(`${C.bold}Generated Files:${C.reset}`);
    for (const file of files) {
        console.log(`  ${file.model === 'claude' ? C.magenta : C.dim}${file.path}${C.reset} (${file.language}, ${file.content.length} chars)`);
    }
    console.log();
}

runTest().catch(err => {
    console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exit(1);
});
