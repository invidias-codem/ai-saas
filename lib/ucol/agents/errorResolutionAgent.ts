/**
 * UCOL Error Resolution Agent — Main Orchestrator
 *
 * Pipeline:
 *   1. Fetch pending error logs from Supabase
 *   2. Classify each error (Gemini)
 *   3. Gather relevant source files (GitHub API)
 *   4. Generate fix (Gemini analysis → Claude code, with Gemini fallback)
 *   5. Create branch, commit, open PR (Octokit)
 *   6. Update Supabase log record with resolution status
 *
 * Human gate: PRs are NEVER auto-merged. Human reviews + approves.
 */

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';
import { classifyError } from './errorClassifier';
import { gatherRelevantFiles, createBranch, commitFileToBranch, openPullRequest } from './codebaseExplorer';
import { generateFix } from './fixGenerator';
import type { ResolutionResult, ClassifiedError, ErrorCategory } from './types';

// ─── Supabase ─────────────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

// Categories the agent can autonomously attempt to fix.
// 'unknown' and 'api_error' always escalate to human.
const AUTO_RESOLVABLE: ErrorCategory[] = [
  'undefined_component',
  'missing_dependency',
  'import_error',
  'type_error',
  'hydration_mismatch',
  'env_missing',
  'unknown',
  'api_error',
];

// ─── Status helpers ───────────────────────────────────────────────────────────

async function updateLogStatus(
  logId: string,
  status: string,
  extra: Record<string, any> = {}
): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('logs')
    .update({ resolution_status: status, ...extra, updated_at: new Date().toISOString() })
    .eq('id', logId);
}

// ─── Core resolution flow ─────────────────────────────────────────────────────

async function resolveError(log: {
  id: string;
  message: string;
  timestamp: string;
}): Promise<ResolutionResult> {
  const { id: logId, message, timestamp } = log;

  try {
    // Step 1: Classify
    await updateLogStatus(logId, 'classifying');
    console.log(`[ErrorResolutionAgent] Classifying log ${logId}...`);
    const classified: ClassifiedError = await classifyError(logId, message, timestamp);

    console.log(`[ErrorResolutionAgent] Category: ${classified.category} (confidence: ${classified.confidence})`);

    // Step 2: Escalate if not auto-resolvable or low confidence
    if (!AUTO_RESOLVABLE.includes(classified.category) || classified.confidence < 0.6) {
      await updateLogStatus(logId, 'needs_human', {
        classification: classified.category,
        classification_summary: classified.summary,
      });
      return { logId, status: 'needs_human', category: classified.category };
    }

    // Step 3: Gather relevant files
    await updateLogStatus(logId, 'exploring');
    console.log(`[ErrorResolutionAgent] Gathering files for ${classified.suspectedFiles.length} suspects...`);

    // Extract search keywords from the error message
    const searchTerms = extractSearchTerms(classified.rawMessage);
    const files = await gatherRelevantFiles(classified.suspectedFiles, searchTerms);

    if (files.length === 0) {
      await updateLogStatus(logId, 'needs_human', {
        classification: classified.category,
        classification_summary: `${classified.summary} — no source files found`,
      });
      return { logId, status: 'needs_human', category: classified.category };
    }

    // Step 4: Generate fix
    await updateLogStatus(logId, 'generating');
    console.log(`[ErrorResolutionAgent] Generating fix for ${files.length} files...`);
    const fix = await generateFix(classified, files);

    if (fix.confidence < 0.5 || Object.keys(fix.fileChanges).length === 0) {
      await updateLogStatus(logId, 'needs_human', {
        classification: classified.category,
        classification_summary: `${classified.summary} — fix confidence too low (${fix.confidence})`,
      });
      return { logId, status: 'needs_human', category: classified.category };
    }

    // Step 5: Create branch + commit + PR
    const branchName = `fix/mcts/auto-resolve-${Date.now()}`;
    console.log(`[ErrorResolutionAgent] Creating branch ${branchName}...`);
    await createBranch(branchName);

    for (const [filePath, newContent] of Object.entries(fix.fileChanges)) {
      const originalFile = files.find(f => f.path === filePath);
      if (!originalFile) {
        console.warn(`[ErrorResolutionAgent] File not found in fetched set: ${filePath}`);
        continue;
      }

      await commitFileToBranch(
        branchName,
        originalFile,
        newContent,
        `fix: auto-resolve ${classified.category} in ${filePath}\n\n${fix.explanation.slice(0, 200)}`
      );
    }

    console.log(`[ErrorResolutionAgent] Opening PR...`);
    const pr = await openPullRequest(branchName, fix.prTitle, fix.prBody);

    // Step 6: Update Supabase record
    await updateLogStatus(logId, 'pr_open', {
      classification: classified.category,
      classification_summary: classified.summary,
      pr_url: pr.url,
      pr_number: pr.number,
    });

    console.log(`[ErrorResolutionAgent] ✅ PR opened: ${pr.url}`);
    return { logId, status: 'pr_open', category: classified.category, prUrl: pr.url, prNumber: pr.number };

  } catch (err: any) {
    console.error(`[ErrorResolutionAgent] Failed for log ${logId}:`, err);
    await updateLogStatus(logId, 'failed', { agent_error: err.message });
    return { logId, status: 'failed', category: 'unknown', error: err.message };
  }
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

function extractSearchTerms(message: string): string[] {
  const terms: string[] = [];

  // Extract component/function names from React errors
  const componentMatch = message.match(/at (\w+)/g);
  if (componentMatch) terms.push(...componentMatch.slice(0, 3).map(m => m.replace('at ', '')));

  // Extract import paths
  const importMatch = message.match(/['"]([^'"]+)['"]/g);
  if (importMatch) {
    terms.push(
      ...importMatch
        .map(m => m.replace(/['"]/g, ''))
        .filter(m => m.startsWith('@/') || m.includes('/'))
        .slice(0, 3)
    );
  }

  // Extract module names
  const moduleMatch = message.match(/Cannot find module ['"]([^'"]+)['"]/);
  if (moduleMatch) terms.push(moduleMatch[1]);

  return [...new Set(terms)].slice(0, 5);
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

export interface BatchResolutionOptions {
  /** Max errors to process per run (default: 5) */
  limit?: number;
  /** Only process errors older than N minutes (avoid flapping) */
  minAgeMinutes?: number;
}

/**
 * Process a batch of pending error logs.
 * Called by the cron job at app/api/cron/error-resolution/route.ts
 */
export async function runBatchResolution(
  options: BatchResolutionOptions = {}
): Promise<ResolutionResult[]> {
  const { limit = 5, minAgeMinutes = 5 } = options;
  const supabase = getSupabase();

  const minAge = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();

  // Fetch pending error logs
  const { data: logs, error } = await supabase
    .from('logs')
    .select('id, message, timestamp')
    .eq('level', 'error')
    .in('resolution_status', ['pending', null])
    .lt('timestamp', minAge)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`[ErrorResolutionAgent] Supabase fetch failed: ${error.message}`);
  }

  if (!logs || logs.length === 0) {
    console.log('[ErrorResolutionAgent] No pending errors to process.');
    return [];
  }

  console.log(`[ErrorResolutionAgent] Processing ${logs.length} error(s)...`);

  // Process sequentially to avoid hammering APIs
  const results: ResolutionResult[] = [];
  for (const log of logs) {
    const result = await resolveError(log);
    results.push(result);

    // Brief pause between resolutions
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}

/**
 * Resolve a single error by log ID.
 * Useful for manual triggering from a dashboard.
 */
export async function resolveSingleError(logId: string): Promise<ResolutionResult> {
  const supabase = getSupabase();

  const { data: log, error } = await supabase
    .from('logs')
    .select('id, message, timestamp')
    .eq('id', logId)
    .single();

  if (error || !log) {
    throw new Error(`[ErrorResolutionAgent] Log ${logId} not found`);
  }

  return resolveError(log);
}
