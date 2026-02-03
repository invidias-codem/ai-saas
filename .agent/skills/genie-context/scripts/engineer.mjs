#!/usr/bin/env node
/**
 * Genie Context - Autonomous Engineer Agent
 * 
 * Takes a software engineering task, plans the changes,
 * and executes them on the codebase.
 * 
 * Usage: node engineer.mjs "Add a health check endpoint at /api/health"
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// Configuration
const PROJECT_ROOT = '/Users/jroot/Desktop/ai-nexus/ai-saas';

// Load .env.local if not in environment
if (!process.env.GOOGLE_API_KEY || !process.env.SUPABASE_URL) {
    try {
        const envPath = path.join(PROJECT_ROOT, '.env.local');
        if (existsSync(envPath)) {
            const envContent = readFileSync(envPath, 'utf-8');
            envContent.split('\n').forEach(line => {
                const [key, ...value] = line.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
                }
            });
        }
    } catch (e) {
        console.warn('⚠️ Could not load .env.local');
    }
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/**
 * Step 1: Query RAG for Context
 */
async function getContext(task) {
    console.log(`🧠 Gathering context for: "${task}"...`);
    try {
        const result = execSync(`node ${path.join(PROJECT_ROOT, '.agent/skills/genie-context/scripts/query_rag.mjs')} "${task}"`, {
            encoding: 'utf-8',
            env: {
                ...process.env,
                GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
                SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
                SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
            }
        });
        return result;
    } catch (e) {
        return "No specific codebase context found via RAG.";
    }
}

// Imports
import { generateContent } from './llm_provider.mjs';

/**
 * Step 2: Plan the changes
 */
/**
 * Step 2: Plan the changes
 */
async function planChanges(task, context) {
    console.log('📝 Planning changes...');

    const systemPrompt = `You are a Senior Software Engineer.
Your goal is to plan a set of file modifications and terminal commands to accomplish a task.
You have access to the following context from the codebase:

${context}

Rules:
1. Return ONLY a JSON object with the following structure:
{
  "plan": "Brief description of the plan",
  "steps": [
    { "type": "write", "path": "path/to/file", "content": "full file content" },
    { "type": "command", "command": "shell command to run" }
  ]
}
2. For "write" steps, provide the COMPLETE new content of the file.
3. For "command" steps, assume you are in the project root.
4. **ALWAYS** start with a command to create a logical branch name:
   { "type": "command", "command": "git checkout -b genie/task-slug || git checkout genie/task-slug" }
5. **ALWAYS** include a final step to commit the changes (BUT DO NOT PUSH):
   { "type": "command", "command": "git add . && git commit -m 'feat: [Task Summary]'" }
6. Do not wrap the JSON in markdown blocks.`;

    const userPrompt = `Task: ${task}`;

    try {
        const responseText = await generateContent(systemPrompt, userPrompt, { jsonMode: true });

        // Clean up markdown if present (Claude likes to add it)
        const cleanJson = responseText.replace(/```json\n|\n```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error('❌ Planning failed:', e);
        process.exit(1);
    }
}

/**
 * Step 3: Execute the plan
 */
async function executePlan(plan) {
    if (!plan || !plan.steps) {
        console.error('❌ Invalid plan: No steps generated.');
        return;
    }
    console.log(`🚀 Executing plan: ${plan.plan}`);

    for (const step of plan.steps) {
        if (step.type === 'write') {
            const fullPath = path.join(PROJECT_ROOT, step.path);
            const dir = path.dirname(fullPath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

            console.log(`  💾 Writing to ${step.path}...`);
            writeFileSync(fullPath, step.content);
        } else if (step.type === 'command') {
            console.log(`  💻 Running: ${step.command}...`);
            try {
                execSync(step.command, { cwd: PROJECT_ROOT, stdio: 'inherit' });
            } catch (e) {
                console.error(`  ❌ Command failed: ${step.command} `);
            }
        }
    }
}

// Main execution
const task = process.argv[2];
const isPlanOnly = process.argv.includes('--plan-only');
const planArgIndex = process.argv.indexOf('--execute-plan');
const planFileIndex = process.argv.indexOf('--plan-file');

let planJson = null;
if (planArgIndex !== -1) {
    planJson = process.argv[planArgIndex + 1];
} else if (planFileIndex !== -1) {
    const filePath = process.argv[planFileIndex + 1];
    if (existsSync(filePath)) {
        planJson = readFileSync(filePath, 'utf-8');
    } else {
        console.error(`❌ Plan file not found: ${filePath}`);
        process.exit(1);
    }
} else if (!task) { // If no task and no plan, show usage
    console.log('Usage: node engineer.mjs "task" [--plan-only] [--plan-file path/to/json]');
    process.exit(1);
}

if (planJson) {
    let plan = JSON.parse(planJson);

    // Unwrap if it's the Telegram { task, plan } wrapper
    if (plan.plan && plan.plan.steps) {
        plan = plan.plan;
    }

    await executePlan(plan);
    console.log('\n✅ Approved plan executed autonomously by GenieBot.');

    // Social Update
    try {
        const socialScript = path.join(PROJECT_ROOT, '.agent/skills/genie-context/scripts/social.mjs');
        execSync(`node ${socialScript} post "Just completed engineering task: ${task}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error('⚠️ Failed to post social update to Moltbook.');
    }
} else {
    const context = await getContext(task);
    const plan = await planChanges(task, context);

    if (isPlanOnly) {
        // Output JSON for Slack blocks integration
        console.log('---JSON_START---');
        console.log(JSON.stringify(plan, null, 2));
        console.log('---JSON_END---');
    } else {
        await executePlan(plan);
        console.log('\n✅ Task completed autonomously by GenieBot.');

        // Social Update
        try {
            const socialScript = path.join(PROJECT_ROOT, '.agent/skills/genie-context/scripts/social.mjs');
            execSync(`node ${socialScript} post "Just completed engineering task: ${task}"`, { stdio: 'inherit' });
        } catch (e) {
            console.error('⚠️ Failed to post social update to Moltbook.');
        }
    }
}
