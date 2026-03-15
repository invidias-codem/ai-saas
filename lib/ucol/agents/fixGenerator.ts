/**
 * UCOL Error Resolution Agent — FixGenerator
 *
 * Gemini analyzes the bug in context, then Claude generates the fix.
 * Falls back to Gemini if Claude is unavailable (credits depleted, etc.).
 *
 * Output: a GeneratedFix with per-file patches and PR metadata.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type { ClassifiedError, CodebaseFile, GeneratedFix } from './types';

// ─── Model clients ────────────────────────────────────────────────────────────

function getGemini() {
  return new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

// ─── Phase 1: Gemini Bug Analysis ────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are a senior Next.js engineer performing root-cause analysis.

You will receive:
1. A classified production error
2. The relevant source files

Your job: produce a precise, actionable analysis in JSON with this exact shape:
{
  "rootCause": "<exact technical explanation of the bug>",
  "filesToChange": ["<relative path>", ...],
  "fixStrategy": "<step-by-step description of how to fix it>",
  "riskLevel": "low" | "medium" | "high",
  "branchSlug": "<kebab-case branch name, e.g. fix/undefined-component-codepanel>",
  "prTitle": "<concise PR title>",
  "prBodyIntro": "<1-2 sentence PR description>"
}

Return ONLY valid JSON. No markdown fences.`;

// Cost cap: max chars of source file content sent to Gemini per file.
// 1000 chars ≈ 250 tokens — enough for error context without burning budget.
const MAX_FILE_CONTEXT_CHARS = 1000;

async function analyzeWithGemini(
  error: ClassifiedError,
  files: CodebaseFile[]
): Promise<any> {
  // Use Flash instead of Pro for analysis — 20x cheaper, sufficient for classification tasks.
  const model = getGemini().getGenerativeModel({ model: 'gemini-2.0-flash' });

  const filesContext = files
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, MAX_FILE_CONTEXT_CHARS)}\n\`\`\``)
    .join('\n\n');

  const prompt = `${ANALYSIS_PROMPT}

## Error Details
Category: ${error.category}
Summary: ${error.summary}
Raw message: ${error.rawMessage.slice(0, 1000)}

## Source Files
${filesContext}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

// ─── Phase 2: Claude Code Fix ─────────────────────────────────────────────────

const FIX_PROMPT = `You are an expert Next.js/React engineer generating a surgical bug fix.

You will receive:
1. A root-cause analysis from Gemini
2. The full content of files that need changing

Your job: return a JSON object with this exact shape:
{
  "explanation": "<detailed explanation of what changed and why>",
  "confidence": <0.0 to 1.0>,
  "fileChanges": {
    "<relative/path/to/file.tsx>": "<COMPLETE new file content — not a diff>"
  }
}

Rules:
- fileChanges must contain the COMPLETE new file content for each changed file
- Do NOT include files that don't need changes
- Be surgical — change only what is necessary to fix the bug
- Preserve all existing functionality
- Add a brief comment near the fix explaining what was changed and why
- Return ONLY valid JSON. No markdown fences.`;

async function generateFixWithClaude(
  analysis: any,
  files: CodebaseFile[]
): Promise<{ explanation: string; confidence: number; fileChanges: Record<string, string> }> {
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic client unavailable');

  const filesToChange: CodebaseFile[] = files.filter(f =>
    analysis.filesToChange?.includes(f.path)
  );

  if (filesToChange.length === 0) {
    throw new Error('No matching files found for fix generation');
  }

  const filesContext = filesToChange
    .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const prompt = `${FIX_PROMPT}

## Root-Cause Analysis (from Gemini)
${JSON.stringify(analysis, null, 2)}

## Files to Fix
${filesContext}`;

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (message.content[0] as any).text.trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  return JSON.parse(text);
}

// ─── Phase 2 fallback: Gemini Code Fix ───────────────────────────────────────

async function generateFixWithGemini(
  analysis: any,
  files: CodebaseFile[]
): Promise<{ explanation: string; confidence: number; fileChanges: Record<string, string> }> {
  // Flash fallback — keeps GCP costs predictable when Claude is unavailable.
  const model = getGemini().getGenerativeModel({ model: 'gemini-2.0-flash' });

  const filesToChange = files.filter(f => analysis.filesToChange?.includes(f.path));
  const filesContext = filesToChange
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, MAX_FILE_CONTEXT_CHARS)}\n\`\`\``)
    .join('\n\n');

  const prompt = `${FIX_PROMPT}

## Root-Cause Analysis
${JSON.stringify(analysis, null, 2)}

## Files to Fix
${filesContext}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');

  return JSON.parse(text);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Full UCOL fix generation pipeline:
 * 1. Gemini analyzes root cause
 * 2. Claude (or Gemini fallback) generates the fix
 */
export async function generateFix(
  error: ClassifiedError,
  files: CodebaseFile[]
): Promise<GeneratedFix> {
  // Phase 1: Gemini analysis
  console.log(`[FixGenerator] Phase 1: Gemini analyzing ${error.category} error...`);
  const analysis = await analyzeWithGemini(error, files);

  // Phase 2: Code generation
  let fixResult: { explanation: string; confidence: number; fileChanges: Record<string, string> };
  let coder = 'claude';

  try {
    console.log('[FixGenerator] Phase 2: Claude generating fix...');
    fixResult = await generateFixWithClaude(analysis, files);
  } catch (err: any) {
    console.warn(`[FixGenerator] Claude unavailable (${err.message}), falling back to Gemini...`);
    coder = 'gemini-fallback';
    fixResult = await generateFixWithGemini(analysis, files);
  }

  // Build PR body
  const prBody = `## 🤖 Automated Fix — UCOL Error Resolution Agent

**Error Category:** \`${error.category}\`
**Detected:** ${error.timestamp}
**Coder:** ${coder}
**Confidence:** ${Math.round(fixResult.confidence * 100)}%

### Root Cause
${analysis.rootCause}

### Fix Summary
${fixResult.explanation}

### Files Changed
${Object.keys(fixResult.fileChanges).map(f => `- \`${f}\``).join('\n')}

### Risk Level
${analysis.riskLevel?.toUpperCase() ?? 'UNKNOWN'}

---
> ⚠️ This PR was generated autonomously. Please review all changes before merging.
> Original error log: \`${error.rawMessage.slice(0, 300)}\``;

  return {
    explanation: fixResult.explanation,
    confidence: fixResult.confidence,
    fileChanges: fixResult.fileChanges,
    branchSlug: analysis.branchSlug ?? `fix/auto-${Date.now()}`,
    prTitle: analysis.prTitle ?? `fix: auto-resolve ${error.category} error`,
    prBody,
  };
}
