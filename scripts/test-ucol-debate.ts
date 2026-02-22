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
        constraintRounds: 0,
        discoveredPatterns: [],
    };

    const router = new ContextRouter({
        onContextFlow: (entry: ContextFlowEntry) => {
            session.contextFlow.push(entry);
            logEvent(entry);
        },
    });

    const prompt = 'Build a comprehensive RBAC (Role-Based Access Control) Admin Panel for a B2B SaaS platform. It needs a main dashboard layout, a user management table with inline role editing, a complex permissions matrix grid where admins can toggle specific granular permissions (like `view_billing`, `edit_users`, `delete_workspaces`) for different custom roles, an invite user modal that supports bulk CSV invites, and an audit log activity feed showing who changed what permission. Ensure components handle complex state (e.g., preventing a user from removing their own admin access) and clearly delineate component boundaries.';

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
    console.log(`  Constraint rounds: ${session.constraintRounds}`);
    console.log(`  Components: ${plan.components.length}\n`);

    // ── Debate Analysis ──
    const approvals = allEvents.filter(e => e.action.includes('✓'));
    const rejections = allEvents.filter(e => e.action.includes('Rejected'));
    const autoApprovals = allEvents.filter(e => e.action.includes('Auto-approved'));
    const forceAccepts = allEvents.filter(e => e.action.includes('Force-accepted'));
    const constraintEvents = allEvents.filter(e => e.action.includes('🎯'));
    const noveltyEvents = allEvents.filter(e => e.action.includes('💡'));

    console.log(`${C.bold}Debate Loop Statistics:${C.reset}`);
    console.log(`  ${C.green}✓ Approvals:${C.reset} ${approvals.length}`);
    console.log(`  ${C.red}✗ Rejections:${C.reset} ${rejections.length}`);
    console.log(`  ${C.cyan}⚡ Auto-approvals (similarity escape):${C.reset} ${autoApprovals.length}`);
    console.log(`  ${C.yellow}⚠ Force-accepts (max attempts):${C.reset} ${forceAccepts.length}`);
    console.log(`  ${C.magenta}🎯 Creativity constraints imposed:${C.reset} ${constraintEvents.length}`);
    console.log(`  ${C.green}💡 Novel patterns discovered:${C.reset} ${noveltyEvents.length}\n`);

    // ── 3-axis score analysis ──
    const scoreEvents = allEvents.filter(e => e.action.match(/correct: \d+\/10, original: \d+\/10, pragmatism: \d+\/10/));
    if (scoreEvents.length > 0) {
        const parsed = scoreEvents.map(e => {
            const cMatch = e.action.match(/correct: (\d+)/);
            const oMatch = e.action.match(/original: (\d+)/);
            const pMatch = e.action.match(/pragmatism: (\d+)/);
            return {
                action: e.action,
                correct: cMatch ? parseInt(cMatch[1]) : 0,
                original: oMatch ? parseInt(oMatch[1]) : 0,
                pragmatism: pMatch ? parseInt(pMatch[1]) : 0,
            };
        });

        const avgCorrect = (parsed.reduce((a, b) => a + b.correct, 0) / parsed.length).toFixed(1);
        const avgOriginal = (parsed.reduce((a, b) => a + b.original, 0) / parsed.length).toFixed(1);
        const avgPragmatism = (parsed.reduce((a, b) => a + b.pragmatism, 0) / parsed.length).toFixed(1);

        console.log(`${C.bold}3-Axis Score Summary:${C.reset}`);
        console.log(`  ${C.blue}Correctness avg:${C.reset}  ${avgCorrect}/10`);
        console.log(`  ${C.magenta}Originality avg:${C.reset}  ${avgOriginal}/10`);
        console.log(`  ${C.yellow}Pragmatism avg:${C.reset}   ${avgPragmatism}/10`);
        console.log();
        console.log(`  ${C.bold}Per-component:${C.reset}`);
        for (const p of parsed) {
            const origColor = p.original >= 7 ? C.green : p.original >= 4 ? C.yellow : C.red;
            const pragColor = p.pragmatism >= 7 ? C.green : p.pragmatism >= 5 ? C.yellow : C.red;
            console.log(`    ${p.action.match(/[^✓✗⚠]+/)?.[0]?.trim() || ''}: correct ${p.correct}/10, ${origColor}original ${p.original}/10${C.reset}, ${pragColor}pragmatism ${p.pragmatism}/10${C.reset}`);
        }
        console.log();
    }

    // ── Discovered Patterns ──
    if (session.discoveredPatterns.length > 0) {
        console.log(`${C.bold}Discovered Patterns (cross-component evolution):${C.reset}`);
        for (const dp of session.discoveredPatterns) {
            console.log(`  ${C.green}💡${C.reset} ${C.bold}${dp.component}${C.reset}: ${dp.pattern} ${C.dim}(originality: ${dp.originalityScore}/10)${C.reset}`);
        }
        console.log();
    }

    // ── Rejection Details ──
    if (rejections.length > 0) {
        console.log(`${C.bold}Rejection Details:${C.reset}`);
        for (const rej of rejections) {
            console.log(`  ${C.red}✗${C.reset} ${rej.action}`);
            console.log(`    ${C.dim}${rej.reasoning.substring(0, 200)}${C.reset}\n`);
        }
    }

    // ── Constraint Details ──
    if (constraintEvents.length > 0) {
        console.log(`${C.bold}Constraint Details:${C.reset}`);
        for (const ce of constraintEvents) {
            console.log(`  ${C.magenta}🎯${C.reset} ${ce.action}`);
            console.log(`    ${C.dim}${ce.reasoning}${C.reset}\n`);
        }
    }

    // ── Verdict ──
    console.log(`${C.bold}═══════════════════════════════════════════════${C.reset}`);
    const evolutionHappened = session.discoveredPatterns.length > 0;
    const debateHappened = rejections.length > 0 || constraintEvents.length > 0;
    if (evolutionHappened) {
        console.log(`${C.green}${C.bold}  ✓ PATTERN EVOLUTION IS ACTIVE${C.reset}`);
        console.log(`${C.dim}  ${session.discoveredPatterns.length} pattern(s) discovered and propagated to later components.${C.reset}`);
    } else if (debateHappened) {
        console.log(`${C.green}${C.bold}  ✓ DEBATE LOOP IS ACTIVE${C.reset}`);
        console.log(`${C.dim}  Models debated but no novel patterns were discovered.${C.reset}`);
    } else {
        console.log(`${C.yellow}${C.bold}  ⚠ NO DEBATE OCCURRED${C.reset}`);
        console.log(`${C.dim}  All components passed first review. Try a complex prompt to trigger debates.${C.reset}`);
    }
    console.log(`${C.bold}═══════════════════════════════════════════════${C.reset}\n`);

    // ── File list ──
    console.log(`${C.bold}Generated Files:${C.reset}`);
    for (const file of files) {
        console.log(`  ${file.model === 'claude' ? C.magenta : C.dim}${file.path}${C.reset} (${file.language}, ${file.content.length} chars)`);
    }
    console.log();

    // ── Write files to disk for ground-truth compilation check ──
    const fs = await import('fs');
    const path = await import('path');
    const outDir = path.default.join(process.cwd(), 'generated', 'rbac-admin');
    fs.default.mkdirSync(outDir, { recursive: true });

    for (const file of files) {
        const filePath = path.default.join(outDir, file.path);
        fs.default.mkdirSync(path.default.dirname(filePath), { recursive: true });
        fs.default.writeFileSync(filePath, file.content);
    }
    console.log(`${C.green}✓ Files written to ${outDir}${C.reset}\n`);
}

runTest().catch(err => {
    console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}`);
    console.error(err.stack);
    process.exit(1);
});
