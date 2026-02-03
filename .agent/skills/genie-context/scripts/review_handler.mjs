#!/usr/bin/env node
/**
 * Genie Context - PR Review Handler
 * 
 * Handles incoming PR review requests from GitHub Actions webhook.
 * Analyzes diffs against the codebase RAG index and posts feedback.
 * 
 * Usage (via webhook): Receives POST from GitHub Action
 * Usage (manual): node review_handler.mjs <pr_number>
 * 
 * Lite Mode: Uses Gemini 1.5 Pro for deep analysis (API only)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const PROJECT_ROOT = '/Users/jroot/Desktop/ai-nexus/ai-saas';
const REPO = 'invidias-codem/ai-saas';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Debounce cache file
const DEBOUNCE_FILE = '/tmp/genie-pr-review-cache.json';
const DEBOUNCE_MINUTES = 5;

/**
 * Check if we should debounce this review
 */
function shouldDebounce(prNumber) {
    if (!existsSync(DEBOUNCE_FILE)) return false;

    try {
        const cache = JSON.parse(readFileSync(DEBOUNCE_FILE, 'utf-8'));
        const lastReview = cache[prNumber];
        if (!lastReview) return false;

        const elapsed = (Date.now() - lastReview) / 1000 / 60;
        return elapsed < DEBOUNCE_MINUTES;
    } catch {
        return false;
    }
}

/**
 * Update debounce cache
 */
function updateDebounce(prNumber) {
    let cache = {};
    if (existsSync(DEBOUNCE_FILE)) {
        try {
            cache = JSON.parse(readFileSync(DEBOUNCE_FILE, 'utf-8'));
        } catch { }
    }
    cache[prNumber] = Date.now();
    writeFileSync(DEBOUNCE_FILE, JSON.stringify(cache));
}

/**
 * Generate embedding using Gemini API
 */
async function generateEmbedding(text) {
    const truncated = text.substring(0, 8000);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text: truncated }] },
                taskType: 'RETRIEVAL_QUERY'
            })
        }
    );

    const data = await response.json();
    return data.embedding?.values || [];
}

/**
 * Query RAG for architectural context
 */
async function getArchitecturalContext(query) {
    const embedding = await generateEmbedding(query);

    if (embedding.length === 0) return null;

    const { data, error } = await supabase.rpc('match_graph_nodes', {
        query_embedding: embedding,
        match_threshold: 0.4,
        match_count: 3
    });

    if (error) {
        console.log('⚠️  RAG query failed:', error.message);
        return null;
    }

    return data?.map(r => r.content).join('\n\n') || null;
}

/**
 * Analyze code with Gemini 1.5 Pro
 */
async function analyzeWithGemini(diff, context, prTitle) {
    const prompt = `You are a senior code reviewer for the Genie AI SaaS project.

## Project Context
${context || 'No architectural context available.'}

## Tech Stack
- Frontend: Next.js 14, React 18, TailwindCSS
- Backend: Firebase Cloud Functions, Supabase
- AI: Google Gemini, Vertex AI
- Auth: Clerk
- Brand: "Invidious" theme (dark mode, gradients, modern aesthetic)

## PR Title
${prTitle}

## Code Diff
\`\`\`diff
${diff.substring(0, 15000)}
\`\`\`

## Review Instructions
Analyze this code change and provide feedback on:
1. **Consistency**: Does it match existing patterns in the codebase?
2. **Tailwind/Styling**: Does it follow the Invidious brand theme?
3. **Type Safety**: Are there any \`any\` types or type safety concerns?
4. **Error Handling**: Is error handling present and consistent?
5. **Performance**: Any obvious performance concerns?

Format your response as a GitHub PR comment with:
- A brief summary (1-2 sentences)
- Specific suggestions (if any) with file/line references
- An overall recommendation (✅ Approve / ⚠️ Request Changes / 💭 Comment)

Keep feedback constructive and concise.`;

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GOOGLE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 2000
                }
            })
        }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Get PR diff using GitHub CLI
 */
function getPRDiff(prNumber) {
    try {
        const diff = execSync(`gh pr diff ${prNumber} --repo ${REPO}`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        return diff;
    } catch (err) {
        console.error('❌ Failed to get PR diff:', err.message);
        return null;
    }
}

/**
 * Get PR details using GitHub CLI
 */
function getPRDetails(prNumber) {
    try {
        const json = execSync(
            `gh pr view ${prNumber} --repo ${REPO} --json title,author,files,additions,deletions`,
            { cwd: PROJECT_ROOT, encoding: 'utf-8' }
        );
        return JSON.parse(json);
    } catch (err) {
        console.error('⚠️  Failed to get PR details:', err.message);
        return { title: `PR #${prNumber}`, author: { login: 'unknown' } };
    }
}

/**
 * Post comment to PR using GitHub CLI
 */
function postPRComment(prNumber, comment) {
    try {
        execSync(`gh pr comment ${prNumber} --repo ${REPO} --body "${comment.replace(/"/g, '\\"')}"`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8'
        });
        console.log('✅ Posted review comment');
        return true;
    } catch (err) {
        console.error('❌ Failed to post comment:', err.message);
        return false;
    }
}

/**
 * Main review function
 */
async function reviewPR(prNumber) {
    console.log(`\n🔍 Genie AI PR Review - #${prNumber}\n`);
    console.log('═══════════════════════════════════════════\n');

    // Check debounce
    if (shouldDebounce(prNumber)) {
        console.log('⏳ Debouncing - reviewed recently. Skipping.');
        return;
    }

    // Get PR details and diff
    const details = getPRDetails(prNumber);
    console.log(`📋 PR: ${details.title}`);
    console.log(`👤 Author: ${details.author?.login}`);
    console.log(`📊 Changes: +${details.additions || '?'} / -${details.deletions || '?'}`);
    console.log();

    const diff = getPRDiff(prNumber);
    if (!diff) {
        console.log('❌ Could not retrieve diff. Aborting.');
        return;
    }

    // Get architectural context from RAG
    console.log('🧠 Querying architectural context...');
    const contextQuery = `${details.title} ${diff.substring(0, 500)}`;
    const context = await getArchitecturalContext(contextQuery);

    if (context) {
        console.log('   ✅ Found relevant context from RAG');
    } else {
        console.log('   ⚠️  No matching context found');
    }

    // Analyze with Gemini
    console.log('🤖 Analyzing with Gemini 1.5 Pro...');
    const review = await analyzeWithGemini(diff, context, details.title);

    if (!review) {
        console.log('❌ Analysis failed. Aborting.');
        return;
    }

    // Format and post comment
    const comment = `## 🤖 Genie AI Code Review

${review}

---
*Powered by Antigravity IDE • [View Codebase Context](https://gen1e.xyz)*`;

    console.log('\n📝 Review:\n');
    console.log(comment);
    console.log('\n═══════════════════════════════════════════\n');

    // Post to GitHub
    const posted = postPRComment(prNumber, comment);

    // Update debounce cache
    if (posted) {
        updateDebounce(prNumber);
    }
}

// === Webhook Server ===
// Starts if no PR number provided as argument

const prNumber = process.argv[2];

if (prNumber) {
    // Manual execution
    reviewPR(parseInt(prNumber, 10)).catch(console.error);
} else {
    // Start webhook server
    const http = await import('http');

    const PORT = process.env.OPENCLAW_WEBHOOK_PORT || 7878;
    const SECRET = process.env.OPENCLAW_WEBHOOK_SECRET || '';

    const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/') {
            // Verify secret if configured
            const authHeader = req.headers['authorization'];
            if (SECRET && authHeader !== `Bearer ${SECRET}`) {
                res.writeHead(401);
                res.end('Unauthorized');
                return;
            }

            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);

                    if (data.action === 'review_pr' && data.pr_number) {
                        console.log(`\n🔔 Webhook received: PR #${data.pr_number}`);
                        res.writeHead(200);
                        res.end(JSON.stringify({ status: 'accepted', pr: data.pr_number }));

                        // Process async
                        reviewPR(data.pr_number).catch(console.error);
                    } else {
                        res.writeHead(400);
                        res.end('Invalid request');
                    }
                } catch (err) {
                    res.writeHead(400);
                    res.end('Invalid JSON');
                }
            });
        } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'ok', service: 'genie-pr-reviewer' }));
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(PORT, () => {
        console.log(`\n🚀 Genie PR Reviewer webhook listening on port ${PORT}`);
        console.log(`   Health check: http://localhost:${PORT}/health`);
        console.log(`   POST webhook: http://localhost:${PORT}/`);
        console.log('\n   Waiting for GitHub Actions webhooks...\n');
    });
}
